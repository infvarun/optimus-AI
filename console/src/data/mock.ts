// FAKE data for the console. Apps, people, tickets and problems mirror
// harness/src/tools/fixtures.ts so the UI and the harness tell the same story.
// Requests (REQ/RITM) are console-only inventions until the harness has a tool for them.
// Delete this file once the console reads from the harness API.

export type Env = 'production' | 'staging' | 'dev'

// ---------- Chat / harness stream ----------

export type ToolStatus = 'running' | 'ok' | 'error'

/** Maps to the harness SSE events tool_start / tool_end. */
export interface ToolCall {
  id: string
  name: string
  args: string
  status: ToolStatus
  durationMs?: number
  output?: string
}

export interface Approval {
  id: string
  action: string
  target: string
  risk: 'low' | 'medium' | 'high'
  reason: string
  approvers: string[]
  change?: string
  state: 'pending' | 'approved' | 'rejected'
}

export type Message =
  | { id: string; role: 'user'; text: string; time: string }
  | {
      id: string
      role: 'agent'
      text: string
      time: string
      tools?: ToolCall[]
      approval?: Approval
      streaming?: boolean
    }

// ---------- CMDB: apps and teams ----------

export type AppKind = 'custom' | 'saas' | 'cots'

export interface Person {
  name: string
  userId: string
}

export interface Team {
  name: string
  assignmentGroup: string
  leads: Person[]
  members: Person[]
  onCall: string
}

export interface App {
  sysId: string
  name: string
  kind: AppKind
  vendor?: string
  criticality: 1 | 2 | 3
  team: Team
  dynatraceEntityId: string
  dependsOn: string[]
  health: 'healthy' | 'degraded' | 'down'
}

const orderTeam: Team = {
  name: 'Order Management Support',
  assignmentGroup: 'APP-ORDER-MGMT-L2',
  leads: [{ name: 'Priya Raman', userId: 'praman' }],
  members: [
    { name: 'Tom Becker', userId: 'tbecker' },
    { name: 'Ana Souza', userId: 'asouza' },
    { name: 'Li Wei', userId: 'lwei' },
  ],
  onCall: 'tbecker',
}

const labTeam: Team = {
  name: 'Lab Systems Support',
  assignmentGroup: 'APP-LAB-SYSTEMS-L2',
  leads: [
    { name: 'Marcus Hale', userId: 'mhale' },
    { name: 'Ines Duarte', userId: 'iduarte' },
  ],
  members: [
    { name: 'Kenji Mori', userId: 'kmori' },
    { name: 'Sara Nilsson', userId: 'snilsson' },
  ],
  onCall: 'kmori',
}

const financeTeam: Team = {
  name: 'Finance Apps Support',
  assignmentGroup: 'APP-FINANCE-SAAS-L2',
  leads: [{ name: 'Grace Okafor', userId: 'gokafor' }],
  members: [{ name: 'Dev Patel', userId: 'dpatel' }],
  onCall: 'dpatel',
}

export const apps: App[] = [
  {
    sysId: 'ci-0001',
    name: 'Clinical Supply Portal',
    kind: 'custom',
    criticality: 1,
    team: orderTeam,
    dynatraceEntityId: 'SERVICE-CSP0001',
    dependsOn: ['CSP Orders DB', 'Identity Gateway', 'LabTrack LIMS'],
    health: 'degraded',
  },
  {
    sysId: 'ci-0002',
    name: 'LabTrack LIMS',
    kind: 'cots',
    vendor: 'LabTrack Software',
    criticality: 1,
    team: labTeam,
    dynatraceEntityId: 'SERVICE-LIMS0002',
    dependsOn: ['LIMS Oracle DB'],
    health: 'healthy',
  },
  {
    sysId: 'ci-0003',
    name: 'Expense Cloud',
    kind: 'saas',
    vendor: 'Expense Cloud Inc.',
    criticality: 3,
    team: financeTeam,
    dynatraceEntityId: 'APPLICATION-EXP0003',
    dependsOn: ['Identity Gateway'],
    health: 'healthy',
  },
]

export const focusApp = apps[0]

// ---------- ServiceNow ITSM ----------

export interface Incident {
  number: string
  title: string
  state: 'New' | 'In Progress' | 'On Hold' | 'Resolved'
  priority: 1 | 2 | 3 | 4
  ci: string
  assignedTo: string
  opened: string
}

export const incident: Incident = {
  number: 'INC0104521',
  title: 'Order submission failing with HTTP 503',
  state: 'In Progress',
  priority: 2,
  ci: 'Clinical Supply Portal',
  assignedTo: 'Tom Becker',
  opened: '25 min ago',
}

export const relatedIncidents: Incident[] = [
  { number: 'INC0103990', title: 'Slow after release 2.13 (pool exhausted, KB0011201)', state: 'Resolved', priority: 3, ci: 'Clinical Supply Portal', assignedTo: 'Ana Souza', opened: '12 days ago' },
  { number: 'INC0104402', title: 'Label printing intermittently delayed', state: 'On Hold', priority: 4, ci: 'LabTrack LIMS', assignedTo: 'Sara Nilsson', opened: '30 h ago' },
]

export interface Change {
  number: string
  title: string
  type: 'Standard' | 'Normal' | 'Emergency'
  state: string
  when: string
  ci: string
}

export const changes: Change[] = [
  { number: 'CHG0045817', title: 'Deploy release 2.14.0', type: 'Normal', state: 'Review', when: 'Implemented 45 to 15 min ago', ci: 'Clinical Supply Portal' },
  { number: 'CHG0045901', title: 'LabTrack vendor patch 9.4.2', type: 'Normal', state: 'Scheduled', when: 'In 2 days', ci: 'LabTrack LIMS' },
]

export interface Request {
  number: string
  title: string
  state: 'Open' | 'Work in Progress' | 'Pending Approval'
  ci: string
}

// Invented: the harness has no request tool yet.
export const requests: Request[] = [
  { number: 'RITM0088123', title: 'Portal access for new depot coordinator', state: 'Pending Approval', ci: 'Clinical Supply Portal' },
  { number: 'RITM0088090', title: 'Increase order export limit to 5,000 rows', state: 'Work in Progress', ci: 'Clinical Supply Portal' },
]

export interface KbArticle {
  number: string
  title: string
  match: number
  tone: 'teal' | 'rose' | 'yellow'
}

export const kbArticles: KbArticle[] = [
  { number: 'KB0011201', title: 'DB connection pool exhausted', match: 94, tone: 'teal' },
  { number: 'KB0010050', title: 'Standard rollback of a custom application release', match: 81, tone: 'rose' },
  { number: 'KB0012040', title: 'LabTrack LIMS: label printing delays', match: 12, tone: 'yellow' },
]

// ---------- Dynatrace ----------

export interface DtProblem {
  displayId: string
  title: string
  status: 'OPEN' | 'CLOSED'
  severity: 'AVAILABILITY' | 'ERROR' | 'PERFORMANCE' | 'RESOURCE_CONTENTION'
  rootCause?: string
  started: string
}

export const problems: DtProblem[] = [
  { displayId: 'P-2511734', title: 'Failure rate increase on csp-api', status: 'OPEN', severity: 'ERROR', rootCause: 'csp-orders-db', started: '22 min ago' },
  { displayId: 'P-2511702', title: 'Response time degradation on csp-api', status: 'OPEN', severity: 'PERFORMANCE', started: '28 min ago' },
  { displayId: 'P-2510950', title: 'Long garbage-collection time on lims-app-01', status: 'CLOSED', severity: 'RESOURCE_CONTENTION', started: '20 h ago' },
]

export interface DtMetric {
  label: string
  unit: string
  now: number
  baseline: number
  series: number[]
  /** true when higher is worse */
  higherIsWorse: boolean
}

// Current and baseline values come from the harness fixtures; the series is drawn to end at them.
export const metrics: DtMetric[] = [
  { label: 'Response time p90', unit: 'ms', now: 4200, baseline: 380, series: [380, 390, 370, 410, 400, 1200, 2600, 3500, 3900, 4100, 4300, 4200], higherIsWorse: true },
  { label: 'Failure rate', unit: '%', now: 12.4, baseline: 0.3, series: [0.3, 0.2, 0.3, 0.4, 0.3, 3.1, 7.8, 10.2, 11.9, 12.1, 12.8, 12.4], higherIsWorse: true },
  { label: 'Throughput', unit: '/min', now: 830, baseline: 910, series: [900, 915, 905, 920, 910, 880, 860, 845, 838, 832, 829, 830], higherIsWorse: false },
]

// ---------- Sessions, tools, prompts ----------

export interface Session {
  id: string
  title: string
  when: string
  ref?: string
}

export const sessions: Session[] = [
  { id: 's1', title: 'Clinical Supply Portal 503s', when: 'Now', ref: 'INC0104521' },
  { id: 's2', title: 'Is LabTrack ready for patch 9.4.2?', when: '2h ago', ref: 'CHG0045901' },
  { id: 's3', title: 'Label printing delays', when: 'Yesterday', ref: 'INC0104402' },
  { id: 's4', title: 'Expense Cloud SSO check', when: 'Mon' },
]

/** Tool names match harness/src/tools. */
export const tools = [
  { id: 'servicenow_cmdb_lookup', name: 'ServiceNow CMDB', scope: 'read', enabled: true },
  { id: 'servicenow_incident_search', name: 'ServiceNow incidents', scope: 'read', enabled: true },
  { id: 'servicenow_change_search', name: 'ServiceNow changes', scope: 'read', enabled: true },
  { id: 'servicenow_kb_search', name: 'ServiceNow knowledge', scope: 'read', enabled: true },
  { id: 'dynatrace_problems', name: 'Dynatrace problems', scope: 'read', enabled: true },
  { id: 'dynatrace_service_health', name: 'Dynatrace service health', scope: 'read', enabled: true },
  { id: 'dynatrace_log_search', name: 'Dynatrace logs', scope: 'read', enabled: true },
  { id: 'pipeline_rollback', name: 'Release rollback', scope: 'write · lead approval · not built yet', enabled: false },
]

export const model = { provider: 'Ollama', name: 'qwen3:8b' }

export const suggestions = [
  'What changed on this app in the last 2 hours?',
  'Draft a status update for the business',
  'Is LabTrack LIMS healthy? Any changes coming up?',
]

export const seedMessages: Message[] = [
  {
    id: 'm1',
    role: 'user',
    time: '16:41',
    text: 'Clinical Supply Portal orders are failing with 503s. What is going on?',
  },
  {
    id: 'm2',
    role: 'agent',
    time: '16:41',
    text:
      'Dynatrace problem **P-2511734** shows the failure rate on `csp-api` at 12.4% (0.3% this time last week), with `csp-orders-db` as the root cause. The logs show the DB connection pool is exhausted. This started about 3 minutes after **CHG0045817** deployed release 2.14.0, and it matches **KB0011201** from the last time this happened (INC0103990).',
    tools: [
      { id: 't1', name: 'servicenow_cmdb_lookup', args: '{"app":"Clinical Supply Portal"}', status: 'ok', durationMs: 120, output: 'ci-0001  Clinical Supply Portal  custom  criticality 1\nteam: Order Management Support (APP-ORDER-MGMT-L2)\nleads: Priya Raman   on-call: Tom Becker\ndynatrace: SERVICE-CSP0001' },
      { id: 't2', name: 'dynatrace_problems', args: '{"entityId":"SERVICE-CSP0001","status":"OPEN"}', status: 'ok', durationMs: 340, output: 'P-2511734  ERROR        Failure rate increase on csp-api   root cause: csp-orders-db\nP-2511702  PERFORMANCE  Response time degradation on csp-api' },
      { id: 't3', name: 'dynatrace_log_search', args: '{"entityId":"SERVICE-CSP0001","level":"ERROR"}', status: 'ok', durationMs: 410, output: 'ERROR  HikariPool-1 - Connection is not available, request timed out after 30000ms\nERROR  POST /api/orders 503 Service Unavailable (db pool exhausted)\nWARN   DB pool usage 98% (49/50 active)\nINFO   Started csp-api version 2.14.0 (build 8812)' },
      { id: 't4', name: 'servicenow_change_search', args: '{"ci":"Clinical Supply Portal","window":"2h"}', status: 'ok', durationMs: 180, output: 'CHG0045817  Normal  Review  Deploy Clinical Supply Portal release 2.14.0\nbackout: Redeploy 2.13.1 via pipeline rollback job (approx. 10 min)' },
      { id: 't5', name: 'servicenow_kb_search', args: '{"query":"connection pool 503","ci":"Clinical Supply Portal"}', status: 'ok', durationMs: 150, output: 'KB0011201  Clinical Supply Portal: DB connection pool exhausted\nKB0010050  Standard rollback of a custom application release' },
    ],
  },
  {
    id: 'm3',
    role: 'agent',
    time: '16:42',
    text:
      'KB0011201 says to roll back under the change\'s backout plan with a lead\'s approval. CHG0045817 is still in Review, so its backout plan applies and no emergency change is needed.',
    approval: {
      id: 'a1',
      action: 'Roll back Clinical Supply Portal to 2.13.1',
      target: 'csp-api · production · 2.14.0 → 2.13.1',
      change: 'CHG0045817 backout plan',
      risk: 'high',
      reason: 'Production change. Runs the pipeline rollback job, about 10 minutes. Order submissions may fail briefly while pods restart.',
      approvers: ['Priya Raman'],
      state: 'pending',
    },
  },
]
