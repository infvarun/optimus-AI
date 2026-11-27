import { useDeferredValue, useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight, LogOut, Plus, Search, Settings2, Trash2, UserPlus, X } from 'lucide-react'
import type { CmdbApp, DirTeam } from '../data/directory'

const PAGE = 4
const kindLabel = { custom: 'Custom', saas: 'SaaS', cots: 'COTS' } as const

interface Props {
  teams: DirTeam[]
  activeTeamId: string
  appsOf: (teamId: string) => CmdbApp[]
  onSwitchTeam: (id: string) => void
  onGo: (app: CmdbApp) => void
  onConfigure: (app: CmdbApp) => void
  onAddApp: () => void
  onAddTeam: () => void
  onRemoveApp: (teamId: string, app: CmdbApp) => void
  onRemoveTeam: (teamId: string) => void
  isOwnTeam: (teamId: string) => boolean
  onClose: () => void
}

export function TeamAppsModal({ teams, activeTeamId, appsOf, onSwitchTeam, onGo, onConfigure, onAddApp, onAddTeam, onRemoveApp, onRemoveTeam, isOwnTeam, onClose }: Props) {
  const [confirmApp, setConfirmApp] = useState<string | null>(null)
  const [confirmTeam, setConfirmTeam] = useState(false)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const dq = useDeferredValue(q)
  const dialog = useRef<HTMLDivElement>(null)
  const team = teams.find((t) => t.id === activeTeamId) ?? teams[0]
  const all = team ? appsOf(team.id) : []
  const s = dq.trim().toLowerCase()
  const filtered = s ? all.filter((a) => a.name.toLowerCase().includes(s) || a.ciId.toLowerCase().includes(s)) : all
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE))
  const view = filtered.slice(page * PAGE, page * PAGE + PAGE)

  useEffect(() => setPage(0), [dq, activeTeamId])
  useEffect(() => { setConfirmTeam(false); setConfirmApp(null) }, [activeTeamId])
  useEffect(() => { if (page > 0 && page >= pages) setPage(pages - 1) }, [page, pages])
  const own = team ? isOwnTeam(team.id) : false
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    dialog.current?.querySelector<HTMLInputElement>('input')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal__card" role="dialog" aria-modal="true" aria-labelledby="apps-title" ref={dialog}>
        <header className="modal__head">
          <div>
            <p className="eyebrow">Team apps</p>
            <h2 id="apps-title">{team?.name}</h2>
          </div>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><X size={18} /></button>
        </header>

        {teams.length > 1 && (
          <div className="tabs tabs--pills" role="tablist" aria-label="Your teams">
            {teams.map((t) => (
              <button key={t.id} role="tab" aria-selected={t.id === team?.id} className={`tab${t.id === team?.id ? ' is-on' : ''}`} onClick={() => onSwitchTeam(t.id)}>{t.name}</button>
            ))}
          </div>
        )}

        <div className="modal__tools">
          <div className="field field--icon field--grow">
            <Search size={16} aria-hidden="true" />
            <label htmlFor="apps-q" className="sr-only">Search apps</label>
            <input id="apps-q" value={q} placeholder="Search apps by name or CI ID" onChange={(e) => setQ(e.target.value)} />
          </div>
          <button className="btn btn--secondary" onClick={onAddApp}><Plus size={16} aria-hidden="true" /> Add app</button>
        </div>

        {all.length === 0 ? (
          <div className="empty">
            <p className="empty__title">No apps onboarded yet</p>
            <p className="empty__text">Add your first app by CI ID or name, and its incidents show up here.</p>
            <button className="btn btn--primary" onClick={onAddApp}><Plus size={16} aria-hidden="true" /> Add app</button>
          </div>
        ) : (
          <>
            <ul className="appgrid" aria-label="Apps">
              {view.map((a) => (
                <li key={a.ciId} className={`appcard${confirmApp === a.ciId ? ' is-confirm' : ''}`}>
                  {confirmApp === a.ciId ? (
                    <div className="confirm" role="alertdialog" aria-labelledby={`rm-${a.ciId}`}>
                      <p id={`rm-${a.ciId}`} className="confirm__title">Remove {a.name} from {team?.name}?</p>
                      <p className="confirm__text">Its incidents leave this team’s workspace. You can add it again by CI ID. Saved chat history stays.</p>
                      <div className="appcard__actions">
                        <button className="btn btn--secondary btn--sm" autoFocus onClick={() => setConfirmApp(null)}>Cancel</button>
                        <button className="btn btn--danger btn--sm" onClick={() => { setConfirmApp(null); team && onRemoveApp(team.id, a) }}><Trash2 size={14} aria-hidden="true" /> Remove app</button>
                      </div>
                    </div>
                  ) : (<>
                  <div className="appcard__top">
                    <span className={`health-dot health-dot--${a.health}`} aria-label={`Health: ${a.health}`} />
                    <span className="appcard__kind">{kindLabel[a.kind]}</span>
                    <span className="mono appcard__ci">{a.ciId}</span>
                    <button className="icon-btn icon-btn--sm icon-btn--danger" aria-label={`Remove ${a.name}`} title="Remove app" onClick={() => setConfirmApp(a.ciId)}><Trash2 size={14} /></button>
                  </div>
                  <h3 className="appcard__name">{a.name}</h3>
                  <p className="appcard__meta">{a.service}{a.offering ? ` · ${a.offering}` : ''}</p>
                  <p className="appcard__meta mono">{a.queue}</p>
                  <div className="appcard__actions">
                    <button className="btn btn--secondary btn--sm" onClick={() => onConfigure(a)}><Settings2 size={14} aria-hidden="true" /> Configure</button>
                    <button className="btn btn--primary btn--sm" onClick={() => onGo(a)}>Go <ArrowRight size={14} aria-hidden="true" /></button>
                  </div>
                  </>)}
                </li>
              ))}
              {view.length === 0 && <li className="suggest__empty">No app matches “{dq}”.</li>}
            </ul>
            <footer className="modal__foot">
              <span className="modal__count">{filtered.length} {filtered.length === 1 ? 'app' : 'apps'}</span>
              <div className="pager">
                <button className="icon-btn" aria-label="Previous apps" disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={18} /></button>
                <span aria-live="polite">{page + 1} / {pages}</span>
                <button className="icon-btn" aria-label="Next apps" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}><ChevronRight size={18} /></button>
              </div>
            </footer>
          </>
        )}
        {confirmTeam && team ? (
          <div className="confirm confirm--team" role="alertdialog" aria-labelledby="rm-team">
            <p id="rm-team" className="confirm__title">{own ? `Delete ${team.name}?` : `Leave ${team.name}?`}</p>
            <p className="confirm__text">
              {own
                ? `This deletes the team and its ${all.length} onboarded ${all.length === 1 ? 'app' : 'apps'} from Optimus. It can’t be undone.`
                : `You stop seeing its ${all.length} ${all.length === 1 ? 'app' : 'apps'}. The team stays in ServiceNow for everyone else, and you can join again.`}
            </p>
            <div className="confirm__actions">
              <button className="btn btn--secondary btn--sm" autoFocus onClick={() => setConfirmTeam(false)}>Cancel</button>
              <button className="btn btn--danger btn--sm" onClick={() => { setConfirmTeam(false); onRemoveTeam(team.id) }}>
                {own ? <><Trash2 size={14} aria-hidden="true" /> Delete team</> : <><LogOut size={14} aria-hidden="true" /> Leave team</>}
              </button>
            </div>
          </div>
        ) : (
          <div className="modal__links">
            <button className="linkbtn" onClick={onAddTeam}><UserPlus size={14} aria-hidden="true" /> Join or create another team</button>
            <button className="linkbtn linkbtn--danger" onClick={() => setConfirmTeam(true)}>
              {own ? <><Trash2 size={14} aria-hidden="true" /> Delete team</> : <><LogOut size={14} aria-hidden="true" /> Leave team</>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
