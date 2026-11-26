import { memo, useState, useTransition } from 'react'
import { ArrowUpRight, Clock, User, X } from 'lucide-react'
import {
  changes,
  focusApp,
  incident,
  kbArticles,
  metrics,
  problems,
  relatedIncidents,
  requests,
  tools as initialTools,
  type DtMetric,
} from '../data/mock'
import { Sparkline } from './Sparkline'

type Tab = 'overview' | 'dynatrace' | 'servicenow' | 'tools'
const tabs: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'dynatrace', label: 'Dynatrace' },
  { id: 'servicenow', label: 'ServiceNow' },
  { id: 'tools', label: 'Tools' },
]

const fmt = (n: number) => n.toLocaleString('en-US')
const kindLabel = { custom: 'Custom', saas: 'SaaS', cots: 'COTS' } as const
const initials = (name: string) => name.split(' ').map((p) => p[0]).join('')

export const ContextPanel = memo(function ContextPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [, startTransition] = useTransition()

  return (
    <aside className="context" aria-label="Incident context">
      <div className="context__head only-tablet">
        <h2 className="eyebrow">Context</h2>
        <button className="icon-btn" aria-label="Close context panel" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="pill-tabs" role="tablist" aria-label="Context">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            className="pill-tab"
            onClick={() => startTransition(() => setTab(t.id))}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="context__body">
        {tab === 'overview' && <Overview />}
        {tab === 'dynatrace' && <Dynatrace />}
        {tab === 'servicenow' && <ServiceNow />}
        {tab === 'tools' && <Tools />}
      </div>
    </aside>
  )
})

function Overview() {
  const app = focusApp
  return (
    <>
      <section className="card card--coral">
        <div className="card__row">
          <span className="badge badge--sev">P{incident.priority} · High</span>
          <span className="mono card__id">{incident.number}</span>
        </div>
        <h3 className="card__title">{incident.title}</h3>
        <dl className="facts">
          <div><dt><Clock size={14} aria-hidden="true" /> Opened</dt><dd>{incident.opened}</dd></div>
          <div><dt><User size={14} aria-hidden="true" /> Assigned</dt><dd>{incident.assignedTo}</dd></div>
        </dl>
        <a className="link" href="#servicenow">Open in ServiceNow <ArrowUpRight size={14} aria-hidden="true" /></a>
      </section>

      <section className="panel">
        <h2 className="eyebrow">Application</h2>
        <div className="appcard">
          <div className="appcard__top">
            <span className="appcard__name">{app.name}</span>
            <span className={`kind kind--${app.kind}`}>{kindLabel[app.kind]}</span>
          </div>
          <dl className="kv">
            <div><dt>Criticality</dt><dd>{app.criticality} · most critical</dd></div>
            <div><dt>Assignment group</dt><dd className="mono">{app.team.assignmentGroup}</dd></div>
            <div><dt>Dynatrace entity</dt><dd className="mono">{app.dynatraceEntityId}</dd></div>
          </dl>
          <div className="team">
            <span className="team__name">{app.team.name}</span>
            <ul className="people">
              {app.team.leads.map((p) => (
                <li key={p.userId} className="person">
                  <span className="person__avatar person__avatar--lead" aria-hidden="true">{initials(p.name)}</span>
                  <span>{p.name}</span>
                  <span className="person__role">Lead</span>
                </li>
              ))}
              {app.team.members.map((p) => (
                <li key={p.userId} className="person">
                  <span className="person__avatar" aria-hidden="true">{initials(p.name)}</span>
                  <span>{p.name}</span>
                  {p.userId === app.team.onCall && <span className="person__role person__role--oncall">On call</span>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2 className="eyebrow">Matching knowledge</h2>
        <ul className="runbooks">
          {kbArticles.filter((k) => k.match > 50).map((k) => (
            <li key={k.number}>
              <a href={`#${k.number}`} className={`runbook runbook--${k.tone}`}>
                <span className="runbook__title">{k.title}</span>
                <span className="runbook__match mono">{k.number} · {k.match}% match</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function MetricRow({ m }: { m: DtMetric }) {
  const worse = m.higherIsWorse ? m.now > m.baseline * 1.5 : m.now < m.baseline * 0.8
  const tone = worse ? 'bad' : 'ok'
  return (
    <li className="health__row">
      <div className="health__label">
        <span>{m.label}</span>
        <span className="health__base">last week {fmt(m.baseline)}{m.unit === '%' ? '%' : ` ${m.unit}`}</span>
      </div>
      <Sparkline data={m.series} tone={worse ? 'bad' : 'ok'} />
      <span className={`health__val mono health__val--${tone}`}>
        {fmt(m.now)}<small>{m.unit}</small>
      </span>
    </li>
  )
}

function Dynatrace() {
  return (
    <>
      <section className="panel">
        <h2 className="eyebrow">Problems <span className="eyebrow__hint mono">{focusApp.dynatraceEntityId}</span></h2>
        <ul className="list">
          {problems.map((p) => (
            <li key={p.displayId} className="list__row">
              <span className={`status status--${p.status === 'OPEN' ? 'bad' : 'muted'}`}>{p.status === 'OPEN' ? 'Open' : 'Closed'}</span>
              <div className="list__main">
                <span className="list__title">{p.title}</span>
                <span className="list__meta">
                  <span className="mono">{p.displayId}</span>
                  <span>{p.severity.replace('_', ' ').toLowerCase()}</span>
                  <span>{p.started}</span>
                </span>
                {p.rootCause && <span className="list__meta">Root cause: <span className="mono">{p.rootCause}</span></span>}
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2 className="eyebrow">Service health <span className="eyebrow__hint">csp-api · last hour</span></h2>
        <ul className="health">
          {metrics.map((m) => <MetricRow key={m.label} m={m} />)}
        </ul>
        <p className="panel__note">Last deployment: 2.14.0, 32 min ago.</p>
      </section>
    </>
  )
}

function ServiceNow() {
  return (
    <>
      <section className="panel">
        <h2 className="eyebrow">Change requests</h2>
        <ul className="list">
          {changes.map((c) => (
            <li key={c.number} className="list__row">
              <span className={`status status--${c.state === 'Review' ? 'warn' : 'info'}`}>{c.state}</span>
              <div className="list__main">
                <span className="list__title">{c.title}</span>
                <span className="list__meta"><span className="mono">{c.number}</span><span>{c.type}</span><span>{c.when}</span></span>
                <span className="list__meta">{c.ci}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2 className="eyebrow">Other incidents</h2>
        <ul className="list">
          {relatedIncidents.map((i) => (
            <li key={i.number} className="list__row">
              <span className={`status status--${i.state === 'Resolved' ? 'ok' : 'muted'}`}>{i.state}</span>
              <div className="list__main">
                <span className="list__title">{i.title}</span>
                <span className="list__meta"><span className="mono">{i.number}</span><span>P{i.priority}</span><span>{i.ci}</span></span>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2 className="eyebrow">Requests</h2>
        <ul className="list">
          {requests.map((r) => (
            <li key={r.number} className="list__row">
              <span className={`status status--${r.state === 'Pending Approval' ? 'warn' : 'info'}`}>{r.state === 'Pending Approval' ? 'Approval' : 'In progress'}</span>
              <div className="list__main">
                <span className="list__title">{r.title}</span>
                <span className="list__meta"><span className="mono">{r.number}</span><span>{r.ci}</span></span>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="panel">
        <h2 className="eyebrow">CMDB dependencies</h2>
        <ul className="deps">
          {focusApp.dependsOn.map((d) => <li key={d} className="dep">{d}</li>)}
        </ul>
      </section>
    </>
  )
}

function Tools() {
  const [tools, setTools] = useState(initialTools)
  const toggle = (id: string) => setTools((ts) => ts.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)))
  return (
    <section className="panel">
      <h2 className="eyebrow">Tools this session can use</h2>
      <ul className="toollist">
        {tools.map((t) => {
          const unbuilt = t.scope.includes('not built')
          return (
            <li key={t.id} className="toollist__row">
              <div>
                <span className="toollist__name">{t.name}</span>
                <span className="toollist__scope">{t.scope}</span>
              </div>
              <button
                role="switch"
                aria-checked={t.enabled}
                aria-label={`${t.name} tool`}
                className="switch"
                disabled={unbuilt}
                onClick={() => toggle(t.id)}
              >
                <span className="switch__thumb" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
