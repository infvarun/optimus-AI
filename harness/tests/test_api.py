"""End to end: FastAPI app + real Copilot runtime, BYOK pointed at the scripted mock LLM."""

import json

import pytest
from fastapi.testclient import TestClient

from optimus_harness.app import create_app
from optimus_harness.config import load_config


@pytest.fixture(scope="module")
def client(mock_env):
    app = create_app(load_config({**mock_env, "HARNESS_API_TOKEN": "secret"}))
    with TestClient(app, headers={"authorization": "Bearer secret"}) as c:
        yield c


def sse_events(resp) -> list[dict]:
    return [json.loads(line[6:]) for line in resp.iter_lines() if line.startswith("data: ")]


def test_healthz_is_public(client):
    r = client.get("/healthz", headers={"authorization": ""})
    assert r.json()["model"] == "mock-1"


def test_api_requires_token(client):
    assert client.post("/api/sessions", headers={"authorization": "Bearer wrong"}).status_code == 401


def test_turn_streams_tool_call_and_answer(client):
    sid = client.post("/api/sessions").json()["id"]
    with client.stream("POST", f"/api/sessions/{sid}/messages", json={"prompt": "Checkout is throwing 503s"}) as r:
        assert r.headers["content-type"].startswith("text/event-stream")
        events = sse_events(r)
    types = [e["type"] for e in events]
    start = next(e for e in events if e["type"] == "tool_start")
    assert start["toolName"] == "dynatrace_problems" and start["arguments"] == {"app": "csp"}
    assert next(e for e in events if e["type"] == "tool_end")["success"] is True
    assert types.count("delta") > 3
    assert "KB0011201" in next(e for e in events if e["type"] == "message")["content"]
    usage = next(e for e in events if e["type"] == "usage")["data"]
    assert usage["availableToolCount"] == 7  # only our tools, no built-ins
    assert types[-1] == "done"
    assert client.delete(f"/api/sessions/{sid}").status_code == 204


def test_errors_are_json(client):
    assert client.post("/api/sessions/nope/messages", json={"prompt": "x"}).status_code == 404
    sid = client.post("/api/sessions").json()["id"]
    assert client.post(f"/api/sessions/{sid}/messages", json={}).status_code == 422
    assert client.get("/api/sessions").json()["sessions"][0]["id"]
