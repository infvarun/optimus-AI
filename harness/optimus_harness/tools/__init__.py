"""All support/ops tools exposed to the agent. All read-only. Add new tools here."""

from .dynatrace import log_search, problems, service_health
from .servicenow import change_search, cmdb_lookup, incident_search, kb_search

OPS_TOOLS = [
    cmdb_lookup,
    incident_search,
    change_search,
    kb_search,
    problems,
    service_health,
    log_search,
]

__all__ = ["OPS_TOOLS"]
