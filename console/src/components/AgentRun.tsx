import { memo } from 'react'
import { Brain, CircleCheck, CircleDashed, CircleSlash, FileText, ListChecks, LoaderCircle, OctagonAlert, Target } from 'lucide-react'
import type { PlanStep, Resolution } from '../api/harness'

// Pieces of a live agent run: its thinking, its plan, harness notices, and the final resolution.

export const ThinkingBlock = memo(function ThinkingBlock({ text, live }: { text: string; live: boolean }) {
  return (
    <details className="thinking" open={live || undefined}>
      <summary>
        <Brain size={14} aria-hidden="true" />
        <span>{live ? 'Thinking…' : 'Thought process'}</span>
      </summary>
      <p className="thinking__text">{text}</p>
    </details>
  )
})

const stepIcon = (s: PlanStep['status']) => {
  switch (s) {
    case 'done': return <CircleCheck size={16} aria-label="done" />
    case 'in_progress': return <LoaderCircle size={16} className="spin" aria-label="in progress" />
    case 'skipped': return <CircleSlash size={16} aria-label="skipped" />
    case 'blocked': return <OctagonAlert size={16} aria-label="blocked" />
    default: return <CircleDashed size={16} aria-label="pending" />
  }
}

export const PlanCard = memo(function PlanCard({ goal, steps }: { goal: string; steps: PlanStep[] }) {
  const done = steps.filter((s) => s.status === 'done' || s.status === 'skipped').length
  return (
    <section className="plan" aria-label="Plan">
      <header className="plan__head">
        <ListChecks size={16} aria-hidden="true" />
        <span className="plan__label">Plan</span>
        <span className="badge badge--tint">{done}/{steps.length}</span>
        <span className="plan__file mono">Plan.md</span>
      </header>
      <p className="plan__goal">{goal}</p>
      <ol className="plan__steps">
        {steps.map((s, i) => (
          <li key={i} className={`plan__step plan__step--${s.status ?? 'pending'}`}>
            {stepIcon(s.status)}
            <span>
              {s.title}
              {s.note && <span className="plan__note"> · {s.note}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
})

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
        {r.confidence && <span className="badge badge--tint">{r.confidence} confidence</span>}
        {r.owner && <span className="resolution__owner mono">{r.owner}</span>}
      </header>
      <p className="resolution__summary">{r.summary}</p>
      {r.likely_cause && (
        <p className="resolution__cause"><strong>Likely cause:</strong> {r.likely_cause}</p>
      )}
      {r.evidence && r.evidence.length > 0 && (
        <div>
          <p className="eyebrow">Evidence</p>
          <ul className="resolution__list">{r.evidence.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}
      {r.next_steps && r.next_steps.length > 0 && (
        <div>
          <p className="eyebrow">Next steps</p>
          <ol className="resolution__list">{r.next_steps.map((x, i) => <li key={i}>{x}</li>)}</ol>
        </div>
      )}
      {r.status === 'plan_ready' && (
        <p className="resolution__hint">Reply “go ahead” (with Plan mode off) to run the plan.</p>
      )}
    </section>
  )
})

export const Notices = memo(function Notices({ items }: { items: { kind: 'info' | 'warn' | 'error'; text: string }[] }) {
  return (
    <ul className="notices">
      {items.map((n, i) => (
        <li key={i} className={`notice notice--${n.kind}`}>{n.text}</li>
      ))}
    </ul>
  )
})

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
