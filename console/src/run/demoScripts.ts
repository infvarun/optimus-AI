import type { HarnessEvent, PlanStep, Resolution } from '../api/harness'
import type { CmdbApp, SnIncident } from '../data/directory'

// Scripted runs for demo mode (no harness running). They emit the same events as the
// harness, so the demo exercises the real run UI: thinking, plan, checks, answer.

interface Spec {
  thinking: string
  plan?: { goal: string; steps: string[] }
  tools: { name: string; args: Record<string, unknown>; result: string; ms: number }[]
  answer: string
  resolution?: Resolution
}

function build(spec: Spec): { at: number; e: HarnessEvent }[] {
  const out: { at: number; e: HarnessEvent }[] = []
  let t = 250
  const push = (e: HarnessEvent, gap = 0) => {
    t += gap
    out.push({ at: t, e })
  }
  push({ type: 'run_start', mode: 'auto', limits: { maxToolCalls: 12, maxContinues: 2, timeoutSeconds: 180 } })
  push({ type: 'turn_start', step: 1 })
  for (const chunk of spec.thinking.match(/.{1,24}(\s|$)/g) ?? []) push({ type: 'thinking', text: chunk }, 45)

  const steps: PlanStep[] | undefined = spec.plan?.steps.map((title) => ({ title, status: 'pending' }))
  if (spec.plan && steps) {
    push({ type: 'tool_start', toolCallId: 'plan-1', toolName: 'update_plan', arguments: {} }, 300)
    push({ type: 'plan', file: 'Plan.md', goal: spec.plan.goal, steps: steps.map((s) => ({ ...s })) }, 250)
    push({ type: 'tool_end', toolCallId: 'plan-1', success: true }, 50)
  }

  spec.tools.forEach((tool, i) => {
    if (steps && steps[i]) {
      steps[i].status = 'in_progress'
      push({ type: 'plan', file: 'Plan.md', goal: spec.plan!.goal, steps: steps.map((s) => ({ ...s })) }, 120)
    }
    push({ type: 'turn_start', step: i + 2 }, 150)
    push({ type: 'tool_start', toolCallId: `demo-${i}`, toolName: tool.name, arguments: tool.args }, 120)
    push({ type: 'tool_end', toolCallId: `demo-${i}`, success: true, result: tool.result }, tool.ms)
    if (steps && steps[i]) {
      steps[i].status = 'done'
      push({ type: 'plan', file: 'Plan.md', goal: spec.plan!.goal, steps: steps.map((s) => ({ ...s })) }, 80)
    }
  })

  push({ type: 'turn_start', step: spec.tools.length + 2 }, 200)
  for (const word of spec.answer.match(/\S+\s*/g) ?? []) push({ type: 'delta', text: word }, 22)
  if (spec.resolution) push({ type: 'resolution', ...spec.resolution }, 250)
  push({ type: 'done', outcome: 'resolved', toolCalls: spec.tools.length, steps: spec.tools.length + 2, continues: 0 }, 150)
  return out
}

export const changesScript = () =>
  build({
    thinking:
      'The user wants recent changes on Clinical Supply Portal. Resolve the app in the CMDB first, then search change requests on it and its dependencies for the last two hours.',
    tools: [
      { name: 'servicenow_cmdb_lookup', args: { app: 'Clinical Supply Portal' }, ms: 500, result: '{"name":"Clinical Supply Portal","sysId":"ci-0001","team":"Order Management Support","dependsOn":["CSP Orders DB","Identity Gateway","LabTrack LIMS"]}' },
      { name: 'servicenow_change_search', args: { ci: 'Clinical Supply Portal', window: '2h', includeDependencies: true }, ms: 700, result: 'CHG0045817  Normal  Review  Deploy Clinical Supply Portal release 2.14.0\n(no changes on CSP Orders DB, Identity Gateway, LabTrack LIMS)' },
    ],
    answer:
      'One change touched **Clinical Supply Portal** in the last 2 hours, and nothing changed on its dependencies.\n\n' +
      '| Change | What | State | When |\n|---|---|---|---|\n' +
      '| CHG0045817 | Deploy release 2.14.0 | Review | 45 to 15 min ago |\n\n' +
      'That release is the only change that lines up with the failure spike in P-2511734.',
    resolution: {
      status: 'answered',
      summary: 'Only CHG0045817 (release 2.14.0) changed in the window, and it lines up with the incident.',
      confidence: 'high',
      evidence: ['CHG0045817 implemented 45 to 15 min ago', 'No changes on CSP Orders DB, Identity Gateway or LabTrack LIMS'],
      next_steps: [],
      owner: 'APP-ORDER-MGMT-L2',
    },
  })

export const statusUpdateScript = () =>
  build({
    thinking:
      'Draft a short business-facing status update for INC0104521. Get the current impact from Dynatrace and the incident record so the numbers are right.',
    plan: { goal: 'Draft a business status update for INC0104521', steps: ['Read the incident', 'Get current impact from Dynatrace', 'Write the update'] },
    tools: [
      { name: 'servicenow_incident_search', args: { number: 'INC0104521' }, ms: 500, result: 'INC0104521  P2  In Progress  Clinical Supply Portal: order submission failing with HTTP 503  assigned: tbecker' },
      { name: 'dynatrace_service_health', args: { entityId: 'SERVICE-CSP0001' }, ms: 650, result: '{"responseTimeP90Ms":4200,"failureRatePct":12.4,"throughputPerMin":830}' },
    ],
    answer:
      '### Status update: Clinical Supply Portal\n\n' +
      '**Impact:** About 1 in 8 order submissions are failing. Users see an error and can retry.\n\n' +
      '**Cause:** A software release this afternoon (CHG0045817) is the likely cause.\n\n' +
      '**Next step:** The support team is preparing to roll back to the previous version, about 10 minutes once approved.\n\n' +
      'Tracking in INC0104521. Next update in 30 minutes.',
  })

export const rollbackScript = () =>
  build({
    thinking: 'Approved by a lead. Run the rollback under the CHG0045817 backout plan, then confirm recovery in Dynatrace.',
    tools: [
      { name: 'pipeline_rollback', args: { app: 'Clinical Supply Portal', to: '2.13.1', change: 'CHG0045817' }, ms: 1400, result: 'rollback job #8813 succeeded in 9m 40s' },
      { name: 'dynatrace_service_health', args: { entityId: 'SERVICE-CSP0001' }, ms: 600, result: '{"responseTimeP90Ms":410,"failureRatePct":0.4,"throughputPerMin":905}' },
    ],
    answer:
      'Rollback finished. `csp-api` is on **2.13.1**.\n\n' +
      '| Metric | Before | Now | Last week |\n|---|---:|---:|---:|\n' +
      '| Failure rate | 12.4% | 0.4% | 0.3% |\n| Response time p90 | 4,200 ms | 410 ms | 380 ms |\n\n' +
      'I added work notes to INC0104521 and CHG0045817. Before 2.14.0 goes out again, the team should find the connection leak it introduced.',
  })

export type CopilotMode = 'ask' | 'plan' | 'agent'

/** The Clinical Supply Portal 503 story, matching the harness fixtures. */
export const cspIncidentScript = () =>
  build({
    thinking:
      'INC0104521: order submission failing with 503 on Clinical Supply Portal. Start from the CMDB so every lookup uses the right Dynatrace entity, check open problems and error logs, then look for a change that lines up with the start time and a KB match.',
    plan: {
      goal: 'Find why Clinical Supply Portal orders fail with 503 (INC0104521)',
      steps: [
        'Look up the app and its owning team in the CMDB',
        'Check open Dynatrace problems',
        'Search error logs for csp-api',
        'Find changes on the app in the last 2 hours',
        'Match against known issues in the knowledge base',
      ],
    },
    tools: [
      { name: 'servicenow_cmdb_lookup', args: { app: 'Clinical Supply Portal' }, ms: 450, result: 'ci-0001  Clinical Supply Portal  custom  criticality 1\nteam: Order Management Support (APP-ORDER-MGMT-L2)\ndynatrace: SERVICE-CSP0001' },
      { name: 'dynatrace_problems', args: { entityId: 'SERVICE-CSP0001', status: 'OPEN' }, ms: 650, result: 'P-2511734  ERROR  Failure rate increase on csp-api   root cause: csp-orders-db' },
      { name: 'dynatrace_log_search', args: { entityId: 'SERVICE-CSP0001', level: 'ERROR' }, ms: 700, result: 'ERROR  HikariPool-1 - Connection is not available, request timed out after 30000ms\nWARN   DB pool usage 98% (49/50 active)\nINFO   Started csp-api version 2.14.0 (build 8812)' },
      { name: 'servicenow_change_search', args: { ci: 'Clinical Supply Portal', window: '2h' }, ms: 500, result: 'CHG0045817  Normal  Review  Deploy Clinical Supply Portal release 2.14.0' },
      { name: 'servicenow_kb_search', args: { query: 'connection pool 503', ci: 'Clinical Supply Portal' }, ms: 450, result: 'KB0011201  Clinical Supply Portal: DB connection pool exhausted' },
    ],
    answer:
      'Release **2.14.0** is exhausting the CSP Orders DB connection pool, so order submissions time out and return 503. ' +
      'Dynatrace problem **P-2511734** puts the failure rate on `csp-api` at 12.4% (0.3% this time last week), and errors began about 3 minutes after **CHG0045817** deployed. It matches **KB0011201** from INC0103990.\n\n' +
      '| Signal | Now | Last week | Source |\n|---|---:|---:|---|\n' +
      '| Failure rate | 12.4% | 0.3% | Dynatrace |\n| Response time p90 | 4,200 ms | 380 ms | Dynatrace |\n| DB pool in use | 49/50 | 18/50 | csp-api logs |\n\n' +
      '**Next:** roll back to 2.13.1 under the CHG0045817 backout plan (needs a lead’s approval), then find the leak before re-releasing.',
    resolution: {
      status: 'resolved',
      summary: 'Release 2.14.0 is exhausting the CSP Orders DB connection pool, so orders return 503.',
      likely_cause: 'A connection leak introduced in 2.14.0 (CHG0045817), the same pattern as INC0103990.',
      confidence: 'high',
      evidence: ['P-2511734: failure rate 12.4% vs 0.3% last week', 'HikariPool timeouts, pool at 49/50', 'Errors began ~3 min after 2.14.0 started'],
      next_steps: ['Roll back to 2.13.1 under the CHG0045817 backout plan (lead approval)', 'Fix the leak before re-releasing 2.14.0'],
      owner: 'APP-ORDER-MGMT-L2',
    },
  })

/** Any other incident: a plausible, clearly generic triage. */
export const incidentScript = (app: CmdbApp, inc: SnIncident) =>
  build({
    thinking: `Triage ${inc.number} on ${app.name}. Check the app in the CMDB, open Dynatrace problems, then similar incidents and KB articles in ${app.queue}.`,
    plan: { goal: `Triage ${inc.number}: ${inc.title}`, steps: ['Look up the app in the CMDB', 'Check Dynatrace for open problems', 'Find similar incidents and KB articles'] },
    tools: [
      { name: 'servicenow_cmdb_lookup', args: { ci: app.ciId }, ms: 400, result: `${app.sysId}  ${app.name}  ${app.kind}  criticality ${app.criticality}\nqueue: ${app.queue}\ndynatrace: ${app.dynatraceEntityId}` },
      { name: 'dynatrace_problems', args: { entityId: app.dynatraceEntityId, status: 'OPEN' }, ms: 600, result: app.health === 'healthy' ? 'No open problems.' : 'P-2519920  PERFORMANCE  Response time degradation' },
      { name: 'servicenow_incident_search', args: { ci: app.name, query: inc.title, state: 'Resolved' }, ms: 550, result: 'INC0099112  Resolved  similar symptoms, fixed by clearing the job queue (KB0012044)' },
    ],
    answer:
      `**${inc.number}** looks like a repeat of **INC0099112**. ` +
      `Dynatrace shows ${app.health === 'healthy' ? 'no open problems on' : 'a response-time problem on'} ${app.name}, so the cause is likely in the app, not the platform.\n\n` +
      '| Check | Result |\n|---|---|\n' +
      `| CMDB | ${app.name}, criticality ${app.criticality}, queue ${app.queue} |\n| Dynatrace | ${app.health === 'healthy' ? 'No open problems' : '1 open performance problem'} |\n| Similar incidents | INC0099112 (resolved with KB0012044) |\n\n` +
      '**Next:** follow KB0012044 and confirm with the reporter. This is demo data; connect the harness for real lookups.',
    resolution: {
      status: 'answered',
      summary: `Likely a repeat of INC0099112. Follow KB0012044.`,
      confidence: 'medium',
      evidence: ['Similar resolved incident INC0099112', app.health === 'healthy' ? 'No open Dynatrace problems' : 'Open Dynatrace performance problem'],
      next_steps: ['Apply KB0012044', 'Confirm with the reporter'],
      owner: app.queue,
    },
  })

/** No team or app yet: answer from the global public skill only. */
export const genericScript = (prompt: string) =>
  build({
    thinking: 'No team or app is configured, so only the global skill applies. Give a general answer and suggest onboarding for app-specific help.',
    tools: [{ name: 'skill_lookup', args: { scope: 'global', query: prompt.slice(0, 60) }, ms: 500, result: 'global/incident-triage.md  global/change-basics.md' }],
    answer:
      'Here’s the general approach from the **global support skill**. Onboard your team and app and I can answer with your app’s own runbooks, queues and monitoring.\n\n' +
      '| Step | What to do | Where |\n|---|---|---|\n' +
      '| 1 | Confirm impact and priority | ServiceNow incident |\n| 2 | Check open problems and recent errors | Dynatrace |\n' +
      '| 3 | Look for changes in the last few hours | ServiceNow changes |\n| 4 | Search known errors and KB articles | ServiceNow KB |\n| 5 | Fix, or route to the owning team | Assignment group |',
  })

/** Plan mode: write the plan only, no investigation. */
export const planScript = (prompt: string, appName?: string) => {
  const steps = ['Confirm scope and impact', `Check ${appName ?? 'the app'} health in Dynatrace`, 'Review recent changes and similar incidents', 'Propose a fix and a rollback path', 'Write it up for the team']
  const out = build({
    thinking: 'Plan mode: write the plan to Plan.md and stop for review before doing anything.',
    plan: { goal: prompt, steps },
    tools: [],
    answer: 'I wrote the plan to **Plan.md**. Review it, then switch to **Agent** to run it.',
    resolution: { status: 'plan_ready', summary: 'Plan ready for review.', next_steps: ['Review Plan.md', 'Run it in Agent mode'] },
  })
  return out.map((x) => (x.e.type === 'done' ? { ...x, e: { ...x.e, outcome: 'answered' as const } } : x))
}

export function scriptFor(prompt: string, ctx: { app?: CmdbApp; incident?: SnIncident; mode?: CopilotMode } = {}) {
  const p = prompt.toLowerCase()
  if (ctx.mode === 'plan') return planScript(prompt, ctx.app?.name)
  if (!ctx.app) return genericScript(prompt)
  if (p.includes('status update')) return statusUpdateScript()
  if (ctx.incident?.number === 'INC0104521') return cspIncidentScript()
  if (ctx.incident) return incidentScript(ctx.app, ctx.incident)
  if (ctx.app.sysId === 'ci-0001') return changesScript()
  return incidentScript(ctx.app, { number: 'INC0110001', title: prompt, priority: 3, state: 'New', queue: ctx.app.queue, service: ctx.app.service, ci: ctx.app.name, assignedTo: '', openedBy: '', updated: '' })
}
