// FAKE directory data for onboarding and the app workspace: support teams you can join,
// CMDB applications you can onboard (search by CI ID or name), and ServiceNow incidents.
// The first three apps and INC0104521 match the harness fixtures, so live runs and the
// demo tell the same story. Everything else here is invented for the mock-first build.

export type AppKind = 'custom' | 'saas' | 'cots'
export type Health = 'healthy' | 'degraded' | 'down'

export interface DirTeam {
  id: string
  name: string
  assignmentGroup: string
  description: string
  leads: string[]
  members: number
}

export interface CmdbApp {
  ciId: string
  sysId: string
  name: string
  kind: AppKind
  vendor?: string
  criticality: 1 | 2 | 3
  health: Health
  /** ServiceNow routing used to pull this app's incidents. Queue is mandatory, service preferred, offering optional. */
  queue: string
  service: string
  offering?: string
  dependsOn: string[]
  dynatraceEntityId: string
}

export interface SnIncident {
  number: string
  title: string
  priority: 1 | 2 | 3 | 4
  state: 'New' | 'In Progress' | 'On Hold' | 'Resolved'
  queue: string
  service: string
  offering?: string
  ci: string
  assignedTo: string
  openedBy: string
  updated: string
}

/** The signed-in user (mock). */
export const me = { name: 'Alex Kim', initials: 'AK', userId: 'akim', email: 'alex.kim@example.com' }

export const directoryTeams: DirTeam[] = [
  { id: 't-order', name: 'Order Management Support', assignmentGroup: 'APP-ORDER-MGMT-L2', description: 'Clinical supply ordering and fulfilment apps', leads: ['Priya Raman'], members: 4 },
  { id: 't-lab', name: 'Lab Systems Support', assignmentGroup: 'APP-LAB-SYSTEMS-L2', description: 'LIMS, ELN and lab instrument integrations', leads: ['Marcus Hale', 'Ines Duarte'], members: 6 },
  { id: 't-fin', name: 'Finance Apps Support', assignmentGroup: 'APP-FINANCE-SAAS-L2', description: 'Expense, procurement and invoicing SaaS', leads: ['Grace Okafor'], members: 3 },
  { id: 't-mes', name: 'Manufacturing Execution Support', assignmentGroup: 'APP-MES-L2', description: 'Shop-floor MES, batch records and serialisation', leads: ['Hannah Weiss'], members: 9 },
  { id: 't-reg', name: 'Regulatory Submissions Support', assignmentGroup: 'APP-REG-SUB-L2', description: 'Submission publishing and RIM platforms', leads: ['Omar Haddad'], members: 5 },
  { id: 't-hr', name: 'HR Platforms Support', assignmentGroup: 'APP-HR-SAAS-L2', description: 'Workday integrations and learning platforms', leads: ['Julia Brandt'], members: 4 },
  { id: 't-iam', name: 'Identity Gateway Operations', assignmentGroup: 'PLT-IAM-OPS', description: 'SSO, MFA and the identity gateway', leads: ['Sam Ortiz', 'Ravi Menon'], members: 7 },
  { id: 't-data', name: 'Commercial Analytics Support', assignmentGroup: 'APP-COMM-ANALYTICS-L2', description: 'Commercial data marts and dashboards', leads: ['Elena Rossi'], members: 5 },
]

export const cmdbApps: CmdbApp[] = [
  { ciId: 'CI0001001', sysId: 'ci-0001', name: 'Clinical Supply Portal', kind: 'custom', criticality: 1, health: 'degraded', queue: 'APP-ORDER-MGMT-L2', service: 'Clinical Supply', offering: 'Order Submission', dependsOn: ['CSP Orders DB', 'Identity Gateway', 'LabTrack LIMS'], dynatraceEntityId: 'SERVICE-CSP0001' },
  { ciId: 'CI0001002', sysId: 'ci-0002', name: 'LabTrack LIMS', kind: 'cots', vendor: 'LabTrack Software', criticality: 1, health: 'healthy', queue: 'APP-LAB-SYSTEMS-L2', service: 'Laboratory Systems', offering: 'Sample Management', dependsOn: ['LIMS Oracle DB'], dynatraceEntityId: 'SERVICE-LIMS0002' },
  { ciId: 'CI0001003', sysId: 'ci-0003', name: 'Expense Cloud', kind: 'saas', vendor: 'Expense Cloud Inc.', criticality: 3, health: 'healthy', queue: 'APP-FINANCE-SAAS-L2', service: 'Finance', offering: 'Travel & Expense', dependsOn: ['Identity Gateway'], dynatraceEntityId: 'APPLICATION-EXP0003' },
  { ciId: 'CI0001004', sysId: 'ci-0004', name: 'Clinical Supply Forecaster', kind: 'custom', criticality: 2, health: 'healthy', queue: 'APP-ORDER-MGMT-L2', service: 'Clinical Supply', offering: 'Demand Planning', dependsOn: ['CSP Orders DB', 'Commercial Data Lake'], dynatraceEntityId: 'SERVICE-CSF0004' },
  { ciId: 'CI0001005', sysId: 'ci-0005', name: 'Depot Shipment Tracker', kind: 'custom', criticality: 2, health: 'healthy', queue: 'APP-ORDER-MGMT-L2', service: 'Clinical Supply', offering: 'Logistics', dependsOn: ['Carrier API Hub', 'Identity Gateway'], dynatraceEntityId: 'SERVICE-DST0005' },
  { ciId: 'CI0001006', sysId: 'ci-0006', name: 'Randomisation & Supply (IRT)', kind: 'saas', vendor: 'TrialFlow', criticality: 1, health: 'healthy', queue: 'APP-ORDER-MGMT-L2', service: 'Clinical Supply', dependsOn: ['Identity Gateway'], dynatraceEntityId: 'APPLICATION-IRT0006' },
  { ciId: 'CI0001007', sysId: 'ci-0007', name: 'Electronic Lab Notebook', kind: 'saas', vendor: 'NoteLab', criticality: 2, health: 'healthy', queue: 'APP-LAB-SYSTEMS-L2', service: 'Laboratory Systems', offering: 'Research Records', dependsOn: ['Identity Gateway'], dynatraceEntityId: 'APPLICATION-ELN0007' },
  { ciId: 'CI0001008', sysId: 'ci-0008', name: 'Batch Record Manager', kind: 'cots', vendor: 'Formwise', criticality: 1, health: 'degraded', queue: 'APP-MES-L2', service: 'Manufacturing', offering: 'Electronic Batch Records', dependsOn: ['MES Core', 'Plant Historian'], dynatraceEntityId: 'SERVICE-BRM0008' },
  { ciId: 'CI0001009', sysId: 'ci-0009', name: 'Serialisation Hub', kind: 'custom', criticality: 1, health: 'healthy', queue: 'APP-MES-L2', service: 'Manufacturing', offering: 'Track & Trace', dependsOn: ['MES Core', 'Partner EDI Gateway'], dynatraceEntityId: 'SERVICE-SER0009' },
  { ciId: 'CI0001010', sysId: 'ci-0010', name: 'Submission Publisher', kind: 'cots', vendor: 'RegDocs', criticality: 2, health: 'healthy', queue: 'APP-REG-SUB-L2', service: 'Regulatory', offering: 'eCTD Publishing', dependsOn: ['Document Vault'], dynatraceEntityId: 'SERVICE-SUB0010' },
  { ciId: 'CI0001011', sysId: 'ci-0011', name: 'Procure Connect', kind: 'saas', vendor: 'Procure Co.', criticality: 2, health: 'healthy', queue: 'APP-FINANCE-SAAS-L2', service: 'Finance', offering: 'Procurement', dependsOn: ['Identity Gateway', 'ERP Finance'], dynatraceEntityId: 'APPLICATION-PRC0011' },
  { ciId: 'CI0001012', sysId: 'ci-0012', name: 'Invoice Capture', kind: 'custom', criticality: 3, health: 'healthy', queue: 'APP-FINANCE-SAAS-L2', service: 'Finance', dependsOn: ['ERP Finance'], dynatraceEntityId: 'SERVICE-INV0012' },
  { ciId: 'CI0001013', sysId: 'ci-0013', name: 'Learning Hub', kind: 'saas', vendor: 'Learnly', criticality: 3, health: 'healthy', queue: 'APP-HR-SAAS-L2', service: 'People', offering: 'Training', dependsOn: ['Identity Gateway'], dynatraceEntityId: 'APPLICATION-LRN0013' },
  { ciId: 'CI0001014', sysId: 'ci-0014', name: 'Identity Gateway', kind: 'custom', criticality: 1, health: 'healthy', queue: 'PLT-IAM-OPS', service: 'Identity', offering: 'Single Sign-On', dependsOn: ['Directory Service'], dynatraceEntityId: 'SERVICE-IDG0014' },
  { ciId: 'CI0001015', sysId: 'ci-0015', name: 'Sales Insights Dashboard', kind: 'custom', criticality: 3, health: 'healthy', queue: 'APP-COMM-ANALYTICS-L2', service: 'Commercial', offering: 'Field Analytics', dependsOn: ['Commercial Data Lake'], dynatraceEntityId: 'APPLICATION-SID0015' },
  { ciId: 'CI0001016', sysId: 'ci-0016', name: 'Plant Historian', kind: 'cots', vendor: 'ProcessData', criticality: 2, health: 'healthy', queue: 'APP-MES-L2', service: 'Manufacturing', offering: 'Process Data', dependsOn: [], dynatraceEntityId: 'SERVICE-PHI0016' },
]

export const appByCi = (ciId: string) => cmdbApps.find((a) => a.ciId === ciId)

/** Case-insensitive search on CI ID or app name. */
export function searchApps(q: string): CmdbApp[] {
  const s = q.trim().toLowerCase()
  if (!s) return []
  return cmdbApps.filter((a) => a.ciId.toLowerCase().includes(s) || a.name.toLowerCase().includes(s) || a.sysId.includes(s)).slice(0, 6)
}

export function searchTeams(q: string, extra: DirTeam[] = []): DirTeam[] {
  const s = q.trim().toLowerCase()
  const all = [...directoryTeams, ...extra]
  if (!s) return all.slice(0, 4)
  return all.filter((t) => t.name.toLowerCase().includes(s) || t.assignmentGroup.toLowerCase().includes(s)).slice(0, 5)
}

export const normaliseTeamName = (n: string) => n.trim().replace(/\s+/g, ' ').toLowerCase()

// ---------- Incidents ----------

const people = ['Tom Becker', 'Ana Souza', 'Li Wei', 'Kenji Mori', 'Sara Nilsson', 'Dev Patel', 'Priya Raman']
const templates: [string, 1 | 2 | 3 | 4, SnIncident['state']][] = [
  ['Users unable to log in after password reset', 3, 'In Progress'],
  ['Report export times out for large date ranges', 3, 'New'],
  ['Intermittent 504 on search page', 2, 'In Progress'],
  ['Scheduled job did not run overnight', 3, 'On Hold'],
  ['Email notifications delayed by over an hour', 4, 'New'],
  ['Data mismatch between UI and nightly extract', 3, 'In Progress'],
  ['Slow page loads for EU users', 3, 'New'],
  ['Attachment upload fails above 10 MB', 4, 'On Hold'],
  ['Access request stuck in approval', 4, 'Resolved'],
  ['Certificate expiry warning on API endpoint', 2, 'New'],
]

function hash(s: string) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

/** Deterministic incidents for an app, so the list is stable across reloads. */
export function incidentsFor(app: CmdbApp): SnIncident[] {
  const h = hash(app.ciId)
  const out: SnIncident[] = []
  if (app.sysId === 'ci-0001') {
    out.push({ number: 'INC0104521', title: 'Order submission failing with HTTP 503', priority: 2, state: 'In Progress', queue: app.queue, service: app.service, offering: app.offering, ci: app.name, assignedTo: me.name, openedBy: 'Priya Raman', updated: '4 min ago' })
    out.push({ number: 'INC0103990', title: 'Slow after release 2.13 (pool exhausted, KB0011201)', priority: 3, state: 'Resolved', queue: app.queue, service: app.service, offering: app.offering, ci: app.name, assignedTo: 'Ana Souza', openedBy: me.name, updated: '12 days ago' })
  }
  const n = 7 + (h % 4)
  for (let i = 0; i < n; i++) {
    const [title, priority, state] = templates[(h + i * 7) % templates.length]
    const k = (h >>> (i % 8)) + i
    out.push({
      number: `INC01${String(((h % 9000) + 1000 + i * 37) % 100000).padStart(5, '0')}`,
      title,
      priority,
      state,
      queue: app.queue,
      service: i % 5 === 4 ? `${app.service} (shared)` : app.service,
      offering: i % 3 === 2 ? undefined : app.offering,
      ci: app.name,
      assignedTo: k % 3 === 0 ? me.name : people[k % people.length],
      openedBy: k % 4 === 1 ? me.name : people[(k + 3) % people.length],
      updated: `${1 + ((k * 7) % 50)} ${i < 3 ? 'min' : i < 6 ? 'h' : 'days'} ago`,
    })
  }
  return out
}

/** Failure rate over the last 2 hours, for the result chart (Dynatrace, mock). */
export function failureSeries(app: CmdbApp) {
  const base = app.health === 'degraded' ? 0.4 : 0.2
  const pts = Array.from({ length: 24 }, (_, i) => {
    if (app.health !== 'degraded') return +(base + ((hash(app.ciId + i) % 10) / 40)).toFixed(2)
    if (i < 14) return +(base + ((hash(app.ciId + i) % 10) / 50)).toFixed(2)
    return +(9 + ((hash(app.ciId + i) % 10) / 2.5)).toFixed(1)
  })
  return { title: `${app.name} failure rate`, unit: '%', stepMinutes: 5, points: pts, marker: app.health === 'degraded' ? { at: 14, label: 'CHG0045817 deployed' } : undefined }
}
