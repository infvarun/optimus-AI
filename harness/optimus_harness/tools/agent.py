"""Per-session agent tools: plan, scratch workspace, and the finishing call.

These are created per session because they write into that session's own
workspace folder (``<data_dir>/workspaces/<session id>/``). They never touch
anything outside it: file names are restricted to ``<name>.md`` with no paths.

- ``update_plan``        writes Plan.md (goal + steps with status). The harness
                         streams each update to the console as a ``plan`` event.
- ``workspace_write``    writes scratch notes such as context.md, so long
- ``workspace_read``     investigations can keep findings outside the model's
- ``workspace_list``     context window and re-read them later.
- ``submit_resolution``  ends the agent's run with a structured result. It is a
                         terminal tool: a successful call stops the loop.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional

from copilot import ToolInvocation, define_tool
from pydantic import BaseModel, Field

PLAN_FILE = "Plan.md"
NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,39}\.md$")
MAX_FILE_BYTES = 64 * 1024
MAX_FILES = 20

StepStatus = Literal["pending", "in_progress", "done", "skipped", "blocked"]
ResolutionStatus = Literal["resolved", "needs_human", "needs_info", "answered", "plan_ready"]

_STATUS_MARK = {"pending": "[ ]", "in_progress": "[~]", "done": "[x]", "skipped": "[-]", "blocked": "[!]"}


class PlanStep(BaseModel):
    title: str = Field(description="What this step does, e.g. 'Check Dynatrace problems for csp'")
    status: StepStatus = "pending"
    note: Optional[str] = Field(default=None, description="Short result or reason, once known")


class UpdatePlanParams(BaseModel):
    goal: str = Field(description="One sentence: what the investigation must find out or achieve")
    steps: list[PlanStep] = Field(min_length=1, max_length=20, description="The FULL list of steps, every time")


class WorkspaceWriteParams(BaseModel):
    name: str = Field(description="File name like 'context.md' or 'findings.md' (letters, digits, - and _ only)")
    content: str = Field(description="Full new content of the file (markdown)")
    append: bool = Field(default=False, description="Append to the file instead of replacing it")


class WorkspaceReadParams(BaseModel):
    name: str = Field(description="File name, e.g. 'context.md' or 'Plan.md'")


class SubmitResolutionParams(BaseModel):
    status: ResolutionStatus = Field(
        description="resolved: cause found and next steps clear. needs_human: a person must act or decide. "
        "needs_info: you need more information from the user. answered: a simple question was answered. "
        "plan_ready: (plan mode) the plan is written and waits for approval."
    )
    summary: str = Field(description="2-4 sentence answer for the user")
    likely_cause: Optional[str] = None
    confidence: Optional[Literal["low", "medium", "high"]] = None
    evidence: list[str] = Field(default_factory=list, description="Facts with their ids: P-..., INC..., CHG..., KB...")
    next_steps: list[str] = Field(default_factory=list, description="Concrete actions, each with who should do it")
    owner: Optional[str] = Field(default=None, description="Owning team / assignment group, if known")


def render_plan(p: UpdatePlanParams) -> str:
    lines = [f"# Plan", "", f"**Goal:** {p.goal}", "", f"_Updated {datetime.now(timezone.utc):%Y-%m-%d %H:%M UTC}_", ""]
    for i, s in enumerate(p.steps, 1):
        lines.append(f"{i}. {_STATUS_MARK[s.status]} {s.title}" + (f" — {s.note}" if s.note else ""))
    return "\n".join(lines) + "\n"


def make_agent_tools(workspace: Path) -> list:
    workspace.mkdir(parents=True, exist_ok=True)

    def path_for(name: str) -> Path | str:
        if not NAME_RE.match(name):
            return f"Invalid file name {name!r}. Use a plain name like 'context.md' (no folders)."
        return workspace / name

    def update_plan(params: UpdatePlanParams) -> dict:
        (workspace / PLAN_FILE).write_text(render_plan(params), encoding="utf-8")
        counts: dict[str, int] = {}
        for s in params.steps:
            counts[s.status] = counts.get(s.status, 0) + 1
        return {"ok": True, "file": PLAN_FILE, "steps": len(params.steps), "byStatus": counts}

    def workspace_write(params: WorkspaceWriteParams) -> dict:
        p = path_for(params.name)
        if isinstance(p, str):
            return {"ok": False, "error": p}
        if p.name == PLAN_FILE:
            return {"ok": False, "error": "Use update_plan to change Plan.md."}
        existing = [f for f in workspace.glob("*.md")]
        if not p.exists() and len(existing) >= MAX_FILES:
            return {"ok": False, "error": f"Workspace is full ({MAX_FILES} files). Reuse or extend an existing file."}
        new = (p.read_text(encoding="utf-8") if params.append and p.exists() else "") + params.content
        if len(new.encode()) > MAX_FILE_BYTES:
            return {"ok": False, "error": f"File would exceed {MAX_FILE_BYTES // 1024} KB. Summarise it instead."}
        p.write_text(new, encoding="utf-8")
        return {"ok": True, "file": p.name, "bytes": len(new.encode())}

    def workspace_read(params: WorkspaceReadParams) -> dict:
        p = path_for(params.name)
        if isinstance(p, str):
            return {"ok": False, "error": p}
        if not p.exists():
            return {"ok": False, "error": f"{params.name} does not exist.", "files": sorted(f.name for f in workspace.glob('*.md'))}
        return {"ok": True, "file": p.name, "content": p.read_text(encoding="utf-8")}

    def workspace_list(_inv: ToolInvocation) -> dict:
        return {"files": [{"name": f.name, "bytes": f.stat().st_size} for f in sorted(workspace.glob("*.md"))]}

    def submit_resolution(params: SubmitResolutionParams) -> dict:
        return {"ok": True, "status": params.status}

    return [
        define_tool(
            "update_plan",
            description=(
                "Create or update the investigation plan (saved as Plan.md). For any task that needs more than two or "
                "three tool calls, call this FIRST with the goal and steps, then call it again whenever a step starts, "
                "finishes or the plan changes. Always send the full step list."
            ),
            params_type=UpdatePlanParams,
            handler=lambda p, _inv: update_plan(p),
            skip_permission=True,
        ),
        define_tool(
            "workspace_write",
            description=(
                "Save scratch notes to this session's workspace, e.g. context.md with key facts and ids you have found. "
                "Use it in long investigations so you don't lose findings, then read it back later."
            ),
            params_type=WorkspaceWriteParams,
            handler=lambda p, _inv: workspace_write(p),
            skip_permission=True,
        ),
        define_tool(
            "workspace_read",
            description="Read a file from this session's workspace (e.g. context.md or Plan.md).",
            params_type=WorkspaceReadParams,
            handler=lambda p, _inv: workspace_read(p),
            skip_permission=True,
        ),
        define_tool(
            "workspace_list",
            description="List the files in this session's workspace.",
            handler=workspace_list,
            skip_permission=True,
        ),
        define_tool(
            "submit_resolution",
            description=(
                "Finish your work on the user's request with a structured result. Call this exactly once, at the end, "
                "for every request, including simple questions (status 'answered'). Do not call it before you have "
                "gathered the evidence."
            ),
            params_type=SubmitResolutionParams,
            handler=lambda p, _inv: submit_resolution(p),
            skip_permission=True,
            is_terminal=True,
        ),
    ]
