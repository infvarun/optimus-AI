"""Reliability check against a RUNNING harness: runs a fixed set of support questions
several times and reports how often each one ends well.

  python scripts/eval.py                 # every case once
  python scripts/eval.py --repeat 3      # every case 3 times
  python scripts/eval.py --only changes,status --repeat 5
  python scripts/eval.py --out eval.json # also write every run's details as JSON

A run passes when it ends normally (no error, limit or timeout), within its case's checks
(the right ticket ids in the answer, tools actually used, etc.) and without repeating itself.
Exit code 0 if every run passed, 1 otherwise. The data is the harness's invented sample data,
so the expected ids below are fixed.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field

import httpx

BASE = os.environ.get("HARNESS_URL") or f"http://127.0.0.1:{os.environ.get('PORT', '8787')}"
HEADERS = {"authorization": f"Bearer {os.environ['HARNESS_API_TOKEN']}"} if os.environ.get("HARNESS_API_TOKEN") else {}
INTERNAL = {"update_plan", "workspace_write", "workspace_read", "workspace_list", "submit_resolution"}


@dataclass
class Case:
    name: str
    prompt: str
    mode: str = "auto"
    context: dict | None = None
    outcomes: tuple[str, ...] = ("answered", "resolved")
    must_mention: tuple[str, ...] = ()        # every one of these must appear in the final text
    any_of: tuple[str, ...] = ()              # at least one of these must appear
    must_not_match: tuple[str, ...] = ()      # regexes that must NOT match the final text
    min_ops_tools: int = 1
    resolution_status: str | None = None


CASES = [
    Case("investigate", "Users say the Clinical Supply Portal is throwing errors. What's going on and what should we do?",
         outcomes=("resolved",), any_of=("CHG0045817", "2.14.0"), min_ops_tools=3),
    Case("changes", "What changed on the Clinical Supply Portal in the last 2 hours?",
         must_mention=("CHG0045817",), must_not_match=(r"\bno (recent )?changes\b", r"scheduled to start in")),
    Case("this-app", "What changed on this app in the last 2 hours?", context={"app": "Clinical Supply Portal"},
         must_mention=("CHG0045817",), must_not_match=(r"which (app|application)",)),
    Case("status", "Draft a short status update for the business about the Clinical Supply Portal errors.",
         must_mention=("Clinical Supply Portal",)),
    Case("health", "Is LabTrack LIMS healthy? Any changes coming up?", must_mention=("CHG0045901",)),
    Case("plan", "Plan how to investigate LabTrack LIMS label printing delays", mode="plan",
         outcomes=("resolved",), min_ops_tools=0, resolution_status="plan_ready"),
]


@dataclass
class Result:
    case: str
    passed: bool
    seconds: float
    outcome: str
    ops_tools: int
    steps: int
    nudges: int
    problems: list[str] = field(default_factory=list)
    text: str = ""


def repeated_paragraph(text: str) -> bool:
    paras = [re.sub(r"\W+", " ", p.lower()).strip() for p in re.split(r"\n\s*\n", text)]
    paras = [p for p in paras if len(p) > 40]
    return len(paras) != len(set(paras))


def run_case(c: httpx.Client, case: Case) -> Result:
    t0 = time.monotonic()
    sid = c.post("/api/sessions").raise_for_status().json()["id"]
    body = {"prompt": case.prompt, "mode": case.mode, **({"context": case.context} if case.context else {})}
    deltas, resolution, done, errors, ops, has_plan = [], None, {}, [], 0, False
    try:
        with c.stream("POST", f"/api/sessions/{sid}/messages", json=body) as r:
            r.raise_for_status()
            for line in r.iter_lines():
                if not line.startswith("data: "):
                    continue
                e = json.loads(line[6:])
                match e["type"]:
                    case "delta":
                        deltas.append(e["text"])
                    case "tool_start" if e["toolName"] not in INTERNAL:
                        ops += 1
                    case "plan":
                        has_plan = True
                    case "resolution":
                        resolution = e
                    case "error":
                        errors.append(e["message"])
                    case "done":
                        done = e
    finally:
        c.delete(f"/api/sessions/{sid}")

    streamed = "".join(deltas)
    final = done.get("answer") or ""
    if resolution:
        final = "\n".join([resolution.get("summary") or "", resolution.get("likely_cause") or "",
                           *(resolution.get("evidence") or []), *(resolution.get("next_steps") or [])])
    everything = f"{streamed}\n{final}"
    outcome = done.get("outcome", "no_done_event")
    problems = [f"error: {m}" for m in errors]
    if outcome not in case.outcomes:
        problems.append(f"outcome {outcome}")
    if not final.strip():
        problems.append("no final answer")
    for s in case.must_mention:
        if s.lower() not in everything.lower():
            problems.append(f"missing {s}")
    if case.any_of and not any(s.lower() in everything.lower() for s in case.any_of):
        problems.append(f"missing one of {', '.join(case.any_of)}")
    for rx in case.must_not_match:
        if re.search(rx, final or streamed, re.I):
            problems.append(f"says /{rx}/")
    if ops < case.min_ops_tools:
        problems.append(f"only {ops} ops tool calls")
    if case.resolution_status and (resolution or {}).get("status") != case.resolution_status:
        problems.append(f"resolution {(resolution or {}).get('status')}, wanted {case.resolution_status}")
    if case.mode == "plan" and not has_plan:
        problems.append("no plan written")
    if repeated_paragraph(streamed):
        problems.append("repeated itself")
    return Result(case.name, not problems, round(time.monotonic() - t0, 1), outcome, ops,
                  done.get("steps", 0), done.get("continues", 0), problems, (final or streamed)[:600])


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--repeat", type=int, default=1)
    ap.add_argument("--only", default="")
    ap.add_argument("--out", default="")
    args = ap.parse_args()
    only = {x for x in args.only.split(",") if x}
    cases = [k for k in CASES if not only or k.name in only]

    results: list[Result] = []
    with httpx.Client(base_url=BASE, headers=HEADERS, timeout=httpx.Timeout(10, read=900)) as c:
        health = c.get("/healthz").json()
        print(f"harness: {health.get('provider')} {health.get('model')}   cases: {len(cases)} x {args.repeat}\n")
        for i in range(args.repeat):
            for case in cases:
                r = run_case(c, case)
                results.append(r)
                mark = "PASS" if r.passed else "FAIL"
                print(f"{mark} {case.name:<12} run {i + 1}  {r.seconds:>6.1f}s  outcome={r.outcome:<10} "
                      f"tools={r.ops_tools} steps={r.steps} nudges={r.nudges}"
                      + (f"  -> {'; '.join(r.problems)}" if r.problems else ""), flush=True)

    print("\nsummary")
    for case in cases:
        rs = [r for r in results if r.case == case.name]
        ok = sum(r.passed for r in rs)
        print(f"  {case.name:<12} {ok}/{len(rs)} passed   median {sorted(r.seconds for r in rs)[len(rs) // 2]:.0f}s")
    total = sum(r.passed for r in results)
    print(f"  {'total':<12} {total}/{len(results)} passed")
    if args.out:
        with open(args.out, "w") as f:
            json.dump({"harness": health, "results": [r.__dict__ for r in results]}, f, indent=2)
        print(f"details: {args.out}")
    return 0 if total == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
