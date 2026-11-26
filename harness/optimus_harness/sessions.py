"""Session management on top of the Copilot SDK (Python, v2 API)."""

from __future__ import annotations

import asyncio
import contextlib
import tempfile
import time
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from copilot import CopilotClient, PermissionRequest, RuntimeConnection
from copilot.rpc import PermissionDecisionApproveOnce, PermissionDecisionReject
from copilot.session import CopilotSession
from copilot.session_events import (
    AssistantMessageData,
    AssistantMessageDeltaData,
    AssistantTurnStartData,
    AssistantUsageData,
    PermissionRequestCustomTool,
    SessionErrorData,
    SessionEvent,
    SessionIdleData,
    ToolExecutionCompleteData,
    ToolExecutionStartData,
)

from .config import HarnessConfig
from .tools import OPS_TOOLS

OPS_INSTRUCTIONS = """
You are Optimus, an enterprise application support and operations assistant.
Applications are custom-built, SaaS or COTS. Each is owned by a support team with leads and members.
Observability is Dynatrace. ITSM (incidents, changes, requests, CMDB, knowledge) is ServiceNow.

How to work:
- Identify the application first with servicenow_cmdb_lookup (type, owning team, on-call, Dynatrace entity).
- Diagnose before you prescribe: check dynatrace_problems and dynatrace_service_health, then confirm with
  dynatrace_log_search. Check servicenow_change_search for a recent change and servicenow_incident_search for
  an existing or similar past incident.
- Before recommending remediation, use servicenow_kb_search and follow the approved article. Cite KB, CHG,
  INC and Dynatrace problem ids (P-...) you relied on.
- For SaaS and COTS apps, say when the fix is the vendor's and the step is to raise a vendor case.
- You only have read-only tools. Never claim to have restarted, rolled back, or changed anything.
  If a change is needed, say what a human should do, which change type it needs, and who approves
  (the owning team's lead).
- Be concise. Lead with the likely cause and your confidence, then evidence, then next steps and owner.
- If a tool result contains "stub": true, say the data is sample data.
""".strip()

MAX_TOOL_RESULT_CHARS = 4000


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
    return PermissionDecisionReject(feedback="This harness only allows its own read-only ops tools.")


def map_event(ev: SessionEvent) -> dict | None:
    """Map SDK events to the small, stable set the harness streams to clients."""
    if ev.agent_id:  # sub-agent events; we don't use sub-agents
        return None
    d = ev.data
    match d:
        case AssistantTurnStartData():
            return {"type": "turn_start"}
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
        case SessionErrorData():
            return {"type": "error", "message": d.message}
    return None


@dataclass
class _Entry:
    session: CopilotSession
    created_at: float = field(default_factory=time.time)
    last_used: float = field(default_factory=time.time)
    busy: bool = False


class SessionManager:
    def __init__(self, cfg: HarnessConfig):
        self.cfg = cfg
        # BYOK: never pick up a developer's gh login or GITHUB_TOKEN by accident.
        # "empty" mode opts into features explicitly and needs its own storage dir
        # (session state); it won't touch the user's ~/.copilot.
        self.client = CopilotClient(
            mode="empty",
            runtime=RuntimeConnection.for_default(base_directory=str(cfg.data_dir)),
            github={"use_logged_in_user": False},
        )
        self._sessions: dict[str, _Entry] = {}
        self._workdir = tempfile.mkdtemp(prefix="optimus-harness-")
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

    async def create(self) -> str:
        if len(self._sessions) >= self.cfg.max_sessions:
            raise HttpError(429, "Too many active sessions")
        sid = str(uuid.uuid4())
        session = await self.client.create_session(
            session_id=sid,
            model=self.cfg.model,
            working_directory=self._workdir,
            system_message={
                "mode": "customize",
                "sections": {"code_change_rules": {"action": "remove"}},
                "content": OPS_INSTRUCTIONS,
            },
            permissions={"on_request": permission_policy},
            # Only our own tools: no built-in shell, file edit, web fetch, etc.
            tools={"definitions": OPS_TOOLS, "available_tools": ["custom:*"]},
            inference={"default_provider": "byok", "providers": [self.cfg.provider]},
            github={"capi": {"enabled": False}, "telemetry_enabled": False},
            events={"streaming": True},
        )
        self._sessions[sid] = _Entry(session)
        return sid

    def list(self) -> list[dict]:
        iso = lambda t: time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))  # noqa: E731
        return [
            {"id": sid, "createdAt": iso(e.created_at), "lastUsed": iso(e.last_used), "busy": e.busy}
            for sid, e in self._sessions.items()
        ]

    def assert_ready(self, sid: str) -> None:
        """Raise 404/409 before the caller commits to a streaming response."""
        if self._get(sid).busy:
            raise HttpError(409, "Session is already processing a message")

    async def send_turn(self, sid: str, prompt: str) -> AsyncIterator[dict]:
        """Send one user turn; yield harness events until the agent is idle.

        If the consumer stops iterating early (client disconnected), the turn is aborted.
        """
        entry = self._get(sid)
        if entry.busy:
            raise HttpError(409, "Session is already processing a message")
        entry.busy = True
        entry.last_used = time.time()

        queue: asyncio.Queue[dict | None] = asyncio.Queue()
        loop = asyncio.get_running_loop()
        sent = False  # ignore idle events that arrive before our send() returns

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
        completed = False
        try:
            await entry.session.send(prompt)
            sent = True
            while (item := await queue.get()) is not None:
                yield item
            completed = True
            yield {"type": "done"}
        finally:
            unsubscribe()
            if sent and not completed:
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
