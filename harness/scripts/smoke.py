"""Smoke test against a RUNNING harness (python -m optimus_harness).

Creates a session, sends one question, prints the stream, and exits:
  0  the agent called tools and finished with submit_resolution
  2  it finished without calling any ops tool, or never submitted a resolution
  1  error or no answer

  python scripts/smoke.py
  python scripts/smoke.py "Is LabTrack LIMS healthy? Any changes coming up?"
  python scripts/smoke.py --plan            # plan mode: writes Plan.md and stops
  SHOW_THINKING=0 python scripts/smoke.py   # hide the model's thinking
"""

from __future__ import annotations

import json
import os
import sys

import httpx

BASE = os.environ.get("HARNESS_URL") or f"http://127.0.0.1:{os.environ.get('PORT', '8787')}"
HEADERS = {"authorization": f"Bearer {os.environ['HARNESS_API_TOKEN']}"} if os.environ.get("HARNESS_API_TOKEN") else {}
ARGS = [a for a in sys.argv[1:] if a != "--plan"]
MODE = "plan" if "--plan" in sys.argv else "auto"
SHOW_THINKING = os.environ.get("SHOW_THINKING", "1") == "1"
PROMPT = ARGS[0] if ARGS else (
    "Users say the Clinical Supply Portal is throwing errors. What's going on and what should we do?"
)


INTERNAL = {"update_plan", "workspace_write", "workspace_read", "workspace_list", "submit_resolution"}


def main() -> int:
    with httpx.Client(base_url=BASE, headers=HEADERS, timeout=httpx.Timeout(10, read=300)) as c:
        print("harness:", c.get("/healthz").json())
        sid = c.post("/api/sessions").raise_for_status().json()["id"]
        print("session:", sid, "\nprompt:", PROMPT, "\n")

        tools, error, resolution, outcome, thinking = 0, "", None, "", False
        with c.stream("POST", f"/api/sessions/{sid}/messages", json={"prompt": PROMPT, "mode": MODE}) as r:
            r.raise_for_status()
            for line in r.iter_lines():
                if not line.startswith("data: "):
                    continue
                e = json.loads(line[6:])
                t = e["type"]
                if t != "thinking" and thinking:
                    print("\033[0m")
                    thinking = False
                match t:
                    case "turn_start":
                        print(f"\n── step {e['step']} ──")
                    case "thinking" if SHOW_THINKING:
                        if not thinking:
                            print("\033[2m(thinking) ", end="")
                            thinking = True
                        print(e["text"], end="", flush=True)
                    case "delta":
                        print(e["text"], end="", flush=True)
                    case "tool_start":
                        if e["toolName"] not in INTERNAL:
                            tools += 1
                        print(f"[tool] {e['toolName']} {json.dumps(e['arguments'])[:200]}")
                    case "tool_end":
                        print("[tool] ok" if e["success"] else f"[tool] FAILED: {(e.get('result') or e.get('error') or '')[:200]}")
                    case "plan":
                        marks = {"pending": " ", "in_progress": "~", "done": "x", "skipped": "-", "blocked": "!"}
                        print("[plan] " + e["goal"])
                        for i, st in enumerate(e["steps"], 1):
                            print(f"       {i}. [{marks.get(st.get('status', 'pending'), ' ')}] {st['title']}")
                    case "continue":
                        print(f"\n[harness] agent stopped without a resolution; nudging ({e['attempt']}/{e['of']})")
                    case "limit":
                        print(f"\n[harness] limit reached: {e['reason']}")
                    case "resolution":
                        resolution = e
                    case "error":
                        error = e["message"]
                        print(f"\n[error] {error}", file=sys.stderr)
                    case "done":
                        outcome = e.get("outcome", "")
        c.delete(f"/api/sessions/{sid}")

    if resolution:
        print("\n\n=== RESOLUTION:", resolution["status"], "===")
        print(resolution["summary"])
        for k in ("likely_cause", "confidence", "owner"):
            if resolution.get(k):
                print(f"{k}: {resolution[k]}")
        for k in ("evidence", "next_steps"):
            for x in resolution.get(k) or []:
                print(f"  {k[:-1] if k.endswith('s') else k}: {x}")
    print(f"\n--- outcome: {outcome}, ops tools called: {tools}" + (f", error: {error}" if error else ""))
    if error or outcome in ("error", "timeout", "max_tool_calls"):
        return 1
    if not resolution or (tools == 0 and MODE == "auto"):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
