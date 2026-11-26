import type { HarnessEvent, PlanStep, Resolution } from '../api/harness'

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

export function scriptFor(prompt: string) {
  const p = prompt.toLowerCase()
  if (p.includes('status update')) return statusUpdateScript()
  return changesScript()
}
