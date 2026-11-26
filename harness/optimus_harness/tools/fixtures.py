"""FAKE data for the stub tools.

Every app, person, ticket and problem here is invented so the harness can be
demoed end to end without touching real systems. Field names loosely follow
the real APIs (ServiceNow Table API, Dynatrace Environment API v2) so swapping
in real clients is mostly mapping. Delete this module once the tools call real
backends.

Timestamps are written relative to import time (T0). Handlers filter against
``fixture_now()`` (T0) and pass results through ``present()``, which shifts every
timestamp to the real clock and adds a human-readable ``<field>Relative`` next to
it ("15 min ago", "in 2 h"). So "25 minutes ago" stays true however long the
process runs, and small models don't have to do ISO date arithmetic (they get it
wrong).
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone


T0 = datetime.now(timezone.utc)


def _ago(minutes: float) -> str:
    return (T0 - timedelta(minutes=minutes)).isoformat()


def _ahead(minutes: float) -> str:
    return (T0 + timedelta(minutes=minutes)).isoformat()


def fixture_now() -> datetime:
    """'Now' in fixture time. Filter fixture data against this, not the real clock."""
    return T0


def _relative(delta_minutes: float) -> str:
    m = abs(delta_minutes)
    if m < 1:
        return "just now"
    if m < 90:
        text = f"{round(m)} min"
    elif m < 60 * 36:
        h, rem = divmod(round(m), 60)
        text = f"{h} h {rem} min" if rem and h < 6 else f"{round(m / 60)} h"
    else:
        text = f"{round(m / 1440)} days"
    return f"{text} ago" if delta_minutes <= 0 else f"in {text}"


_ISO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}")


def present(obj, now: datetime | None = None):
    """Copy a tool result, moving fixture timestamps onto the real clock and adding
    '<key>Relative' fields so the model can read times without arithmetic."""
    now = now or datetime.now(timezone.utc)
    shift = now - T0
    if isinstance(obj, list):
        return [present(x, now) for x in obj]
    if not isinstance(obj, dict):
        return obj
    out: dict = {}
    for k, v in obj.items():
        if isinstance(v, str) and _ISO.match(v):
            ts = datetime.fromisoformat(v) + shift
            out[k] = ts.isoformat(timespec="seconds")
            out[f"{k}Relative"] = _relative((ts - now).total_seconds() / 60)
        else:
            out[k] = present(v, now)
    return out


def _person(name: str, user_id: str) -> dict:
    return {"name": name, "userId": user_id, "email": f"{user_id}@example.com"}


# ---------------------------------------------------------------------------
# ServiceNow CMDB: applications, owning teams, dependencies
# ---------------------------------------------------------------------------

_ORDER_TEAM = {
    "name": "Order Management Support",
    "assignmentGroup": "APP-ORDER-MGMT-L2",
    "leads": [_person("Priya Raman", "praman")],
    "members": [_person("Tom Becker", "tbecker"), _person("Ana Souza", "asouza"), _person("Li Wei", "lwei")],
    "onCall": "tbecker",
}
_LAB_TEAM = {
    "name": "Lab Systems Support",
    "assignmentGroup": "APP-LAB-SYSTEMS-L2",
    "leads": [_person("Marcus Hale", "mhale"), _person("Ines Duarte", "iduarte")],
    "members": [_person("Kenji Mori", "kmori"), _person("Sara Nilsson", "snilsson")],
    "onCall": "kmori",
}
_FINANCE_TEAM = {
    "name": "Finance Apps Support",
    "assignmentGroup": "APP-FINANCE-SAAS-L2",
    "leads": [_person("Grace Okafor", "gokafor")],
    "members": [_person("Dev Patel", "dpatel")],
    "onCall": "dpatel",
}

APPS: list[dict] = [
    {
        "sysId": "ci-0001",
        "name": "Clinical Supply Portal",
        "aliases": ["csp", "supply portal", "csp-api"],
        "kind": "custom",
        "businessCriticality": "1 - most critical",
        "environment": "production",
        "team": _ORDER_TEAM,
        "dynatraceEntityId": "SERVICE-CSP0001",
        "dependsOn": ["CSP Orders DB", "Identity Gateway", "LabTrack LIMS"],
    },
    {
        "sysId": "ci-0002",
        "name": "LabTrack LIMS",
        "aliases": ["labtrack", "lims"],
        "kind": "cots",
        "vendor": "LabTrack Software (fictional)",
        "businessCriticality": "1 - most critical",
        "environment": "production",
        "team": _LAB_TEAM,
        "dynatraceEntityId": "SERVICE-LIMS0002",
        "dependsOn": ["LIMS Oracle DB"],
    },
    {
        "sysId": "ci-0003",
        "name": "Expense Cloud",
        "aliases": ["expenses", "t&e"],
        "kind": "saas",
        "vendor": "Expense Cloud Inc. (fictional)",
        "businessCriticality": "3 - less critical",
        "environment": "production",
        "team": _FINANCE_TEAM,
        "dynatraceEntityId": "APPLICATION-EXP0003",  # synthetic monitor only; SaaS
        "dependsOn": ["Identity Gateway"],
    },
]

# ---------------------------------------------------------------------------
# ServiceNow ITSM: incidents, changes, knowledge
# ---------------------------------------------------------------------------

INCIDENTS: list[dict] = [
    {
        "number": "INC0104521",
        "shortDescription": "Clinical Supply Portal: order submission failing with HTTP 503",
        "state": "In Progress",
        "priority": "2 - High",
        "cmdbCi": "Clinical Supply Portal",
        "assignmentGroup": "APP-ORDER-MGMT-L2",
        "assignedTo": "tbecker",
        "openedAt": _ago(25),
    },
    {
        "number": "INC0103990",
        "shortDescription": "Clinical Supply Portal slow after release 2.13",
        "state": "Resolved",
        "priority": "3 - Moderate",
        "cmdbCi": "Clinical Supply Portal",
        "assignmentGroup": "APP-ORDER-MGMT-L2",
        "assignedTo": "asouza",
        "openedAt": _ago(60 * 24 * 12),
        "resolvedAt": _ago(60 * 24 * 11),
        "closeNotes": "DB connection pool exhausted by unclosed result sets in 2.13. "
        "Hotfix 2.13.1 deployed. See KB0011201.",
    },
    {
        "number": "INC0104402",
        "shortDescription": "LabTrack LIMS: sample label printing intermittently delayed",
        "state": "On Hold",
        "priority": "4 - Low",
        "cmdbCi": "LabTrack LIMS",
        "assignmentGroup": "APP-LAB-SYSTEMS-L2",
        "assignedTo": "snilsson",
        "openedAt": _ago(60 * 30),
    },
]

CHANGES: list[dict] = [
    {
        "number": "CHG0045817",
        "shortDescription": "Deploy Clinical Supply Portal release 2.14.0",
        "type": "Normal",
        "state": "Review",
        "cmdbCi": "Clinical Supply Portal",
        "assignmentGroup": "APP-ORDER-MGMT-L2",
        "plannedStart": _ago(45),
        "plannedEnd": _ago(15),
        "backoutPlan": "Redeploy 2.13.1 via pipeline rollback job (approx. 10 min).",
    },
    {
        "number": "CHG0045901",
        "shortDescription": "LabTrack LIMS vendor patch 9.4.2",
        "type": "Normal",
        "state": "Scheduled",
        "cmdbCi": "LabTrack LIMS",
        "assignmentGroup": "APP-LAB-SYSTEMS-L2",
        "plannedStart": _ahead(60 * 48),
        "plannedEnd": _ahead(60 * 50),
        "backoutPlan": "Restore VM snapshot and DB backup taken pre-change.",
    },
]

KB_ARTICLES: list[dict] = [
    {
        "number": "KB0011201",
        "title": "Clinical Supply Portal: DB connection pool exhausted",
        "appliesTo": ["Clinical Supply Portal"],
        "keywords": ["database", "pool", "hikari", "timeout", "503", "connection"],
        "summary": "Requests fail with pool timeouts; usually a slow query or a connection leak after a release.",
        "steps": [
            "Confirm pool saturation in Dynatrace (active connections == max).",
            "Check ServiceNow for a change implemented in the last 2 hours on this CI.",
            "If a recent change is the likely cause, propose rollback under that change's backout plan (lead approval).",
            "Do NOT increase pool size above the DB's max_connections / replicas.",
        ],
    },
    {
        "number": "KB0010050",
        "title": "Standard rollback of a custom application release",
        "appliesTo": ["Clinical Supply Portal"],
        "keywords": ["rollback", "release", "deploy", "backout"],
        "summary": "Use the backout plan of the originating change; open an Emergency change if outside its window.",
        "steps": [
            "Reference the original CHG and its backout plan.",
            "If the CHG is closed or outside window, raise an Emergency change and get lead approval.",
            "Run the pipeline rollback job; watch Dynatrace failure rate and response time for 15 min.",
        ],
    },
    {
        "number": "KB0012040",
        "title": "LabTrack LIMS: label printing delays",
        "appliesTo": ["LabTrack LIMS"],
        "keywords": ["label", "printing", "print", "queue", "delay"],
        "summary": "Print spooler backlog on the LIMS app server; vendor-supported COTS, raise vendor case if persistent.",
        "steps": [
            "Check print queue depth.",
            "Restart spooler service (standard change SC-LIMS-04).",
            "Raise vendor case if recurring.",
        ],
    },
]

# ---------------------------------------------------------------------------
# Dynatrace: problems, service metrics, logs
# ---------------------------------------------------------------------------

DT_PROBLEMS: list[dict] = [
    {
        "problemId": "-4411892731_1764170000000V2",
        "displayId": "P-2511734",
        "title": "Failure rate increase on Web request service csp-api",
        "status": "OPEN",
        "severityLevel": "ERROR",
        "impactLevel": "SERVICES",
        "affectedEntityIds": ["SERVICE-CSP0001"],
        "rootCauseEntity": {"id": "PROCESS_GROUP_INSTANCE-ORDDB01", "name": "csp-orders-db"},
        "startTime": _ago(22),
    },
    {
        "problemId": "-4411892731_1764160000000V2",
        "displayId": "P-2511702",
        "title": "Response time degradation on csp-api",
        "status": "OPEN",
        "severityLevel": "PERFORMANCE",
        "impactLevel": "SERVICES",
        "affectedEntityIds": ["SERVICE-CSP0001"],
        "startTime": _ago(28),
    },
    {
        "problemId": "-2299001122_1764000000000V2",
        "displayId": "P-2510950",
        "title": "Long garbage-collection time on lims-app-01",
        "status": "CLOSED",
        "severityLevel": "RESOURCE_CONTENTION",
        "impactLevel": "INFRASTRUCTURE",
        "affectedEntityIds": ["SERVICE-LIMS0002"],
        "startTime": _ago(60 * 20),
        "endTime": _ago(60 * 19),
    },
]

DT_METRICS: dict[str, dict] = {
    "SERVICE-CSP0001": {
        "entityId": "SERVICE-CSP0001",
        "responseTimeP90Ms": 4200,
        "failureRatePct": 12.4,
        "throughputPerMin": 830,
        "baseline": {"responseTimeP90Ms": 380, "failureRatePct": 0.3, "throughputPerMin": 910},
        "lastDeploymentEvent": {"version": "2.14.0", "at": _ago(32)},
    },
    "SERVICE-LIMS0002": {
        "entityId": "SERVICE-LIMS0002",
        "responseTimeP90Ms": 610,
        "failureRatePct": 0.4,
        "throughputPerMin": 140,
        "baseline": {"responseTimeP90Ms": 580, "failureRatePct": 0.3, "throughputPerMin": 150},
    },
    "APPLICATION-EXP0003": {
        "entityId": "APPLICATION-EXP0003",
        "responseTimeP90Ms": 900,
        "failureRatePct": 0.0,
        "throughputPerMin": 0,  # synthetic only
        "baseline": {"responseTimeP90Ms": 950, "failureRatePct": 0.0, "throughputPerMin": 0},
    },
}

DT_LOGS: list[dict] = [
    {"timestamp": _ago(2), "entityId": "SERVICE-CSP0001", "loglevel": "ERROR",
     "content": "HikariPool-1 - Connection is not available, request timed out after 30000ms", "traceId": "a1f3"},
    {"timestamp": _ago(3), "entityId": "SERVICE-CSP0001", "loglevel": "ERROR",
     "content": "POST /api/orders 503 Service Unavailable (db pool exhausted)", "traceId": "a1f2"},
    {"timestamp": _ago(6), "entityId": "SERVICE-CSP0001", "loglevel": "WARN",
     "content": "DB pool usage 98% (49/50 active)"},
    {"timestamp": _ago(31), "entityId": "SERVICE-CSP0001", "loglevel": "INFO",
     "content": "Started csp-api version 2.14.0 (build 8812)"},
    {"timestamp": _ago(40), "entityId": "SERVICE-CSP0001", "loglevel": "INFO", "content": "Health OK"},
    {"timestamp": _ago(12), "entityId": "SERVICE-LIMS0002", "loglevel": "WARN",
     "content": "Print spooler queue depth 37 (threshold 25)"},
]


def find_app(name_or_alias: str) -> dict | None:
    """Resolve a user-typed app name or alias to its CMDB record."""
    q = name_or_alias.strip().lower()
    for a in APPS:
        if a["name"].lower() == q or q in a["aliases"]:
            return a
    for a in APPS:
        if q in a["name"].lower() or any(q in alias for alias in a["aliases"]):
            return a
    return None


def known_apps() -> str:
    return ", ".join(a["name"] for a in APPS)


def parse_ts(ts: str) -> datetime:
    return datetime.fromisoformat(ts)
