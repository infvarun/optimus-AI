"""A tiny fake OpenAI-compatible /v1/chat/completions server for testing
without a real model. It is scripted, not intelligent:

  1st call in a conversation -> asks to call dynatrace_problems(app="csp")
  after a tool result         -> streams a short canned diagnosis

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

ANSWER = (
    "Clinical Supply Portal has an open Dynatrace problem P-2511734 (sample data): failure rate up, "
    "root cause csp-orders-db. Likely DB pool exhaustion after release 2.14.0 (CHG0045817). See KB0011201."
)
VERBOSE = os.environ.get("MOCK_VERBOSE") == "1"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # quiet
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
        if VERBOSE:
            print(self.path, raw[:2000])
        if not self.path.endswith("/chat/completions"):
            return self._json(404, {"error": "not found"})
        req = json.loads(raw or b"{}")
        saw_tool_result = any(m.get("role") == "tool" for m in req.get("messages", []))
        base = {"id": "chatcmpl-mock", "object": "chat.completion.chunk", "created": int(time.time()), "model": req.get("model")}

        def chunk(delta: dict, finish: str | None = None) -> dict:
            return {**base, "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}

        if not saw_tool_result:
            chunks = [
                chunk({"role": "assistant", "content": None, "tool_calls": [
                    {"index": 0, "id": "call_1", "type": "function", "function": {"name": "dynatrace_problems", "arguments": ""}}]}),
                chunk({"tool_calls": [{"index": 0, "function": {"arguments": json.dumps({"app": "csp"})}}]}),
                chunk({}, "tool_calls"),
            ]
        else:
            chunks = [chunk({"role": "assistant", "content": ""})]
            chunks += [chunk({"content": w}) for w in re.findall(r"\S+\s*", ANSWER)]
            chunks.append(chunk({}, "stop"))
        chunks.append({**base, "choices": [], "usage": {"prompt_tokens": 100, "completion_tokens": 20, "total_tokens": 120}})

        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.end_headers()
        for c in chunks:
            self.wfile.write(f"data: {json.dumps(c)}\n\n".encode())
            self.wfile.flush()
            time.sleep(0.015)
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
