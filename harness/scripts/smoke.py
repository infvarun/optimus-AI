"""Smoke test against a RUNNING harness (python -m optimus_harness).

Creates a session, sends one question, prints the stream, and exits:
  0  the model called at least one tool and answered
  2  it answered without calling any tool (common with small local models)
  1  error or no answer

  python scripts/smoke.py
  python scripts/smoke.py "Is LabTrack LIMS healthy? Any changes coming up?"
"""

from __future__ import annotations

import json
import os
import sys

import httpx

BASE = os.environ.get("HARNESS_URL") or f"http://127.0.0.1:{os.environ.get('PORT', '8787')}"
HEADERS = {"authorization": f"Bearer {os.environ['HARNESS_API_TOKEN']}"} if os.environ.get("HARNESS_API_TOKEN") else {}
PROMPT = sys.argv[1] if len(sys.argv) > 1 else (
    "Users say the Clinical Supply Portal is throwing errors. What's going on and what should we do?"
)


def main() -> int:
    with httpx.Client(base_url=BASE, headers=HEADERS, timeout=httpx.Timeout(10, read=300)) as c:
        print("harness:", c.get("/healthz").json())
        sid = c.post("/api/sessions").raise_for_status().json()["id"]
        print("session:", sid, "\nprompt:", PROMPT, "\n")

        tools, answer, error = 0, "", ""
        with c.stream("POST", f"/api/sessions/{sid}/messages", json={"prompt": PROMPT}) as r:
            r.raise_for_status()
            for line in r.iter_lines():
                if not line.startswith("data: "):
                    continue
                e = json.loads(line[6:])
                match e["type"]:
                    case "delta":
                        print(e["text"], end="", flush=True)
                    case "tool_start":
                        tools += 1
                        print(f"\n[tool] {e['toolName']} {json.dumps(e['arguments'])}")
                    case "tool_end":
                        print("[tool] ok" if e["success"] else f"[tool] FAILED {e.get('error', '')}")
                    case "message":
                        answer = e["content"]
                    case "error":
                        error = e["message"]
                        print(f"\n[error] {error}", file=sys.stderr)
        c.delete(f"/api/sessions/{sid}")

    print(f"\n\n--- tools called: {tools}, answer: {'yes' if answer else 'no'}" + (f", error: {error}" if error else ""))
    if not answer or error:
        return 1
    if tools == 0:
        print("WARNING: the model answered without calling any tool. Small models often do this; "
              "try a larger tool-capable model.")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
