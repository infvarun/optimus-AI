"""A scripted fake OpenAI-compatible /v1/chat/completions server.

It is not intelligent. It replays a multi-step investigation so the whole agent
loop can be tested without a real model, including the awkward parts that real
local models do:

  step 1  thinks, then writes a plan              (update_plan)
  step 2  identifies the app                       (servicenow_cmdb_lookup)
  step 3  calls a tool with WRONG arguments        (dynatrace_problems {"application": ...})
  step 4  reads the error, retries + a 2nd call    (dynatrace_problems + servicenow_change_search, parallel)
  step 5  saves findings to scratch                (workspace_write context.md)
  step 6  updates the plan, checks the runbook     (update_plan + servicenow_kb_search)
  step 7  stops early with plain text, NO submit   -> the harness nudges it
  step 8  after the nudge, finishes                (submit_resolution)

In plan mode ("[PLAN MODE]" in the request) it writes a plan and submits status plan_ready.

Other scripts, picked by words in the user messages (for tests):
  "status update"  looks up changes, then answers in plain text (no resolution; a normal "answered" finish)
  "REPEAT"         writes a plan, stops early with text, and after the nudge repeats the same text
  "NOSUBMIT"       (plan mode) writes the plan but never calls submit_resolution
Thinking is streamed in the `reasoning` delta field, the way Ollama sends it.

Run:  python scripts/mock_llm.py
Then: LLM_PROVIDER_TYPE=openai LLM_BASE_URL=http://127.0.0.1:11435/v1 LLM_MODEL=mock-1
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERBOSE = os.environ.get("MOCK_VERBOSE") == "1"
DELAY = float(os.environ.get("MOCK_DELAY", "0.01"))

PLAN = {
    "goal": "Find why Clinical Supply Portal returns errors and what to do",
    "steps": [
        {"title": "Identify the app, owner and Dynatrace entity", "status": "in_progress"},
        {"title": "Check Dynatrace problems and service health", "status": "pending"},
        {"title": "Check recent changes and incidents", "status": "pending"},
        {"title": "Confirm in logs and find the runbook", "status": "pending"},
    ],
}

RESOLUTION = {
    "status": "resolved",
    "summary": "Clinical Supply Portal is failing because its DB connection pool is exhausted, most likely due to "
    "release 2.14.0 deployed about 30 minutes ago (sample data).",
    "likely_cause": "Connection leak in release 2.14.0 (CHG0045817) exhausting the orders DB pool",
    "confidence": "medium",
    "evidence": ["P-2511734 failure rate increase, root cause csp-orders-db", "CHG0045817 deployed 2.14.0",
                 "INC0103990 same symptom after 2.13", "KB0011201 pool exhausted runbook"],
    "next_steps": ["Order Management Support (lead Priya Raman): approve rollback under CHG0045817 backout plan",
                   "On-call tbecker: update INC0104521 with findings"],
    "owner": "APP-ORDER-MGMT-L2",
}


def script(req: dict) -> tuple[str, list[tuple[str, dict]] | str]:
    """Return (thinking, tool_calls | final_text) for this point in the conversation."""
    msgs = req.get("messages", [])
    users = [m for m in msgs if m.get("role") == "user"]
    plan_mode = any("[PLAN MODE]" in str(m.get("content")) for m in users)
    nudged = any("You stopped partway" in str(m.get("content")) for m in users)
    n = sum(1 for m in msgs if m.get("role") == "assistant" and m.get("tool_calls"))
    last_tool = next((str(m.get("content")) for m in reversed(msgs) if m.get("role") == "tool"), "")

    first = " ".join(str(m.get("content")) for m in users)  # the runtime may add its own user messages

    if "NOSUBMIT" in first:
        if n == 0:
            return "Plan mode: write the plan.", [("update_plan", PLAN)]
        return "Done.", "The plan is ready for your review."
    if "status update" in first:
        if n == 0:
            return "I need the recent changes first.", [("servicenow_change_search", {"app": "csp"})]
        seen = "context" if "[The user is looking at" in first else "no context"
        return "Now write it.", f"**Status:** Clinical Supply Portal errors after release 2.14.0 ({seen})."
    if "REPEAT" in first:
        if n == 0:
            return "Plan first.", [("update_plan", PLAN)]
        return "Answering.", "Pool exhaustion after release 2.14.0 is the likely cause."

    if plan_mode:
        if n == 0:
            return "Plan mode: I should only write the plan.", [("update_plan", PLAN)]
        return "Plan written.", [("submit_resolution", {"status": "plan_ready", "summary": "4-step plan written to Plan.md."})]

    if n == 0:
        return "Users report errors. I need a plan before I start.", [("update_plan", PLAN)]
    if n == 1:
        return "First identify the application.", [("servicenow_cmdb_lookup", {"app": "csp"})]
    if n == 2:
        return "Now check Dynatrace for problems.", [("dynatrace_problems", {"application": "csp"})]
    if n == 3:
        assert "Invalid tool arguments" in last_tool or "app" in last_tool, last_tool
        return ("The call failed: the parameter is 'app', not 'application'. Retry, and check changes at the same time.",
                [("dynatrace_problems", {"app": "csp"}), ("servicenow_change_search", {"app": "csp"})])
    if n == 4:
        return "Save what I know so far.", [("workspace_write", {"name": "context.md", "content":
                "- P-2511734 failure rate, root cause csp-orders-db\n- CHG0045817 release 2.14.0, 30 min ago\n"})]
    if n == 5:
        progress = {**PLAN, "steps": [{**s, "status": "done"} for s in PLAN["steps"][:3]]
                    + [{**PLAN["steps"][3], "status": "in_progress"}]}
        return "Hypothesis: pool exhaustion after the release. Update the plan and find the runbook.", [
            ("update_plan", progress), ("servicenow_kb_search", {"query": "db connection pool exhausted", "app": "csp"})]
    if not nudged:
        return "I think I'm done.", "It looks like a DB pool issue after the release."
    return "I was asked to finish properly.", [("submit_resolution", RESOLUTION)]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        if VERBOSE:
            super().log_message(*args)

    def _json(self, code: int, obj: dict) -> None:
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.endswith("/models"):
            return self._json(200, {"object": "list", "data": [{"id": "mock-1", "object": "model"}]})
        self._json(404, {"error": "not found"})

    def do_POST(self):
        raw = self.rfile.read(int(self.headers.get("content-length") or 0))
        if not self.path.endswith("/chat/completions"):
            return self._json(404, {"error": "not found"})
        req = json.loads(raw or b"{}")
        thinking, action = script(req)
        if VERBOSE:
            print("->", action if isinstance(action, str) else [a[0] for a in action])
        base = {"id": "chatcmpl-mock", "object": "chat.completion.chunk", "created": int(time.time()), "model": req.get("model")}

        def chunk(delta: dict, finish: str | None = None) -> dict:
            return {**base, "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}

        chunks = [chunk({"role": "assistant", "content": ""})]
        chunks += [chunk({"reasoning": w}) for w in re.findall(r"\S+\s*", thinking)]
        if isinstance(action, str):
            chunks += [chunk({"content": w}) for w in re.findall(r"\S+\s*", action)]
            chunks.append(chunk({}, "stop"))
        else:
            for i, (name, args) in enumerate(action):
                chunks.append(chunk({"tool_calls": [{"index": i, "id": f"call_{time.time_ns()}_{i}", "type": "function",
                                                     "function": {"name": name, "arguments": ""}}]}))
                chunks.append(chunk({"tool_calls": [{"index": i, "function": {"arguments": json.dumps(args)}}]}))
            chunks.append(chunk({}, "tool_calls"))
        chunks.append({**base, "choices": [], "usage": {"prompt_tokens": 100, "completion_tokens": 20, "total_tokens": 120}})

        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.end_headers()
        for c in chunks:
            self.wfile.write(f"data: {json.dumps(c)}\n\n".encode())
            self.wfile.flush()
            time.sleep(DELAY)
        self.wfile.write(b"data: [DONE]\n\n")


def serve(port: int = 11435, background: bool = False) -> ThreadingHTTPServer:
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    if background:
        threading.Thread(target=server.serve_forever, daemon=True).start()
    else:
        print(f"mock OpenAI listening on http://127.0.0.1:{port}/v1")
        server.serve_forever()
    return server


if __name__ == "__main__":
    serve(int(os.environ.get("MOCK_PORT", "11435")))
