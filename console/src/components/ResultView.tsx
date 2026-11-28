import { memo, useMemo, useState } from 'react'
import { Download, FileText, Pin, PinOff, RotateCcw } from 'lucide-react'
import type { Message } from '../data/mock'
import { failureSeries, type CmdbApp, type SnIncident } from '../data/directory'
import { ErrorCard, PlanCard, ResolutionCard, RunFootnote, PHASE_LABEL, toolLabel } from './AgentRun'
import { Markdown } from './Markdown'
import { Mascot } from '../mascot/Mascot'

type AgentMessage = Extract<Message, { role: 'agent' }>
type Tab = 'answer' | 'table' | 'chart' | 'diagram' | 'files'

interface Props {
  run: AgentMessage
  app: CmdbApp | null
  incident: SnIncident | null
  pinned: boolean
  onTogglePin: () => void
  onStartOver: () => void
  onOpenFile?: (name: string) => void
  onRetry?: (prompt: string) => void
}

/** Markdown tables in the answer, as separate blocks. */
function extractTables(md: string): string[] {
  const out: string[] = []
  let cur: string[] = []
  for (const line of md.split('\n')) {
    if (line.trim().startsWith('|')) cur.push(line)
    else if (cur.length) {
      if (cur.length > 1) out.push(cur.join('\n'))
      cur = []
    }
  }
  if (cur.length > 1) out.push(cur.join('\n'))
  return out
}

function download(name: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type: 'text/markdown' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const ResultView = memo(function ResultView({ run, app, incident, pinned, onTogglePin, onStartOver, onOpenFile, onRetry }: Props) {
  const [tab, setTab] = useState<Tab>('answer')
  const tables = useMemo(() => extractTables(run.text), [run.text])
  const done = !run.streaming

  const summaryMd = useMemo(() => {
    const parts = [`# ${run.prompt ?? 'Optimus answer'}`, '', run.text]
    if (run.resolution) {
      parts.push('', '## Summary', run.resolution.summary)
      if (run.resolution.next_steps?.length) parts.push('', '## Next steps', ...run.resolution.next_steps.map((s) => `- ${s}`))
    }
    return parts.join('\n')
  }, [run.prompt, run.text, run.resolution])
  const planMd = run.plan ? [`# ${run.plan.goal}`, '', ...run.plan.steps.map((s) => `- [${s.status === 'done' ? 'x' : ' '}] ${s.title}`)].join('\n') : null

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'answer', label: 'Answer', show: true },
    { id: 'table', label: 'Table', show: true },
    { id: 'chart', label: 'Chart', show: !!app },
    { id: 'diagram', label: 'Diagram', show: !!app },
    { id: 'files', label: 'Files', show: true },
  ]

  return (
    <section className="result" aria-labelledby="result-title">
      <header className="result__head">
        <div className="result__mascot" aria-hidden="true">
          <Mascot size={36} pose={run.streaming ? 'laptop' : 'stand'} expression={run.streaming ? 'focused' : run.error ? 'sad' : 'joy'} />
        </div>
        <div className="result__titles">
          {/* The question itself stays in the chat on the right; here a compact context line is enough. */}
          <h2 id="result-title" className="result__title">{!done ? 'Working on it' : run.plan && !run.resolution && !run.text.trim() ? 'Plan' : 'Answer'}</h2>
          <p className="result__ctx">{incident ? <><span className="mono">{incident.number}</span> · {app?.name}</> : app ? app.name : 'General answer · global skill'} · {run.time}</p>
        </div>
        <div className="result__actions">
          <button className="btn btn--secondary btn--sm" onClick={onTogglePin} aria-pressed={pinned} disabled={!done}>
            {pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />} {pinned ? 'Unpin' : 'Pin'}
          </button>
          <button className="btn btn--secondary btn--sm" onClick={onStartOver}><RotateCcw size={14} aria-hidden="true" /> Start over</button>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="Output">
        {tabs.filter((t) => t.show).map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab${tab === t.id ? ' is-on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
            {t.id === 'table' && tables.length > 0 && <span className="tab__count">{tables.length}</span>}
          </button>
        ))}
      </div>

      <div className="result__panel" role="tabpanel">
        {tab === 'answer' && (
          !done ? (
            <Working run={run} />
          ) : (
            <>
              {/* In Plan mode the plan is the result; otherwise it stays with the process in the sidebar. */}
              {run.plan && !run.resolution && !run.text.trim() && <PlanCard goal={run.plan.goal} steps={run.plan.steps} />}
              {run.text.trim() && <div className="answer"><Markdown text={run.text.trim()} /></div>}
              {run.resolution && <ResolutionCard r={run.resolution} />}
              {run.error && <ErrorCard message={run.error} onRetry={run.prompt && onRetry ? () => onRetry(run.prompt!) : undefined} />}
              <RunFootnote m={run} />
            </>
          )
        )}
        {tab === 'table' && (
          !done ? <Working run={run} /> : tables.length ? (
            tables.map((t, i) => <div key={i} className="answer"><Markdown text={t} /></div>)
          ) : (
            <p className="result__none">This answer has no tables.</p>
          )
        )}
        {tab === 'chart' && app && <FailureChart app={app} />}
        {tab === 'diagram' && app && <DependencyDiagram app={app} />}
        {tab === 'files' && (
          <ul className="filelist">
            <li className="filerow">
              <FileText size={18} aria-hidden="true" />
              <span className="filerow__name">Summary.md</span>
              <span className="filerow__meta">Answer, summary and next steps</span>
              <button className="btn btn--secondary btn--sm" disabled={!done} onClick={() => download('Summary.md', summaryMd)}><Download size={14} aria-hidden="true" /> Download</button>
            </li>
            {planMd && (
              <li className="filerow">
                <FileText size={18} aria-hidden="true" />
                <span className="filerow__name">Plan.md</span>
                <span className="filerow__meta">Session plan</span>
                <button className="btn btn--secondary btn--sm" onClick={() => download('Plan.md', planMd)}><Download size={14} aria-hidden="true" /> Download</button>
              </li>
            )}
            {(run.files ?? []).filter((f) => f !== 'Plan.md').map((f) => (
              <li key={f} className="filerow">
                <FileText size={18} aria-hidden="true" />
                <span className="filerow__name">{f}</span>
                <span className="filerow__meta">Agent workspace</span>
                <button className="btn btn--secondary btn--sm" disabled={!onOpenFile} onClick={() => onOpenFile?.(f)}>Open</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
})

/** Placeholder while the run works. The live process is in the chat on the right. */
function Working({ run }: { run: AgentMessage }) {
  const current = [...(run.tools ?? [])].reverse().find((t) => t.status === 'running' && t.name !== 'update_plan')
  const label = current ? toolLabel(current.name) : PHASE_LABEL[run.phase ?? 'starting']
  return (
    <div className="working" role="status">
      <Mascot size={88} pose="laptop" expression="focused" />
      <p className="working__label shimmer">{label}…</p>
      <p className="working__hint">Prime, your Optimus assistant, is on it. Follow its thinking, plan and checks in the chat on the right. The finished answer appears here.</p>
    </div>
  )
}

// ---------- Chart: failure rate (Dynatrace, mock) ----------

function FailureChart({ app }: { app: CmdbApp }) {
  const s = failureSeries(app)
  const W = 640
  const H = 220
  const pad = { l: 40, r: 16, t: 16, b: 28 }
  const max = Math.max(1, ...s.points) * 1.15
  const x = (i: number) => pad.l + (i / (s.points.length - 1)) * (W - pad.l - pad.r)
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b)
  const line = s.points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const area = `${line} L${x(s.points.length - 1)} ${H - pad.b} L${x(0)} ${H - pad.b} Z`
  const ticks = [0, max / 2, max].map((v) => +v.toFixed(1))
  const last = s.points[s.points.length - 1]
  return (
    <figure className="chart">
      <figcaption className="chart__cap">
        <strong>{s.title}</strong> <span>last 2 hours · 5-minute buckets · Dynatrace (demo data)</span>
        <span className="chart__now">Now <strong>{last}{s.unit}</strong></span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${s.title}: now ${last}${s.unit}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="chart__grid" />
            <text x={pad.l - 8} y={y(t) + 4} className="chart__tick" textAnchor="end">{t}{s.unit}</text>
          </g>
        ))}
        <path d={area} className="chart__area" />
        <path d={line} className="chart__line" />
        {s.marker && (
          <g>
            <line x1={x(s.marker.at)} x2={x(s.marker.at)} y1={pad.t} y2={H - pad.b} className="chart__marker" />
            <text x={x(s.marker.at) + 6} y={pad.t + 12} className="chart__mlabel">{s.marker.label}</text>
          </g>
        )}
        <circle cx={x(s.points.length - 1)} cy={y(last)} r={4} className="chart__dot" />
        <text x={pad.l} y={H - 8} className="chart__tick">−2h</text>
        <text x={W - pad.r} y={H - 8} className="chart__tick" textAnchor="end">now</text>
      </svg>
    </figure>
  )
}

// ---------- Diagram: app and its CMDB dependencies ----------

function DependencyDiagram({ app }: { app: CmdbApp }) {
  const deps = app.dependsOn.length ? app.dependsOn : ['No recorded dependencies']
  const W = 640
  const rowH = 56
  const H = Math.max(180, deps.length * rowH + 40)
  const cx = 150
  const cy = H / 2
  const suspect = app.health === 'degraded' ? deps[0] : null
  return (
    <figure className="diagram">
      <figcaption className="chart__cap"><strong>{app.name}</strong> <span>CMDB dependencies (demo data)</span></figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${app.name} depends on ${deps.join(', ')}`}>
        {deps.map((d, i) => {
          const y = 20 + i * rowH + rowH / 2
          return <path key={`e${d}`} d={`M${cx + 90} ${cy} C${cx + 170} ${cy}, ${380 - 80} ${y}, 380 ${y}`} className={`dg__edge${d === suspect ? ' is-hot' : ''}`} />
        })}
        <g>
          <rect x={cx - 90} y={cy - 28} width={180} height={56} rx={14} className={`dg__node dg__node--app${app.health === 'degraded' ? ' is-hot' : ''}`} />
          <text x={cx} y={cy - 3} className="dg__label" textAnchor="middle">{app.name.length > 22 ? `${app.name.slice(0, 21)}…` : app.name}</text>
          <text x={cx} y={cy + 15} className="dg__sub" textAnchor="middle">{app.ciId}</text>
        </g>
        {deps.map((d, i) => {
          const y = 20 + i * rowH + rowH / 2
          return (
            <g key={d}>
              <rect x={380} y={y - 20} width={220} height={40} rx={20} className={`dg__node${d === suspect ? ' is-hot' : ''}`} />
              <text x={490} y={y + 5} className="dg__label" textAnchor="middle">{d}</text>
            </g>
          )
        })}
      </svg>
      {suspect && <p className="diagram__note">Highlighted: where Dynatrace places the root cause.</p>}
    </figure>
  )
}
