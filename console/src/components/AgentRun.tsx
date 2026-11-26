import { memo, useEffect, useState } from 'react'
import {
  ChevronDown,
  CircleCheck,
  CircleDashed,
  CircleSlash,
  FileText,
  ListChecks,
  LoaderCircle,
  OctagonAlert,
  RotateCcw,
  Target,
  TriangleAlert,
} from 'lucide-react'
import type { PlanStep, Resolution } from '../api/harness'
import type { Message, RunPhase, ToolCall } from '../data/mock'
import { ToolCallRow } from './ToolCallRow'
import { Inline, Markdown } from './Markdown'

type AgentMessage = Extract<Message, { role: 'agent' }>

// ---------- Friendly names for what the agent is doing ----------

const TOOL_LABELS: Record<string, string> = {
  servicenow_cmdb_lookup: 'Looking up the app in the CMDB',
  servicenow_incident_search: 'Searching ServiceNow incidents',
  servicenow_change_search: 'Checking change requests',
  servicenow_kb_search: 'Searching the knowledge base',
  dynatrace_problems: 'Checking Dynatrace problems',
  dynatrace_service_health: 'Reading service health in Dynatrace',
  dynatrace_log_search: 'Searching logs in Dynatrace',
  update_plan: 'Updating the plan',
  pipeline_rollback: 'Running the rollback',
}

export const toolLabel = (name: string) =>
  TOOL_LABELS[name] ?? name.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

const PHASE_LABEL: Record<RunPhase, string> = {
  starting: 'Starting',
  thinking: 'Thinking',
  planning: 'Making a plan',
  checking: 'Checking systems',
  writing: 'Writing the answer',
  done: 'Done',
}

const fmtElapsed = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}

const visibleTools = (tools?: ToolCall[]) => (tools ?? []).filter((t) => t.name !== 'update_plan')

// ---------- Status line: animated while running, a quiet summary after ----------

function useElapsed(startedAt: number | undefined, running: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [running])
  return startedAt ? now - startedAt : 0
}

export const RunStatus = memo(function RunStatus({
  m,
  open,
  onToggle,
}: {
  m: AgentMessage
  open: boolean
  onToggle: () => void
}) {
  const running = !!m.streaming
  const elapsed = useElapsed(m.startedAt, running)
  const tools = visibleTools(m.tools)
  const current = running ? [...tools].reverse().find((t) => t.status === 'running') : undefined
  const label = current ? toolLabel(current.name) : PHASE_LABEL[m.phase ?? 'starting']
  const checks = tools.length
  const hasDetail = !!(m.thinking || m.notes?.length || checks)
  const took = m.endedAt && m.startedAt !== undefined ? m.endedAt - m.startedAt : elapsed

  return (
    <button
      type="button"
      className={`runstatus${running ? ' is-running' : ''}`}
      aria-expanded={open}
      aria-controls={`activity-${m.id}`}
      onClick={onToggle}
      disabled={!hasDetail}
    >
      {running ? <span className="orb" aria-hidden="true" />
        : m.error || m.outcome === 'stopped' ? <CircleSlash size={16} className="runstatus__stopped" aria-hidden="true" />
        : <CircleCheck size={16} className="runstatus__done" aria-hidden="true" />}
      <span className={`runstatus__label${running ? ' shimmer' : ''}`} aria-live="polite">
        {running ? `${label}…` : m.outcome === 'stopped' ? 'Stopped' : m.error ? 'Didn’t finish' : 'Worked'}
      </span>
      <span className="runstatus__meta">
        {fmtElapsed(took)}
        {checks > 0 && ` · ${checks} ${checks === 1 ? 'check' : 'checks'}`}
      </span>
      {hasDetail && <ChevronDown size={16} className="runstatus__chev" aria-hidden="true" />}
    </button>
  )
})

// ---------- Activity: thought process, interim notes, tool calls ----------

export const Activity = memo(function Activity({ m, open }: { m: AgentMessage; open: boolean }) {
  const tools = visibleTools(m.tools)
  return (
    <div id={`activity-${m.id}`} className={`collapse${open ? ' is-open' : ''}`}>
      <div className="collapse__inner">
        <div className="activity">
          {m.thinking && (
            <section className="activity__block">
              <h4 className="activity__title">Thought process</h4>
              <p className="activity__thinking">{m.thinking.trim()}</p>
            </section>
          )}
          {m.notes && m.notes.length > 0 && (
            <section className="activity__block">
              <h4 className="activity__title">Notes along the way</h4>
              {m.notes.map((n, i) => <Markdown key={i} text={n} className="md--quiet" />)}
            </section>
          )}
          {tools.length > 0 && (
            <section className="activity__block">
              <h4 className="activity__title">Checks</h4>
              <ul className="tools" aria-label="Tool calls">
                {tools.map((t) => <ToolCallRow key={t.id} call={t} label={toolLabel(t.name)} />)}
              </ul>
            </section>
          )}
          {m.continues ? (
            <p className="activity__foot">Optimus was prompted to continue {m.continues === 1 ? 'once' : `${m.continues} times`} to finish this run.</p>
          ) : null}
        </div>
      </div>
    </div>
  )
})

// ---------- Plan ----------

const stepIcon = (s: PlanStep['status']) => {
  switch (s) {
    case 'done': return <CircleCheck size={16} aria-label="done" />
    case 'in_progress': return <LoaderCircle size={16} className="spin" aria-label="in progress" />
    case 'skipped': return <CircleSlash size={16} aria-label="skipped" />
    case 'blocked': return <OctagonAlert size={16} aria-label="blocked" />
    default: return <CircleDashed size={16} aria-label="pending" />
  }
}

export const PlanCard = memo(function PlanCard({ goal, steps, running = false }: { goal: string; steps: PlanStep[]; running?: boolean }) {
  const done = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0
  return (
    <section className="plan" aria-label="Plan">
      <header className="plan__head">
        <ListChecks size={16} aria-hidden="true" />
        <span className="plan__label">Plan</span>
        <span className="plan__count mono">{done}/{steps.length}</span>
      </header>
      <div className="plan__bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      <p className="plan__goal">{goal}</p>
      <ol className="plan__steps">
        {steps.map((s, i) => {
          // Once the run is over nothing is "in progress" any more: show unfinished steps as open.
          const status = !running && s.status === 'in_progress' ? 'pending' : s.status ?? 'pending'
          return (
          <li key={`${i}-${s.title}`} className={`plan__step plan__step--${status}`}>
            <span className="plan__icon" key={status}>{stepIcon(status)}</span>
            <span>
              {s.title}
              {s.note && <span className="plan__note"> · <Inline text={s.note} /></span>}
            </span>
          </li>
          )
        })}
      </ol>
    </section>
  )
})

// ---------- Resolution ----------

const statusLabel: Record<Resolution['status'], string> = {
  resolved: 'Likely cause found',
  needs_human: 'Needs a person',
  needs_info: 'Needs more information',
  answered: 'Answered',
  plan_ready: 'Plan ready for review',
}

export const ResolutionCard = memo(function ResolutionCard({ r }: { r: Resolution }) {
  const tone = r.status === 'resolved' || r.status === 'answered' ? 'ok' : r.status === 'plan_ready' ? 'tint' : 'warn'
  return (
    <section className={`resolution resolution--${tone}`} aria-label="Resolution">
      <header className="resolution__head">
        <Target size={16} aria-hidden="true" />
        <span className="resolution__label">{statusLabel[r.status]}</span>
        {r.confidence && <span className={`conf conf--${r.confidence}`}>{r.confidence} confidence</span>}
        {r.owner && <span className="resolution__owner mono">{r.owner}</span>}
      </header>
      <Markdown text={r.summary} className="resolution__summary" />
      {r.likely_cause && (
        <div className="resolution__cause">
          <span className="eyebrow">Likely cause</span>
          <p><Inline text={r.likely_cause} /></p>
        </div>
      )}
      {r.evidence && r.evidence.length > 0 && (
        <div>
          <p className="eyebrow">Evidence</p>
          <ul className="resolution__list">{r.evidence.map((x, i) => <li key={i}><Inline text={x} /></li>)}</ul>
        </div>
      )}
      {r.next_steps && r.next_steps.length > 0 && (
        <div>
          <p className="eyebrow">Next steps</p>
          <ol className="resolution__list">{r.next_steps.map((x, i) => <li key={i}><Inline text={x} /></li>)}</ol>
        </div>
      )}
      {r.status === 'plan_ready' && (
        <p className="resolution__hint">Turn Plan off and reply “go ahead” to run it.</p>
      )}
    </section>
  )
})

// ---------- End-of-run notes ----------

/** One quiet line when a run ended early or without a summary. Never shown while running. */
export function RunFootnote({ m }: { m: AgentMessage }) {
  if (m.streaming || m.error) return null
  const text =
    m.outcome === 'stopped' ? 'Stopped by you.'
    : m.outcome === 'timeout' ? 'Reached the time limit, so this answer may be incomplete.'
    : m.outcome === 'max_tool_calls' ? 'Reached the limit on checks, so this answer may be incomplete.'
    : null
  return text ? <p className="footnote">{text}</p> : null
}

export function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <section className="errcard" role="alert">
      <TriangleAlert size={18} aria-hidden="true" />
      <div className="errcard__body">
        <p className="errcard__title">Optimus couldn’t finish this run</p>
        <p className="errcard__msg">{message}</p>
      </div>
      {onRetry && (
        <button type="button" className="btn btn--secondary errcard__btn" onClick={onRetry}>
          <RotateCcw size={16} aria-hidden="true" /> Retry
        </button>
      )}
    </section>
  )
}

export const FilesRow = memo(function FilesRow({ files, onOpen }: { files: string[]; onOpen?: (name: string) => void }) {
  return (
    <div className="files" aria-label="Workspace files">
      {files.map((f) => (
        <button key={f} className="chip files__chip" onClick={() => onOpen?.(f)} disabled={!onOpen}>
          <FileText size={14} aria-hidden="true" /> {f}
        </button>
      ))}
    </div>
  )
})
