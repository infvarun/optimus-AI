/**
 * FAKE data for the stub tools. Every app, person, ticket and problem here is
 * invented so the harness can be demoed end to end without touching real
 * systems. Field names loosely follow the real APIs (ServiceNow Table API,
 * Dynatrace Environment API v2) so swapping in real clients is mostly mapping.
 * Delete this file once the tools call real backends.
 */

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const minsFromNow = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

// ---------------------------------------------------------------------------
// ServiceNow CMDB: applications, owning teams, dependencies
// ---------------------------------------------------------------------------

export type AppKind = "custom" | "saas" | "cots";

export interface Person {
  name: string;
  userId: string;
  email: string;
}

export interface SupportTeam {
  name: string;
  /** ServiceNow assignment group */
  assignmentGroup: string;
  leads: Person[];
  members: Person[];
  onCall: string; // userId of current on-call
}

export interface AppCI {
  sysId: string;
  name: string;
  aliases: string[];
  kind: AppKind;
  vendor?: string;
  businessCriticality: "1 - most critical" | "2 - somewhat critical" | "3 - less critical";
  environment: "production";
  team: SupportTeam;
  /** Dynatrace entity this app maps to (SERVICE-… / APPLICATION-…) */
  dynatraceEntityId?: string;
  dependsOn: string[]; // other CI names
}

const p = (name: string, userId: string): Person => ({
  name,
  userId,
  email: `${userId}@example.com`,
});

const orderTeam: SupportTeam = {
  name: "Order Management Support",
  assignmentGroup: "APP-ORDER-MGMT-L2",
  leads: [p("Priya Raman", "praman")],
  members: [p("Tom Becker", "tbecker"), p("Ana Souza", "asouza"), p("Li Wei", "lwei")],
  onCall: "tbecker",
};

const labTeam: SupportTeam = {
  name: "Lab Systems Support",
  assignmentGroup: "APP-LAB-SYSTEMS-L2",
  leads: [p("Marcus Hale", "mhale"), p("Ines Duarte", "iduarte")],
  members: [p("Kenji Mori", "kmori"), p("Sara Nilsson", "snilsson")],
  onCall: "kmori",
};

const financeTeam: SupportTeam = {
  name: "Finance Apps Support",
  assignmentGroup: "APP-FINANCE-SAAS-L2",
  leads: [p("Grace Okafor", "gokafor")],
  members: [p("Dev Patel", "dpatel")],
  onCall: "dpatel",
};

export const APPS: AppCI[] = [
  {
    sysId: "ci-0001",
    name: "Clinical Supply Portal",
    aliases: ["csp", "supply portal", "csp-api"],
    kind: "custom",
    businessCriticality: "1 - most critical",
    environment: "production",
    team: orderTeam,
    dynatraceEntityId: "SERVICE-CSP0001",
    dependsOn: ["CSP Orders DB", "Identity Gateway", "LabTrack LIMS"],
  },
  {
    sysId: "ci-0002",
    name: "LabTrack LIMS",
    aliases: ["labtrack", "lims"],
    kind: "cots",
    vendor: "LabTrack Software (fictional)",
    businessCriticality: "1 - most critical",
    environment: "production",
    team: labTeam,
    dynatraceEntityId: "SERVICE-LIMS0002",
    dependsOn: ["LIMS Oracle DB"],
  },
  {
    sysId: "ci-0003",
    name: "Expense Cloud",
    aliases: ["expenses", "t&e"],
    kind: "saas",
    vendor: "Expense Cloud Inc. (fictional)",
    businessCriticality: "3 - less critical",
    environment: "production",
    team: financeTeam,
    dynatraceEntityId: "APPLICATION-EXP0003", // synthetic monitor only; SaaS
    dependsOn: ["Identity Gateway"],
  },
];

// ---------------------------------------------------------------------------
// ServiceNow ITSM: incidents, changes, knowledge
// ---------------------------------------------------------------------------

export interface Incident {
  number: string;
  shortDescription: string;
  state: "New" | "In Progress" | "On Hold" | "Resolved" | "Closed";
  priority: "1 - Critical" | "2 - High" | "3 - Moderate" | "4 - Low";
  cmdbCi: string;
  assignmentGroup: string;
  assignedTo?: string;
  openedAt: string;
  resolvedAt?: string;
  closeNotes?: string;
}

export const INCIDENTS: Incident[] = [
  {
    number: "INC0104521",
    shortDescription: "Clinical Supply Portal: order submission failing with HTTP 503",
    state: "In Progress",
    priority: "2 - High",
    cmdbCi: "Clinical Supply Portal",
    assignmentGroup: "APP-ORDER-MGMT-L2",
    assignedTo: "tbecker",
    openedAt: minsAgo(25),
  },
  {
    number: "INC0103990",
    shortDescription: "Clinical Supply Portal slow after release 2.13",
    state: "Resolved",
    priority: "3 - Moderate",
    cmdbCi: "Clinical Supply Portal",
    assignmentGroup: "APP-ORDER-MGMT-L2",
    assignedTo: "asouza",
    openedAt: minsAgo(60 * 24 * 12),
    resolvedAt: minsAgo(60 * 24 * 11),
    closeNotes: "DB connection pool exhausted by unclosed result sets in 2.13. Hotfix 2.13.1 deployed. See KB0011201.",
  },
  {
    number: "INC0104402",
    shortDescription: "LabTrack LIMS: sample label printing intermittently delayed",
    state: "On Hold",
    priority: "4 - Low",
    cmdbCi: "LabTrack LIMS",
    assignmentGroup: "APP-LAB-SYSTEMS-L2",
    assignedTo: "snilsson",
    openedAt: minsAgo(60 * 30),
  },
];

export interface ChangeRequest {
  number: string;
  shortDescription: string;
  type: "Standard" | "Normal" | "Emergency";
  state: "New" | "Assess" | "Authorize" | "Scheduled" | "Implement" | "Review" | "Closed";
  cmdbCi: string;
  assignmentGroup: string;
  plannedStart: string;
  plannedEnd: string;
  backoutPlan: string;
}

export const CHANGES: ChangeRequest[] = [
  {
    number: "CHG0045817",
    shortDescription: "Deploy Clinical Supply Portal release 2.14.0",
    type: "Normal",
    state: "Review",
    cmdbCi: "Clinical Supply Portal",
    assignmentGroup: "APP-ORDER-MGMT-L2",
    plannedStart: minsAgo(45),
    plannedEnd: minsAgo(15),
    backoutPlan: "Redeploy 2.13.1 via pipeline rollback job (approx. 10 min).",
  },
  {
    number: "CHG0045901",
    shortDescription: "LabTrack LIMS vendor patch 9.4.2",
    type: "Normal",
    state: "Scheduled",
    cmdbCi: "LabTrack LIMS",
    assignmentGroup: "APP-LAB-SYSTEMS-L2",
    plannedStart: minsFromNow(60 * 48),
    plannedEnd: minsFromNow(60 * 50),
    backoutPlan: "Restore VM snapshot and DB backup taken pre-change.",
  },
];

export interface KbArticle {
  number: string;
  title: string;
  appliesTo: string[]; // CI names
  keywords: string[];
  summary: string;
  steps: string[];
}

export const KB_ARTICLES: KbArticle[] = [
  {
    number: "KB0011201",
    title: "Clinical Supply Portal: DB connection pool exhausted",
    appliesTo: ["Clinical Supply Portal"],
    keywords: ["database", "pool", "hikari", "timeout", "503", "connection"],
    summary: "Requests fail with pool timeouts; usually a slow query or a connection leak after a release.",
    steps: [
      "Confirm pool saturation in Dynatrace (active connections == max).",
      "Check ServiceNow for a change implemented in the last 2 hours on this CI.",
      "If a recent change is the likely cause, propose rollback under that change's backout plan (lead approval).",
      "Do NOT increase pool size above the DB's max_connections / replicas.",
    ],
  },
  {
    number: "KB0010050",
    title: "Standard rollback of a custom application release",
    appliesTo: ["Clinical Supply Portal"],
    keywords: ["rollback", "release", "deploy", "backout"],
    summary: "Use the backout plan of the originating change; open an Emergency change if outside its window.",
    steps: [
      "Reference the original CHG and its backout plan.",
      "If the CHG is closed or outside window, raise an Emergency change and get lead approval.",
      "Run the pipeline rollback job; watch Dynatrace failure rate and response time for 15 min.",
    ],
  },
  {
    number: "KB0012040",
    title: "LabTrack LIMS: label printing delays",
    appliesTo: ["LabTrack LIMS"],
    keywords: ["label", "printing", "print", "queue", "delay"],
    summary: "Print spooler backlog on the LIMS app server; vendor-supported COTS, raise vendor case if persistent.",
    steps: ["Check print queue depth.", "Restart spooler service (standard change SC-LIMS-04).", "Raise vendor case if recurring."],
  },
];

// ---------------------------------------------------------------------------
// Dynatrace: problems, service metrics, logs
// ---------------------------------------------------------------------------

export interface DtProblem {
  problemId: string;
  displayId: string;
  title: string;
  status: "OPEN" | "CLOSED";
  severityLevel: "AVAILABILITY" | "ERROR" | "PERFORMANCE" | "RESOURCE_CONTENTION" | "CUSTOM_ALERT";
  impactLevel: "APPLICATION" | "SERVICES" | "INFRASTRUCTURE";
  affectedEntityIds: string[];
  rootCauseEntity?: { id: string; name: string };
  startTime: string;
  endTime?: string;
}

export const DT_PROBLEMS: DtProblem[] = [
  {
    problemId: "-4411892731_1764170000000V2",
    displayId: "P-2511734",
    title: "Failure rate increase on Web request service csp-api",
    status: "OPEN",
    severityLevel: "ERROR",
    impactLevel: "SERVICES",
    affectedEntityIds: ["SERVICE-CSP0001"],
    rootCauseEntity: { id: "PROCESS_GROUP_INSTANCE-ORDDB01", name: "csp-orders-db" },
    startTime: minsAgo(22),
  },
  {
    problemId: "-4411892731_1764160000000V2",
    displayId: "P-2511702",
    title: "Response time degradation on csp-api",
    status: "OPEN",
    severityLevel: "PERFORMANCE",
    impactLevel: "SERVICES",
    affectedEntityIds: ["SERVICE-CSP0001"],
    startTime: minsAgo(28),
  },
  {
    problemId: "-2299001122_1764000000000V2",
    displayId: "P-2510950",
    title: "Long garbage-collection time on lims-app-01",
    status: "CLOSED",
    severityLevel: "RESOURCE_CONTENTION",
    impactLevel: "INFRASTRUCTURE",
    affectedEntityIds: ["SERVICE-LIMS0002"],
    startTime: minsAgo(60 * 20),
    endTime: minsAgo(60 * 19),
  },
];

export interface DtServiceMetrics {
  entityId: string;
  responseTimeP90Ms: number;
  failureRatePct: number;
  throughputPerMin: number;
  /** Same metrics for the same hour last week, for comparison */
  baseline: { responseTimeP90Ms: number; failureRatePct: number; throughputPerMin: number };
  lastDeploymentEvent?: { version: string; at: string };
}

export const DT_METRICS: Record<string, DtServiceMetrics> = {
  "SERVICE-CSP0001": {
    entityId: "SERVICE-CSP0001",
    responseTimeP90Ms: 4200,
    failureRatePct: 12.4,
    throughputPerMin: 830,
    baseline: { responseTimeP90Ms: 380, failureRatePct: 0.3, throughputPerMin: 910 },
    lastDeploymentEvent: { version: "2.14.0", at: minsAgo(32) },
  },
  "SERVICE-LIMS0002": {
    entityId: "SERVICE-LIMS0002",
    responseTimeP90Ms: 610,
    failureRatePct: 0.4,
    throughputPerMin: 140,
    baseline: { responseTimeP90Ms: 580, failureRatePct: 0.3, throughputPerMin: 150 },
  },
  "APPLICATION-EXP0003": {
    entityId: "APPLICATION-EXP0003",
    responseTimeP90Ms: 900,
    failureRatePct: 0,
    throughputPerMin: 0, // synthetic only
    baseline: { responseTimeP90Ms: 950, failureRatePct: 0, throughputPerMin: 0 },
  },
};

export interface DtLogRecord {
  timestamp: string;
  entityId: string;
  loglevel: "DEBUG" | "INFO" | "WARN" | "ERROR";
  content: string;
  traceId?: string;
}

export const DT_LOGS: DtLogRecord[] = [
  { timestamp: minsAgo(2), entityId: "SERVICE-CSP0001", loglevel: "ERROR", content: "HikariPool-1 - Connection is not available, request timed out after 30000ms", traceId: "a1f3" },
  { timestamp: minsAgo(3), entityId: "SERVICE-CSP0001", loglevel: "ERROR", content: "POST /api/orders 503 Service Unavailable (db pool exhausted)", traceId: "a1f2" },
  { timestamp: minsAgo(6), entityId: "SERVICE-CSP0001", loglevel: "WARN", content: "DB pool usage 98% (49/50 active)" },
  { timestamp: minsAgo(31), entityId: "SERVICE-CSP0001", loglevel: "INFO", content: "Started csp-api version 2.14.0 (build 8812)" },
  { timestamp: minsAgo(40), entityId: "SERVICE-CSP0001", loglevel: "INFO", content: "Health OK" },
  { timestamp: minsAgo(12), entityId: "SERVICE-LIMS0002", loglevel: "WARN", content: "Print spooler queue depth 37 (threshold 25)" },
];

/** Resolve a user-typed app name/alias to its CMDB record. */
export function findApp(nameOrAlias: string): AppCI | undefined {
  const q = nameOrAlias.trim().toLowerCase();
  return (
    APPS.find((a) => a.name.toLowerCase() === q || a.aliases.includes(q)) ??
    APPS.find((a) => a.name.toLowerCase().includes(q) || a.aliases.some((x) => x.includes(q)))
  );
}

export const knownApps = () => APPS.map((a) => a.name).join(", ");
