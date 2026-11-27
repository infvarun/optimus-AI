"""Session management and the agent loop, on top of the Copilot SDK (Python, v2 API).

One user message becomes one *run*. Inside a run:

1. The Copilot runtime does the inner loop: model -> tool calls -> results -> model ...
   until the model stops calling tools (or calls the terminal ``submit_resolution``).
2. The harness decides whether the run is finished:
   - ``submit_resolution`` was called: finished (outcome ``resolved``).
   - The model replied in plain text (an answer, a draft, or a question back to the
     user): finished (outcome ``answered``). That is a normal end, not a failure.
   - The model stopped with no text, or stopped partway through its own plan with
     a statement rather than an answer: nudge it once to continue or finish
     (``continue`` event, internal). Text it writes after a nudge is held back and
     dropped if it only repeats what it already said.
   - Plan mode: if the plan was written but ``submit_resolution`` wasn't called, the
     harness completes it as ``plan_ready`` itself.
3. Guards: at most ``max_tool_calls`` tool calls and ``turn_timeout_seconds``
   wall-clock per run; on breach the run is aborted and a ``limit`` event sent.

Everything is streamed to the client as a small set of JSON events (see README).
"""

from __future__ import annotations

import asyncio
import contextlib
import difflib
import re
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

Decide what kind of request it is:
A. A question or a draft (what changed, is X healthy, who owns X, write a status update): look up the facts
   with the tools, then answer in plain text. Do not call update_plan or submit_resolution.
B. An investigation (errors, slowness, outage, "what's going on and what should we do"): work through it,
   then finish by calling submit_resolution once.

How to investigate (think, act, observe, repeat):
1. Call update_plan first with the goal and 3-6 steps. Mark steps done as you go.
   Keep key facts and ids in context.md with workspace_write.
2. Identify the application with servicenow_cmdb_lookup (type, owning team, on-call, Dynatrace entity).
3. Gather evidence: dynatrace_problems and dynatrace_service_health, then dynatrace_log_search to confirm.
   servicenow_change_search for recent changes, servicenow_incident_search for existing or similar incidents.
4. Form a hypothesis and test it with another tool call. If a result contradicts it, revise and keep going.
5. Before recommending remediation, use servicenow_kb_search and follow the approved article.
6. If a tool returns an error, read it, fix the arguments and try again.
7. Call submit_resolution with status, summary, likely_cause, confidence (low, medium or high),
   evidence ids (P-..., INC..., CHG..., KB...), next_steps and owner.

Writing the answer:
- Answer once. Never repeat something you already said in this conversation.
- Be crisp: short Markdown with bold labels, bullets, and a table when listing several items.
- Use ticket ids exactly as the tools return them.
- For times, use the *Relative fields the tools return (e.g. "15 min ago"). Don't work times out from timestamps.
- Don't end with offers like "Would you like me to...". Ask a question only if you cannot continue without
  the answer, e.g. which application the user means.

Rules:
- You only have read-only tools. Never claim to have restarted, rolled back, or changed anything. If a change is
  needed, say what a human should do, which change type it needs, and who approves (the owning team's lead).
- For SaaS and COTS apps, say when the fix is the vendor's and the step is to raise a vendor case.
- If a tool result contains "stub": true, mention once that the data is sample data.
""".strip()

PLAN_MODE_PREFIX = (
    "[PLAN MODE] Do not run the full investigation yet. Identify the application if needed, then write a "
    "thorough plan with update_plan (goal, ordered steps, what each step will check and why) and note open "
    "questions in context.md. Then call submit_resolution with status 'plan_ready' and a short summary of the plan. "
    "The user will review it and tell you to proceed.\n\nRequest: "
)

NUDGE = (
    "You stopped partway through your plan. Continue with the next step using the tools. If you already have "
    "what you need, finish now: call submit_resolution for an investigation, or give your final answer. "
    "Do not repeat anything you already said."
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


def _with_context(prompt: str, context: dict | None) -> str:
    if not context:
        return prompt
    parts = [f"{k}: {v}" for k, v in context.items() if v]
    return f"[The user is looking at {'; '.join(parts)}]\n{prompt}" if parts else prompt


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", "", re.sub(r"\s+", " ", text.lower())).strip()


def _is_repeat(new: str, old: str) -> bool:
    """True when a post-nudge reply adds nothing: empty, or mostly the same words as before."""
    a, b = _norm(new), _norm(old)
    if not a:
        return True
    if not b:
        return False
    return a in b or difflib.SequenceMatcher(None, a, b, autojunk=False).ratio() > 0.6


def _mid_plan(plan: dict | None, answer: str) -> bool:
    """The model wrote a plan this run, left steps open, and stopped with a statement rather than a
    question. That is the 'stopped early' pattern worth one nudge. A question back to the user is not."""
    if not plan or answer.rstrip().endswith("?"):
        return False
    steps = plan.get("steps") or []
    return any((st or {}).get("status", "pending") in ("pending", "in_progress") for st in steps)


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

    async def send_turn(
        self, sid: str, prompt: str, mode: Mode = "auto", context: dict | None = None
    ) -> AsyncIterator[dict]:
        """Run the agent on one user message; yield harness events until it finishes.

        ``context`` is what the user is looking at in the console (e.g. ``{"app": ..., "incident": ...}``),
        so "this app" in a prompt resolves without a question back.
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
        answer = ""  # the model's last plain-text reply in this run
        plan_this_run = False
        try:
            yield {"type": "run_start", "mode": mode, "limits": {
                "maxToolCalls": cfg.max_tool_calls, "maxContinues": cfg.max_continues,
                "timeoutSeconds": cfg.turn_timeout_seconds}}
            message = _with_context(prompt, context)
            if mode == "plan":
                message = PLAN_MODE_PREFIX + message
            while True:
                await entry.session.send(message)
                running = True
                errored = False
                # After a nudge, hold text back until we know it isn't a repeat.
                held: list[dict] | None = [] if continues else None
                text_after_tools = ""
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
                        text_after_tools = ""
                        pending_args[item["toolCallId"]] = (item["toolName"], item["arguments"])
                        if held:
                            for h in held:
                                yield h
                        held = None
                    elif kind == "error":
                        errored = True
                    elif kind == "message":
                        text_after_tools = item["content"]
                    if held is not None and kind in ("delta", "message"):
                        held.append(item)
                        continue
                    yield item
                    if kind == "tool_end" and item["success"]:
                        name, args = pending_args.pop(item["toolCallId"], ("", None))
                        if name == "update_plan" and isinstance(args, dict):
                            entry.plan = args
                            plan_this_run = True
                            yield {"type": "plan", "file": PLAN_FILE, **args}
                        elif name == "workspace_write" and isinstance(args, dict):
                            yield {"type": "workspace", "file": args.get("name")}
                        elif name == "submit_resolution" and isinstance(args, dict):
                            entry.resolution = args
                            yield {"type": "resolution", **args}
                    if kind == "tool_start" and tool_calls > cfg.max_tool_calls:
                        outcome = "max_tool_calls"
                        break

                # Release held post-nudge text unless it only repeats the earlier answer.
                if held:
                    if _is_repeat(text_after_tools, answer):
                        text_after_tools = ""
                    else:
                        for h in held:
                            yield h
                if text_after_tools.strip():
                    answer = text_after_tools

                if outcome in ("timeout", "max_tool_calls"):
                    yield {"type": "limit", "reason": outcome, "toolCalls": tool_calls, "steps": steps}
                    break
                if errored:
                    outcome = "error"
                    break
                if entry.resolution is not None:
                    outcome = "resolved"
                    break
                if mode == "plan" and plan_this_run:
                    # The plan exists; small models often forget the final call. Complete it for them.
                    entry.resolution = {"status": "plan_ready",
                                        "summary": answer or f"Plan written to {PLAN_FILE}.",
                                        "evidence": [], "next_steps": []}
                    yield {"type": "resolution", **entry.resolution}
                    outcome = "resolved"
                    break
                if answer and not (continues == 0 and _mid_plan(entry.plan if plan_this_run else None, answer)):
                    outcome = "answered"
                    break
                if continues >= cfg.max_continues:
                    outcome = "answered" if answer else "no_answer"
                    if not answer:
                        yield {"type": "limit", "reason": "max_continues", "toolCalls": tool_calls, "steps": steps}
                    break
                continues += 1
                yield {"type": "continue", "attempt": continues, "of": cfg.max_continues}
                message = NUDGE
            yield {"type": "done", "outcome": outcome, "toolCalls": tool_calls, "steps": steps,
                   "continues": continues, **({"answer": answer} if outcome == "answered" else {})}
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
