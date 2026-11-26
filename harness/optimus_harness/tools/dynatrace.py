"""Dynatrace tools. ALL STUBS backed by fixtures.py.

To make them real, use the Dynatrace Environment API v2 with an API token
scoped read-only (problems.read, metrics.read, logs.read, entities.read):
  GET /api/v2/problems?entitySelector=entityId("<id>")&from=now-2h
  GET /api/v2/metrics/query?metricSelector=builtin:service.response.time:percentile(90),...
  GET /api/v2/logs/search?query=...&from=now-60m
Resolve the app to its entity id through the CMDB first; never let the model
pass arbitrary entity selectors straight through.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from copilot import define_tool
from pydantic import BaseModel, Field

from .fixtures import DT_LOGS, DT_METRICS, DT_PROBLEMS, find_app, known_apps, parse_ts

APP_DESC = "Application name or alias, e.g. 'Clinical Supply Portal' or 'csp'"
LEVELS = ["DEBUG", "INFO", "WARN", "ERROR"]


def _resolve(app: str) -> tuple[dict, str] | str:
    """Return (ci, entity_id), or an error string."""
    ci = find_app(app)
    if not ci:
        return f"Unknown application {app!r}. Known: {known_apps()}"
    if not ci.get("dynatraceEntityId"):
        return f"{ci['name']!r} is not monitored in Dynatrace."
    return ci, ci["dynatraceEntityId"]


class ProblemsParams(BaseModel):
    app: str = Field(description=APP_DESC)
    status: Literal["OPEN", "CLOSED", "ALL"] = "OPEN"
    hours_back: int = Field(default=24, ge=1, le=24 * 7)


async def problems_handler(params: ProblemsParams) -> dict:
    r = _resolve(params.app)
    if isinstance(r, str):
        return {"stub": True, "error": r}
    ci, entity = r
    since = datetime.now(timezone.utc) - timedelta(hours=params.hours_back)
    hits = [
        p
        for p in DT_PROBLEMS
        if entity in p["affectedEntityIds"]
        and (params.status == "ALL" or p["status"] == params.status)
        and parse_ts(p["startTime"]) >= since
    ]
    return {"stub": True, "app": ci["name"], "entityId": entity, "totalCount": len(hits), "problems": hits}


problems = define_tool(
    "dynatrace_problems",
    description=(
        "List Dynatrace problems (Davis AI detected issues) affecting an application: title, severity, "
        "status, start time and root-cause entity. Start here when someone reports an outage or slowness."
    ),
    params_type=ProblemsParams,
    handler=lambda p, _inv: problems_handler(p),
    skip_permission=True,
)


class ServiceHealthParams(BaseModel):
    app: str = Field(description=APP_DESC)


async def service_health_handler(params: ServiceHealthParams) -> dict:
    r = _resolve(params.app)
    if isinstance(r, str):
        return {"stub": True, "error": r}
    ci, entity = r
    m = DT_METRICS.get(entity)
    if not m:
        return {"stub": True, "error": f"No metrics for {entity}"}
    return {"stub": True, "app": ci["name"], "measuredAt": datetime.now(timezone.utc).isoformat(), **m}


service_health = define_tool(
    "dynatrace_service_health",
    description=(
        "Get current Dynatrace service metrics for an application (p90 response time, failure rate, "
        "throughput) compared with the same hour last week, plus the last deployment event."
    ),
    params_type=ServiceHealthParams,
    handler=lambda p, _inv: service_health_handler(p),
    skip_permission=True,
)


class LogSearchParams(BaseModel):
    app: str = Field(description=APP_DESC)
    query: Optional[str] = Field(default=None, description="Case-insensitive text to match, e.g. an error code or trace id")
    min_level: Literal["DEBUG", "INFO", "WARN", "ERROR"] = "INFO"
    minutes_back: int = Field(default=60, ge=1, le=1440)
    limit: int = Field(default=50, ge=1, le=200)


async def log_search_handler(params: LogSearchParams) -> dict:
    r = _resolve(params.app)
    if isinstance(r, str):
        return {"stub": True, "error": r}
    ci, entity = r
    since = datetime.now(timezone.utc) - timedelta(minutes=params.minutes_back)
    q = (params.query or "").lower()
    floor = LEVELS.index(params.min_level)
    hits = [
        log
        for log in DT_LOGS
        if log["entityId"] == entity
        and LEVELS.index(log["loglevel"]) >= floor
        and parse_ts(log["timestamp"]) >= since
        and (not q or q in log["content"].lower())
    ]
    hits.sort(key=lambda log: log["timestamp"], reverse=True)
    hits = hits[: params.limit]
    return {"stub": True, "app": ci["name"], "count": len(hits), "records": hits}


log_search = define_tool(
    "dynatrace_log_search",
    description=(
        "Search Dynatrace logs for an application. Returns at most `limit` records, newest first. "
        "Use to confirm an error signature or find when it started."
    ),
    params_type=LogSearchParams,
    handler=lambda p, _inv: log_search_handler(p),
    skip_permission=True,
)
