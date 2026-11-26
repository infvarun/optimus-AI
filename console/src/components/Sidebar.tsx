import { memo } from 'react'
import { BookOpen, Boxes, ClipboardList, GitPullRequestArrow, MessageSquare, Plus, Siren, X } from 'lucide-react'
import { apps, sessions } from '../data/mock'

const nav = [
  { id: 'chat', label: 'Console', icon: MessageSquare, active: true },
  { id: 'incidents', label: 'Incidents', icon: Siren, count: 2 },
  { id: 'changes', label: 'Changes', icon: GitPullRequestArrow },
  { id: 'requests', label: 'Requests', icon: ClipboardList },
  { id: 'apps', label: 'Applications', icon: Boxes },
  { id: 'kb', label: 'Knowledge', icon: BookOpen },
]

const healthTone = { healthy: 'ok', degraded: 'warn', down: 'bad' } as const

export const Sidebar = memo(function Sidebar({ onClose }: { onClose: () => void }) {
  return (
    <aside className="sidebar" aria-label="Primary">
      <div className="sidebar__head">
        <div className="wordmark">
          <span className="wordmark__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 17 10 7l4 7 2-3 3 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </span>
          <span className="wordmark__text">Optimus</span>
        </div>
        <button className="icon-btn only-mobile" aria-label="Close navigation" onClick={onClose}><X size={18} /></button>
      </div>

      <button className="btn btn--primary btn--block">
        <Plus size={16} aria-hidden="true" /> New session
      </button>

      <nav className="nav">
        {nav.map(({ id, label, icon: Icon, active, count }) => (
          <a key={id} href={`#${id}`} className="nav__item" aria-current={active ? 'page' : undefined}>
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
            {count ? <span className="nav__count">{count}</span> : null}
          </a>
        ))}
      </nav>

      <div className="sidebar__section">
        <h2 className="eyebrow">Your teams' apps</h2>
        <ul className="session-list">
          {apps.map((a) => (
            <li key={a.sysId}>
              <a href={`#${a.sysId}`} className="session session--app">
                <span className="session__title">
                  <span className={`dot dot--${healthTone[a.health]}`} aria-hidden="true" />
                  {a.name}
                  <span className="sr-only">, {a.health}</span>
                </span>
                <span className="session__meta">
                  <span className={`kind kind--${a.kind}`}>{a.kind === 'cots' ? 'COTS' : a.kind === 'saas' ? 'SaaS' : 'Custom'}</span>
                  <span>{a.team.name}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="sidebar__section">
        <h2 className="eyebrow">Recent sessions</h2>
        <ul className="session-list">
          {sessions.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="session" aria-current={i === 0 ? 'true' : undefined}>
                <span className="session__title">{s.title}</span>
                <span className="session__meta">
                  {s.ref && <span className="mono">{s.ref}</span>}
                  <span>{s.when}</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="sidebar__foot">
        <div className="avatar" aria-hidden="true">V</div>
        <div className="sidebar__user">
          <span className="sidebar__name">Varun</span>
          <span className="sidebar__role">Order Management Support</span>
        </div>
      </div>
    </aside>
  )
})
