"""End to end: FastAPI app + real Copilot runtime, BYOK pointed at the scripted mock LLM
(scripts/mock_llm.py), which plays a multi-step investigation including a bad tool call
and stopping early without submitting."""

import json

import pytest
from fastapi.testclient import TestClient

from optimus_harness.app import create_app
from optimus_harness.config import load_config

AUTH = {"authorization": "Bearer secret"}


def make_client(env: dict) -> TestClient:
    return TestClient(create_app(load_config({**env, "HARNESS_API_TOKEN": "secret"})), headers=AUTH)


@pytest.fixture(scope="module")
def client(mock_env):
    with make_client({**mock_env, "LLM_CONTEXT_TOKENS": "16384"}) as c:
        yield c


def run(client: TestClient, prompt: str, mode: str = "auto") -> list[dict]:
    sid = client.post("/api/sessions").json()["id"]
    with client.stream("POST", f"/api/sessions/{sid}/messages", json={"prompt": prompt, "mode": mode}) as r:
        assert r.headers["content-type"].startswith("text/event-stream")
        events = [json.loads(line[6:]) for line in r.iter_lines() if line.startswith("data: ")]
    for e in events:
        e.setdefault("_sid", sid)
    return events


def of(events, kind):
    return [e for e in events if e["type"] == kind]


def test_healthz_is_public(client):
    assert client.get("/healthz", headers={"authorization": ""}).json()["model"] == "mock-1"


def test_api_requires_token(client):
    assert client.post("/api/sessions", headers={"authorization": "Bearer wrong"}).status_code == 401


def test_investigation_runs_multiple_steps_until_resolved(client):
    events = run(client, "Users say the Clinical Supply Portal is throwing errors")
    names = [e["toolName"] for e in of(events, "tool_start")]
    assert names[:3] == ["update_plan", "servicenow_cmdb_lookup", "dynatrace_problems"]
    assert names[-1] == "submit_resolution"
    assert len(of(events, "turn_start")) >= 7, "expected a multi-step run"

    # thinking is streamed
    assert len(of(events, "thinking")) > 5

    # the bad call failed with a message the model can act on, and the retry succeeded
    bad = of(events, "tool_end")[2]
    assert bad["success"] is False and "app" in bad["result"]
    retries = [e for e in of(events, "tool_start") if e["toolName"] == "dynatrace_problems"]
    assert retries[1]["arguments"] == {"app": "csp"}

    # it stopped early once and was nudged to continue
    assert of(events, "continue") == [{"type": "continue", "attempt": 1, "of": 2, "_sid": events[0]["_sid"]}]

    plan = of(events, "plan")[0]
    assert plan["file"] == "Plan.md" and len(plan["steps"]) == 4
    assert of(events, "workspace")[0]["file"] == "context.md"
    res = of(events, "resolution")[0]
    assert res["status"] == "resolved" and any("KB0011201" in x for x in res["evidence"])

    done = events[-1]
    assert done["type"] == "done" and done["outcome"] == "resolved"

    usage = of(events, "usage")[0]["data"]
    assert usage["availableToolCount"] == 12  # 7 ops + 5 agent tools, no built-ins
    assert usage["maxPromptTokens"] < 16384  # runtime knows the real context window

    sid = events[0]["_sid"]
    state = client.get(f"/api/sessions/{sid}").json()
    assert {f["name"] for f in state["files"]} == {"Plan.md", "context.md"}
    assert state["resolution"]["status"] == "resolved"
    assert "**Goal:**" in client.get(f"/api/sessions/{sid}/files/Plan.md").text
    assert client.get(f"/api/sessions/{sid}/files/nope.md").status_code == 404
    assert client.delete(f"/api/sessions/{sid}").status_code == 204


def test_plan_mode_writes_plan_and_stops_for_approval(client):
    events = run(client, "Clinical Supply Portal errors", mode="plan")
    assert [e["toolName"] for e in of(events, "tool_start")] == ["update_plan", "submit_resolution"]
    assert of(events, "resolution")[0]["status"] == "plan_ready"
    assert events[-1]["outcome"] == "resolved"


def test_errors_are_json(client):
    assert client.post("/api/sessions/nope/messages", json={"prompt": "x"}).status_code == 404
    sid = client.post("/api/sessions").json()["id"]
    assert client.post(f"/api/sessions/{sid}/messages", json={}).status_code == 422
    assert client.post(f"/api/sessions/{sid}/messages", json={"prompt": "x", "mode": "yolo"}).status_code == 422


def test_tool_call_limit_stops_the_run(mock_env):
    with make_client({**mock_env, "AGENT_MAX_TOOL_CALLS": "3"}) as c:
        events = run(c, "Users say the Clinical Supply Portal is throwing errors")
    assert of(events, "limit")[0]["reason"] == "max_tool_calls"
    assert events[-1]["outcome"] == "max_tool_calls"
    assert not of(events, "resolution")
