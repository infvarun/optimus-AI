"""Session management and the agent loop, on top of the Copilot SDK (Python, v2 API).

One user message becomes one *run*. Inside a run:

1. The Copilot runtime does the inner loop: model -> tool calls -> results -> model ...
   until the model stops calling tools (or calls the terminal ``submit_resolution``).
2. The harness does the outer loop: if the model stopped without calling
   ``submit_resolution``, it is nudged to keep investigating or finish, up to
   ``max_continues`` times. Small local models often stop early; this is what
   makes them keep trying.
3. Guards: at most ``max_tool_calls`` tool calls and ``turn_timeout_seconds``
   wall-clock per run; on breach the run is aborted and a ``limit`` event sent.

Everything is streamed to the client as a small set of JSON events (see README).
"""

from __future__ import annotations

import asyncio
import contextlib
import shutil
import time
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from copilot import CopilotClient, PermissionRequest, RuntimeConnection
from copilot.rpc import PermissionDecisionApproveOnce, PermissionDecisionReject
from copilot.session import CopilotSession
from copilot.session_events import (
    AssistantMessageData,
    AssistantMessageDeltaData,
    AssistantReasoningDeltaData,
    AssistantTurnStartData,
    AssistantUsageData,
    PermissionRequestCustomTool,
    SessionCompactionCompleteData,
    SessionErrorData,
    SessionEvent,
    SessionIdleData,
    ToolExecutionCompleteData,
    ToolExecutionStartData,
)

from .config import HarnessConfig
from .tools import OPS_TOOLS
from .tools.agent import PLAN_FILE, make_agent_tools

Mode = Literal["auto", "plan"]

IDENTITY = (
    "You are Optimus, an enterprise application support and operations agent. You investigate issues "
    "autonomously with read-only tools until you find the likely cause and the right next steps."
)

OPS_INSTRUCTIONS = """
Context: applications are custom-built, SaaS or COTS. Each is owned by a support team with leads and members.
Observability is Dynatrace. ITSM (incidents, changes, requests, CMDB, knowledge) is ServiceNow.

How you work (think, act, observe, repeat):
1. For anything beyond a one-line question, call update_plan FIRST with the goal and 3-8 steps. Update it as
   steps start and finish. Keep key facts and ids in context.md with workspace_write so you don't lose them.
2. Identify the application with servicenow_cmdb_lookup (type, owning team, on-call, Dynatrace entity).
3. Gather evidence: dynatrace_problems and dynatrace_service_health, then dynatrace_log_search to confirm.
   servicenow_change_search for recent changes, servicenow_incident_search for existing or similar incidents.
4. Form a hypothesis and test it with another tool call. If a result contradicts it, revise and keep going.
5. Before recommending remediation, use servicenow_kb_search and follow the approved article.
6. If a tool returns an error, read it, fix the arguments and try again. Don't give up after one failure.
7. Finish EVERY request by calling submit_resolution exactly once, with evidence ids (P-..., INC..., CHG..., KB...).

Rules:
- You only have read-only tools. Never claim to have restarted, rolled back, or changed anything. If a change is
  needed, say what a human should do, which change type it needs, and who approves (the owning team's lead).
- For SaaS and COTS apps, say when the fix is the vendor's and the step is to raise a vendor case.
- If a tool result contains "stub": true, say the data is sample data.
""".strip()

PLAN_MODE_PREFIX = (
    "[PLAN MODE] Do not run the full investigation yet. Identify the application if needed, then write a "
    "thorough plan with update_plan (goal, ordered steps, what each step will check and why) and note open "
    "questions in context.md. Then call submit_resolution with status 'plan_ready' and a short summary of the plan. "
    "The user will review it and tell you to proceed.\n\nRequest: "
)

NUDGE = (
    "You stopped without calling submit_resolution. If the investigation is not finished, continue: check your "
    "plan (workspace_read Plan.md), run the next step, and test your hypothesis with the tools. If you have enough "
    "evidence, call submit_resolution now."
)

MAX_TOOL_RESULT_CHARS = 4000
INTERNAL_TOOLS = {"update_plan", "workspace_write", "workspace_read", "workspace_list", "submit_resolution"}


class HttpError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def permission_policy(request: PermissionRequest, _invocation: Any):
    """Defense in depth: available_tools already hides built-ins, but refuse
    anything that isn't one of our own registered tools."""
    if isinstance(request, PermissionRequestCustomTool):
        return PermissionDecisionApproveOnce()
    return PermissionDecisionReject(feedback="This harness only allows its own tools.")


def map_event(ev: SessionEvent) -> dict | None:
    """Map SDK events to the small, stable set the harness streams to clients."""
    if ev.agent_id:  # sub-agent events; we don't use sub-agents
        return None
    d = ev.data
    match d:
        case AssistantTurnStartData():
            return {"type": "turn_start"}
        case AssistantReasoningDeltaData():
            return {"type": "thinking", "text": d.delta_content}
        case AssistantMessageDeltaData():
            return {"type": "delta", "text": d.delta_content}
        case AssistantMessageData():
            return {"type": "message", "content": d.content} if d.content else None
        case ToolExecutionStartData():
            return {
                "type": "tool_start",
                "toolCallId": d.tool_call_id,
                "toolName": d.tool_name,
                "arguments": d.arguments,
            }
        case ToolExecutionCompleteData():
            out: dict[str, Any] = {"type": "tool_end", "toolCallId": d.tool_call_id, "success": d.success}
            if d.result is not None:
                out["result"] = d.result.content[:MAX_TOOL_RESULT_CHARS]
            if d.error is not None:
                out["error"] = d.error.message
            return out
        case AssistantUsageData():
            return {"type": "usage", "data": d.to_dict()}
        case SessionCompactionCompleteData():
            return {"type": "compacted"}
        case SessionErrorData():
            return {"type": "error", "message": d.message}
    return None


@dataclass
class _Entry:
    session: CopilotSession
    workspace: Path
    created_at: float = field(default_factory=time.time)
    last_used: float = field(default_factory=time.time)
    busy: bool = False
    plan: dict | None = None
    resolution: dict | None = None


class SessionManager:
    def __init__(self, cfg: HarnessConfig):
        self.cfg = cfg
        # "empty" mode opts into features explicitly and needs its own storage dir
        # (session state); it won't touch the user's ~/.copilot.
        # BYOK: never pick up a developer's gh login or GITHUB_TOKEN by accident.
        self.client = CopilotClient(
            mode="empty",
            runtime=RuntimeConnection.for_default(base_directory=str(cfg.data_dir)),
            github={"use_logged_in_user": False},
        )
        self._sessions: dict[str, _Entry] = {}
        self._sweeper: asyncio.Task | None = None

    async def start(self) -> None:
        await self.client.start()
        self._sweeper = asyncio.create_task(self._sweep_loop())

    async def stop(self) -> None:
        if self._sweeper:
            self._sweeper.cancel()
        for sid in list(self._sessions):
            await self.delete(sid)
        await self.client.stop()

    def _inference(self) -> dict:
        inference: dict[str, Any] = {"default_provider": "byok", "providers": [self.cfg.provider]}
        if self.cfg.context_tokens:
            # Tell the runtime the real context window so it compacts long
            # investigations before the model server silently truncates them.
            out = min(self.cfg.max_output_tokens, self.cfg.context_tokens // 4)
            inference["models"] = [{
                "id": self.cfg.model,
                "provider": "byok",
                "max_context_window_tokens": self.cfg.context_tokens,
                "max_prompt_tokens": self.cfg.context_tokens - out,
                "max_output_tokens": out,
            }]
        return inference

    async def create(self) -> str:
        if len(self._sessions) >= self.cfg.max_sessions:
            raise HttpError(429, "Too many active sessions")
        sid = str(uuid.uuid4())
        workspace = self.cfg.data_dir / "workspaces" / sid
        session = await self.client.create_session(
            session_id=sid,
            model=self.cfg.model,
            working_directory=str(workspace.parent),
            system_message={
                "mode": "customize",
                "sections": {
                    "preamble": {"action": "replace", "content": IDENTITY},
                    "code_change_rules": {"action": "remove"},
                },
                "content": OPS_INSTRUCTIONS,
            },
            permissions={"on_request": permission_policy},
            # Only our own tools: no built-in shell, file edit, web fetch, etc.
            tools={"definitions": [*OPS_TOOLS, *make_agent_tools(workspace)], "available_tools": ["custom:*"]},
            inference=self._inference(),
            github={"capi": {"enabled": False}, "telemetry_enabled": False},
            events={"streaming": True},
            # Compact old context in the background as long investigations grow.
            state={"infinite_sessions": {"enabled": True}},
        )
        self._sessions[sid] = _Entry(session, workspace)
        return sid

    def list(self) -> list[dict]:
        iso = lambda t: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))  # noqa: E731
        return [
            {"id": sid, "createdAt": iso(e.created_at), "lastUsed": iso(e.last_used), "busy": e.busy}
            for sid, e in self._sessions.items()
        ]

    def state(self, sid: str) -> dict:
        e = self._get(sid)
        return {"id": sid, "busy": e.busy, "plan": e.plan, "resolution": e.resolution, "files": self.files(sid)}

    def files(self, sid: str) -> list[dict]:
        ws = self._get(sid).workspace
        return [{"name": f.name, "bytes": f.stat().st_size} for f in sorted(ws.glob("*.md"))] if ws.exists() else []

    def read_file(self, sid: str, name: str) -> str:
        ws = self._get(sid).workspace
        match = next((f for f in ws.glob("*.md") if f.name == name), None) if ws.exists() else None
        if not match:
            raise HttpError(404, "File not found")
        return match.read_text(encoding="utf-8")

    def assert_ready(self, sid: str) -> None:
        """Raise 404/409 before the caller commits to a streaming response."""
        if self._get(sid).busy:
            raise HttpError(409, "Session is already processing a message")

    async def send_turn(self, sid: str, prompt: str, mode: Mode = "auto") -> AsyncIterator[dict]:
        """Run the agent on one user message; yield harness events until it finishes.

        If the consumer stops iterating early (client disconnected), the run is aborted.
        """
        entry = self._get(sid)
        if entry.busy:
            raise HttpError(409, "Session is already processing a message")
        entry.busy = True
        entry.last_used = time.time()
        entry.resolution = None
        cfg = self.cfg

        queue: asyncio.Queue[dict | None] = asyncio.Queue()
        loop = asyncio.get_running_loop()
        pending_args: dict[str, tuple[str, Any]] = {}

        def on_event(ev: SessionEvent) -> None:
            mapped = map_event(ev)
            finished = isinstance(ev.data, (SessionIdleData, SessionErrorData)) and not ev.agent_id

            def push() -> None:
                if mapped:
                    queue.put_nowait(mapped)
                if finished:
                    queue.put_nowait(None)

            loop.call_soon_threadsafe(push)

        unsubscribe = entry.session.on(on_event)
        deadline = time.monotonic() + cfg.turn_timeout_seconds
        tool_calls = 0
        steps = 0
        continues = 0
        running = False
        outcome = "incomplete"
        try:
            yield {"type": "run_start", "mode": mode, "limits": {
                "maxToolCalls": cfg.max_tool_calls, "maxContinues": cfg.max_continues,
                "timeoutSeconds": cfg.turn_timeout_seconds}}
            message = (PLAN_MODE_PREFIX + prompt) if mode == "plan" else prompt
            while True:
                await entry.session.send(message)
                running = True
                errored = False
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0:
                        outcome = "timeout"
                        break
                    try:
                        item = await asyncio.wait_for(queue.get(), timeout=remaining)
                    except asyncio.TimeoutError:
                        outcome = "timeout"
                        break
                    if item is None:
                        running = False
                        break
                    kind = item["type"]
                    if kind == "turn_start":
                        steps += 1
                        item["step"] = steps
                    elif kind == "tool_start":
                        tool_calls += 1
                        pending_args[item["toolCallId"]] = (item["toolName"], item["arguments"])
                    elif kind == "error":
                        errored = True
                    yield item
                    if kind == "tool_end" and item["success"]:
                        name, args = pending_args.pop(item["toolCallId"], ("", None))
                        if name == "update_plan" and isinstance(args, dict):
                            entry.plan = args
                            yield {"type": "plan", "file": PLAN_FILE, **args}
                        elif name == "workspace_write" and isinstance(args, dict):
                            yield {"type": "workspace", "file": args.get("name")}
                        elif name == "submit_resolution" and isinstance(args, dict):
                            entry.resolution = args
                            yield {"type": "resolution", **args}
                    if kind == "tool_start" and tool_calls > cfg.max_tool_calls:
                        outcome = "max_tool_calls"
                        break

                if outcome in ("timeout", "max_tool_calls"):
                    yield {"type": "limit", "reason": outcome, "toolCalls": tool_calls, "steps": steps}
                    break
                if errored:
                    outcome = "error"
                    break
                if entry.resolution is not None:
                    outcome = "resolved"
                    break
                if continues >= cfg.max_continues:
                    outcome = "no_resolution"
                    yield {"type": "limit", "reason": "max_continues", "toolCalls": tool_calls, "steps": steps}
                    break
                continues += 1
                yield {"type": "continue", "attempt": continues, "of": cfg.max_continues}
                message = NUDGE
            yield {"type": "done", "outcome": outcome, "toolCalls": tool_calls, "steps": steps, "continues": continues}
        finally:
            unsubscribe()
            if running:
                with contextlib.suppress(Exception):
                    await entry.session.abort()
            entry.busy = False
            entry.last_used = time.time()

    async def abort(self, sid: str) -> None:
        await self._get(sid).session.abort()

    async def delete(self, sid: str) -> bool:
        entry = self._sessions.pop(sid, None)
        if not entry:
            return False
        with contextlib.suppress(Exception):
            await entry.session.disconnect()
        shutil.rmtree(entry.workspace, ignore_errors=True)
        return True

    def _get(self, sid: str) -> _Entry:
        entry = self._sessions.get(sid)
        if not entry:
            raise HttpError(404, "Session not found")
        return entry

    async def _sweep_loop(self) -> None:
        while True:
            await asyncio.sleep(60)
            cutoff = time.time() - self.cfg.session_idle_minutes * 60
            for sid, e in list(self._sessions.items()):
                if not e.busy and e.last_used < cutoff:
                    await self.delete(sid)
