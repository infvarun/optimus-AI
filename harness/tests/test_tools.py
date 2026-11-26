from optimus_harness.tools import OPS_TOOLS
from optimus_harness.tools.dynatrace import (
    LogSearchParams, ProblemsParams, ServiceHealthParams,
    log_search_handler, problems_handler, service_health_handler,
)
from optimus_harness.tools.servicenow import (
    ChangeSearchParams, CmdbLookupParams, IncidentSearchParams, KbSearchParams,
    change_search_handler, cmdb_lookup_handler, incident_search_handler, kb_search_handler,
)


def test_all_tools_registered_with_unique_names():
    names = [t.name for t in OPS_TOOLS]
    assert len(names) == 7 and len(set(names)) == 7


async def test_cmdb_lookup_resolves_alias_team_and_entity():
    r = await cmdb_lookup_handler(CmdbLookupParams(app="csp"))
    assert r["name"] == "Clinical Supply Portal"
    assert r["kind"] == "custom"
    assert r["team"]["leads"]
    assert r["dynatraceEntityId"] == "SERVICE-CSP0001"
    everything = await cmdb_lookup_handler(CmdbLookupParams())
    assert {a["kind"] for a in everything["applications"]} == {"custom", "cots", "saas"}
    assert "No CMDB application" in (await cmdb_lookup_handler(CmdbLookupParams(app="nope")))["error"]


async def test_incident_search_active_and_history():
    r = await incident_search_handler(IncidentSearchParams(app="Clinical Supply Portal", active_only=True))
    assert [i["number"] for i in r["incidents"]] == ["INC0104521"]
    past = await incident_search_handler(IncidentSearchParams(app="csp", query="pool"))
    assert past["incidents"][0]["number"] == "INC0103990"


async def test_change_search_window():
    r = await change_search_handler(ChangeSearchParams(app="csp"))
    assert [c["number"] for c in r["changes"]] == ["CHG0045817"]
    lims = await change_search_handler(ChangeSearchParams(app="lims", hours_back=1, hours_ahead=1))
    assert lims["changes"] == []


async def test_kb_search_ranks_pool_article_first():
    r = await kb_search_handler(KbSearchParams(query="db connection pool exhausted 503"))
    assert r["results"][0]["number"] == "KB0011201"


async def test_dynatrace_tools_resolve_through_cmdb():
    p = await problems_handler(ProblemsParams(app="csp"))
    assert p["totalCount"] == 2
    h = await service_health_handler(ServiceHealthParams(app="csp"))
    assert h["failureRatePct"] > h["baseline"]["failureRatePct"]
    logs = await log_search_handler(LogSearchParams(app="csp", min_level="ERROR"))
    assert logs["records"] and all(x["loglevel"] == "ERROR" for x in logs["records"])
    assert "Unknown application" in (await problems_handler(ProblemsParams(app="nope")))["error"]


async def test_agent_workspace_tools_stay_inside_the_workspace(tmp_path):
    import json

    from copilot import ToolInvocation

    from optimus_harness.tools.agent import make_agent_tools

    ws = tmp_path / "ws"
    tools = {t.name: t for t in make_agent_tools(ws)}
    assert set(tools) == {"update_plan", "workspace_write", "workspace_read", "workspace_list", "submit_resolution"}

    async def call(tool, **args):
        r = await tools[tool].handler(ToolInvocation(tool_name=tool, arguments=args))
        return json.loads(r.text_result_for_llm)

    assert (await call("update_plan", goal="g", steps=[{"title": "a", "status": "done"}, {"title": "b"}]))["ok"]
    assert "1. [x] a" in (ws / "Plan.md").read_text() and "2. [ ] b" in (ws / "Plan.md").read_text()
    assert (await call("workspace_write", name="context.md", content="x"))["ok"]
    assert (await call("workspace_write", name="context.md", content="y", append=True))["bytes"] == 2
    assert (await call("workspace_read", name="context.md"))["content"] == "xy"
    for bad in ["../escape.md", "/etc/passwd", "sub/dir.md", "notes.txt"]:
        assert not (await call("workspace_write", name=bad, content="x"))["ok"], bad
    assert not (await call("workspace_write", name="Plan.md", content="x"))["ok"]
    assert [f["name"] for f in (await call("workspace_list"))["files"]] == ["Plan.md", "context.md"]
    assert not list(tmp_path.glob("escape.md"))
