import { memo, useDeferredValue, useState } from 'react'
import { Lock, Search } from 'lucide-react'
import { me, type CmdbApp, type SnIncident } from '../data/directory'

type Tab = 'assigned' | 'created' | 'queue'

interface Props {
  app: CmdbApp
  incidents: SnIncident[]
  focused: string | null
  onFocus: (inc: SnIncident) => void
}

const stateClass: Record<SnIncident['state'], string> = { New: 'st--new', 'In Progress': 'st--prog', 'On Hold': 'st--hold', Resolved: 'st--done' }

/**
 * ServiceNow incidents for the app, filtered by its routing: queue (mandatory, always on),
 * service (preferred, on by default) and service offering (optional).
 */
export const IncidentBoard = memo(function IncidentBoard({ app, incidents, focused, onFocus }: Props) {
  const [tab, setTab] = useState<Tab>('assigned')
  const [useService, setUseService] = useState(true)
  const [useOffering, setUseOffering] = useState(false)
  const [q, setQ] = useState('')
  const dq = useDeferredValue(q).trim().toLowerCase()

  const scoped = incidents.filter(
    (i) => i.queue === app.queue && (!useService || i.service === app.service) && (!useOffering || !app.offering || i.offering === app.offering),
  )
  const counts = {
    assigned: scoped.filter((i) => i.assignedTo === me.name).length,
    created: scoped.filter((i) => i.openedBy === me.name).length,
    queue: scoped.length,
  }
  const rows = scoped
    .filter((i) => (tab === 'assigned' ? i.assignedTo === me.name : tab === 'created' ? i.openedBy === me.name : true))
    .filter((i) => !dq || i.number.toLowerCase().includes(dq) || i.title.toLowerCase().includes(dq))
    .sort((a, b) => Number(a.state === 'Resolved') - Number(b.state === 'Resolved') || a.priority - b.priority)

  return (
    <section className="board" aria-labelledby="board-title">
      <div className="board__head">
        <h2 id="board-title" className="board__title">Incidents</h2>
        <div className="filters" aria-label="ServiceNow routing">
          <span className="fchip is-on is-locked" title="Queue is required: it comes from the app's configuration">
            <Lock size={12} aria-hidden="true" /> Queue <span className="mono">{app.queue}</span>
          </span>
          <button className={`fchip${useService ? ' is-on' : ''}`} aria-pressed={useService} onClick={() => setUseService((v) => !v)} title="Preferred">
            Service <strong>{app.service}</strong>
          </button>
          {app.offering && (
            <button className={`fchip${useOffering ? ' is-on' : ''}`} aria-pressed={useOffering} onClick={() => setUseOffering((v) => !v)} title="Optional">
              Offering <strong>{app.offering}</strong>
            </button>
          )}
        </div>
      </div>

      <div className="board__bar">
        <div className="tabs" role="tablist" aria-label="Incident views">
          {([['assigned', 'Assigned to me'], ['created', 'Created by me'], ['queue', 'All in queue']] as const).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={`tab${tab === id ? ' is-on' : ''}`} onClick={() => setTab(id)}>
              {label} <span className="tab__count">{counts[id]}</span>
            </button>
          ))}
        </div>
        <div className="field field--icon field--sm">
          <Search size={14} aria-hidden="true" />
          <label htmlFor="inc-q" className="sr-only">Search incidents</label>
          <input id="inc-q" value={q} placeholder="Search number or title" onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <ul className="inclist" aria-label="Incidents">
        {rows.map((i) => (
          <li key={i.number}>
            <button className={`incrow${focused === i.number ? ' is-focused' : ''}`} onClick={() => onFocus(i)} aria-pressed={focused === i.number}>
              <span className={`prio prio--${i.priority}`}>P{i.priority}</span>
              <span className="incrow__main">
                <span className="incrow__title">{i.title}</span>
                <span className="incrow__meta"><span className="mono">{i.number}</span> · {i.assignedTo === me.name ? 'You' : i.assignedTo} · {i.updated}</span>
              </span>
              <span className={`st ${stateClass[i.state]}`}>{i.state}</span>
            </button>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="suggest__empty">{dq ? `No incident matches “${q}”.` : tab === 'assigned' ? 'Nothing assigned to you in this queue. Nice.' : 'No incidents here.'}</li>
        )}
      </ul>
    </section>
  )
})
