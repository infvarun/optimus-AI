"""ServiceNow tools. ALL STUBS backed by fixtures.py.

To make them real: call the ServiceNow Table API
  GET /api/now/table/cmdb_ci_appl, /incident, /change_request, /kb_knowledge
with an OAuth client-credentials token for a read-only integration user, and
map fields. Keep every tool read-only; creating or updating records should go
through a human-approved action, not these tools.
"""

from __future__ import annotations

import re
from datetime import timedelta
from typing import Optional

from copilot import define_tool
from pydantic import BaseModel, Field

from .fixtures import APPS, CHANGES, INCIDENTS, KB_ARTICLES, find_app, find_incident, fixture_now, known_apps, parse_ts, present

APP_DESC = "Application name or alias as the user said it, e.g. 'Clinical Supply Portal' or 'csp'"
ACTIVE_STATES = {"New", "In Progress", "On Hold"}


class CmdbLookupParams(BaseModel):
    app: Optional[str] = Field(default=None, description=APP_DESC + ". Omit to list all applications.")


async def cmdb_lookup_handler(params: CmdbLookupParams) -> dict:
    if not params.app:
        return {
            "stub": True,
            "applications": [{"name": a["name"], "kind": a["kind"], "team": a["team"]["name"]} for a in APPS],
        }
    ci = find_app(params.app)
    if not ci:
        return {"stub": True, "error": f"No CMDB application matches {params.app!r}. Known: {known_apps()}"}
    return {"stub": True, **ci}


cmdb_lookup = define_tool(
    "servicenow_cmdb_lookup",
    description=(
        "Look up an application in the ServiceNow CMDB: its type (custom, SaaS or COTS), vendor, business "
        "criticality, owning support team (assignment group, leads, members, current on-call), its Dynatrace "
        "entity id, and what it depends on. Call this first to identify the app before using other tools. "
        "Call with no app to list all applications."
    ),
    params_type=CmdbLookupParams,
    handler=lambda p, _inv: cmdb_lookup_handler(p),
    skip_permission=True,
)


class IncidentSearchParams(BaseModel):
    app: Optional[str] = Field(
        default=None, description=APP_DESC + ", or its CI ID. Omit when you only have an incident number."
    )
    active_only: bool = Field(default=False, description="Only New / In Progress / On Hold incidents")
    query: Optional[str] = Field(
        default=None, description="Incident number, or text to match in the short description or close notes"
    )
    limit: int = Field(default=10, ge=1, le=25)


async def incident_search_handler(params: IncidentSearchParams) -> dict:
    q = (params.query or "").strip().lower()
    exact = find_incident(q) if q.startswith("inc") else None
    ci = find_app(params.app) if params.app else None
    if params.app and not ci:
        if not exact:
            return {"stub": True, "error": f"Unknown application {params.app!r}. Known: {known_apps()}"}
        ci = find_app(exact["cmdbCi"])
    if exact:
        # An incident number: return that incident plus others on the same app, so
        # "find similar" has something to compare against.
        ci = ci or find_app(exact["cmdbCi"])
        others = [i for i in INCIDENTS if i["cmdbCi"] == exact["cmdbCi"] and i["number"] != exact["number"]]
        others.sort(key=lambda i: i["openedAt"], reverse=True)
        return present({
            "stub": True, "app": exact["cmdbCi"], "incident": exact,
            "count": len(others[: params.limit]), "otherIncidentsOnApp": others[: params.limit],
        })
    if not ci and not q:
        return {"stub": True, "error": "Give an app (name or CI ID) or an incident number."}
    hits = [
        i
        for i in INCIDENTS
        if (not ci or i["cmdbCi"] == ci["name"])
        and (not params.active_only or i["state"] in ACTIVE_STATES)
        and (not q or q in f"{i['number']} {i['shortDescription']} {i.get('closeNotes', '')}".lower())
    ]
    hits.sort(key=lambda i: i["openedAt"], reverse=True)
    hits = hits[: params.limit]
    return present({"stub": True, "app": ci["name"] if ci else None, "count": len(hits), "incidents": hits})


incident_search = define_tool(
    "servicenow_incident_search",
    description=(
        "Search ServiceNow incidents for an application. Use to see whether an issue is already reported, "
        "who is working it, and how similar past incidents were resolved (close notes)."
    ),
    params_type=IncidentSearchParams,
    handler=lambda p, _inv: incident_search_handler(p),
    skip_permission=True,
)


class ChangeSearchParams(BaseModel):
    app: str = Field(description=APP_DESC)
    hours_back: int = Field(default=24, ge=1, le=24 * 30, description="Look-back window in hours")
    hours_ahead: int = Field(default=72, ge=0, le=24 * 30, description="Look-ahead window in hours")


async def change_search_handler(params: ChangeSearchParams) -> dict:
    ci = find_app(params.app)
    if not ci:
        return {"stub": True, "error": f"Unknown application {params.app!r}. Known: {known_apps()}"}
    now = fixture_now()
    start, end = now - timedelta(hours=params.hours_back), now + timedelta(hours=params.hours_ahead)
    hits = [
        c
        for c in CHANGES
        if c["cmdbCi"] == ci["name"] and parse_ts(c["plannedEnd"]) >= start and parse_ts(c["plannedStart"]) <= end
    ]
    return present({"stub": True, "app": ci["name"], "now": now.isoformat(), "changes": hits})


change_search = define_tool(
    "servicenow_change_search",
    description=(
        "Search ServiceNow change requests for an application in a time window around now. Use to check "
        "whether a recent or in-flight change (deploy, patch, config) could explain an issue, and to read "
        "its backout plan. Also shows upcoming scheduled changes."
    ),
    params_type=ChangeSearchParams,
    handler=lambda p, _inv: change_search_handler(p),
    skip_permission=True,
)


class KbSearchParams(BaseModel):
    query: str = Field(description="Symptom, error or task, e.g. 'db connection pool exhausted'")
    app: Optional[str] = Field(default=None, description=APP_DESC)
    limit: int = Field(default=3, ge=1, le=10)


async def kb_search_handler(params: KbSearchParams) -> dict:
    ci = find_app(params.app) if params.app else None
    terms = [t for t in re.split(r"\W+", params.query.lower()) if len(t) > 2]
    scored = []
    for k in KB_ARTICLES:
        if ci and ci["name"] not in k["appliesTo"]:
            continue
        hay = f"{k['title']} {' '.join(k['keywords'])} {k['summary']}".lower()
        score = sum(1 for t in terms if t in hay)
        if score:
            scored.append({**k, "score": score})
    scored.sort(key=lambda k: k["score"], reverse=True)
    return {"stub": True, "query": params.query, "results": scored[: params.limit]}


kb_search = define_tool(
    "servicenow_kb_search",
    description=(
        "Search ServiceNow knowledge articles (runbooks / SOPs). Use before recommending any remediation so "
        "advice follows the approved procedure, and cite the KB number."
    ),
    params_type=KbSearchParams,
    handler=lambda p, _inv: kb_search_handler(p),
    skip_permission=True,
)
