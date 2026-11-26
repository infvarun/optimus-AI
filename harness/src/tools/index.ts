import { cmdbLookup, incidentSearch, changeSearch, kbSearch } from "./servicenow.js";
import { problems, serviceHealth, logSearch } from "./dynatrace.js";

/** All support/ops tools exposed to the agent. All read-only. Add new tools here. */
export const opsTools = [
  cmdbLookup,
  incidentSearch,
  changeSearch,
  kbSearch,
  problems,
  serviceHealth,
  logSearch,
];
