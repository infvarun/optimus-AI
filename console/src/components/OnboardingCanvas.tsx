import { useDeferredValue, useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, Check, CircleAlert, Search, UserPlus, Users, X } from 'lucide-react'
import { searchApps, searchTeams, type CmdbApp, type DirTeam } from '../data/directory'
import type { Mood } from '../mascot/MascotDock'
import type { Workspace } from '../state/workspace'

interface Props {
  kind: 'team' | 'app'
  ws: Workspace
  setMood: (m: Mood) => void
  onTeamDone: (team: DirTeam, from: DOMRect) => void
  onAppDone: (app: CmdbApp, from: DOMRect) => void
  onCancel: () => void
}

const kindLabel = { custom: 'Custom', saas: 'SaaS', cots: 'COTS' } as const

export function OnboardingCanvas({ kind, ws, setMood, onTeamDone, onAppDone, onCancel }: Props) {
  return (
    <section className="canvas" aria-labelledby="canvas-title">
      <div className="canvas__grid" aria-hidden="true" />
      <button className="icon-btn canvas__close" aria-label="Close setup" onClick={onCancel}><X size={18} /></button>
      {kind === 'team' ? (
        <TeamFlow ws={ws} setMood={setMood} onDone={onTeamDone} />
      ) : (
        <AppFlow ws={ws} setMood={setMood} onDone={onAppDone} />
      )}
    </section>
  )
}

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="canvas__head">
      <div className="canvas__anchor" data-mascot-anchor="canvas" />
      <div className="bubble bubble--canvas">
        <h2 id="canvas-title" className="bubble__title">{title}</h2>
        <p className="bubble__text">{sub}</p>
      </div>
    </div>
  )
}

// ---------- Team: create or join ----------

function TeamFlow({ ws, setMood, onDone }: { ws: Workspace; setMood: (m: Mood) => void; onDone: (t: DirTeam, from: DOMRect) => void }) {
  const [branch, setBranch] = useState<'create' | 'join' | null>(null)
  const [name, setName] = useState('')
  const [query, setQuery] = useState('')
  const [pick, setPick] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const pickRef = useRef<HTMLLIElement | null>(null)
  const dq = useDeferredValue(query)
  const results = searchTeams(dq, ws.state.createdTeams).filter((t) => !ws.state.myTeams.includes(t.id))
  const trimmed = name.trim()
  const taken = trimmed.length > 0 && ws.isNameTaken(trimmed)
  const tooShort = trimmed.length > 0 && trimmed.length < 3
  const canCreate = trimmed.length >= 3 && !taken
  const ids = useId()

  useEffect(() => {
    if (done) return setMood({ expression: 'grin', prop: 'confetti' })
    if (branch === 'create') {
      if (taken) return setMood({ expression: 'surprised' })
      if (canCreate) return setMood({ expression: 'joy', prop: 'sign' })
      return setMood({ expression: 'happy', prop: 'clipboard' })
    }
    if (branch === 'join') {
      if (dq && results.length === 0) return setMood({ expression: 'sad' })
      if (pick) return setMood({ expression: 'joy', prop: 'sign' })
      return setMood({ expression: 'curious', prop: 'magnifier' })
    }
    setMood({ expression: 'happy', prop: 'wave' })
  }, [branch, taken, canCreate, dq, results.length, pick, done, setMood])

  const create = () => {
    if (!canCreate || !nameRef.current) return
    const from = nameRef.current.getBoundingClientRect()
    setDone(true)
    const t = ws.createTeam(trimmed)
    window.setTimeout(() => onDone(t, from), 700)
  }
  const join = () => {
    const t = results.find((r) => r.id === pick)
    if (!t) return
    const from = (pickRef.current ?? document.body).getBoundingClientRect()
    setDone(true)
    ws.joinTeam(t.id)
    window.setTimeout(() => onDone(t, from), 700)
  }

  return (
    <div className="canvas__body">
      <Header title="Let’s get you in a team…" sub="Teams share apps, skills and incident queues. Create one, or join the team you already work with." />
      <div className={`tree${branch ? ` tree--${branch}` : ''}`}>
        <svg className="tree__lines" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true">
          <path d="M200 0 V18 M100 18 H300 M100 18 V40 M300 18 V40" />
        </svg>
        <div className="tree__options" role="radiogroup" aria-label="How do you want to start?">
          <button role="radio" aria-checked={branch === 'create'} className={`option${branch === 'create' ? ' is-on' : ''}`} onClick={() => { setBranch('create'); window.setTimeout(() => nameRef.current?.focus(), 50) }}>
            <UserPlus size={20} aria-hidden="true" />
            <span className="option__title">Create a new team</span>
            <span className="option__sub">You become its lead</span>
          </button>
          <button role="radio" aria-checked={branch === 'join'} className={`option${branch === 'join' ? ' is-on' : ''}`} onClick={() => setBranch('join')}>
            <Users size={20} aria-hidden="true" />
            <span className="option__title">Join an existing team</span>
            <span className="option__sub">Search by name or assignment group</span>
          </button>
        </div>

        {branch === 'create' && (
          <div className="panel panel--left" key="create">
            <label className="field__label" htmlFor={`${ids}-name`}>Team name</label>
            <input
              id={`${ids}-name`}
              ref={nameRef}
              className="field"
              value={name}
              maxLength={60}
              placeholder="e.g. Clinical Ops Support"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()}
              aria-invalid={taken || tooShort}
              aria-describedby={`${ids}-status`}
            />
            <p id={`${ids}-status`} className={`field__status${taken ? ' is-bad' : canCreate ? ' is-good' : ''}`} aria-live="polite">
              {taken ? (<><CircleAlert size={14} aria-hidden="true" /> That name is taken. Join that team instead, or pick another name.</>)
                : canCreate ? (<><Check size={14} aria-hidden="true" /> Name is available</>)
                : tooShort ? 'Use at least 3 characters.'
                : 'Names are unique across Optimus.'}
            </p>
            <div className="panel__actions">
              <button className="btn btn--primary" disabled={!canCreate || done} onClick={create}>Create team</button>
            </div>
          </div>
        )}

        {branch === 'join' && (
          <div className="panel panel--right" key="join">
            <label className="field__label" htmlFor={`${ids}-q`}>Search teams</label>
            <div className="field field--icon">
              <Search size={16} aria-hidden="true" />
              <input id={`${ids}-q`} autoFocus value={query} placeholder="Start typing a team or assignment group" onChange={(e) => { setQuery(e.target.value); setPick(null) }} />
            </div>
            <ul className="suggest" role="listbox" aria-label="Teams">
              {results.map((t) => (
                <li
                  key={t.id}
                  role="option"
                  aria-selected={pick === t.id}
                  tabIndex={0}
                  ref={pick === t.id ? (el) => { pickRef.current = el } : undefined}
                  className={`suggest__row${pick === t.id ? ' is-on' : ''}`}
                  onClick={() => setPick(t.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setPick(t.id))}
                >
                  <span className="suggest__main">
                    <span className="suggest__name">{t.name}</span>
                    <span className="suggest__meta"><span className="mono">{t.assignmentGroup}</span> · {t.members} members · lead {t.leads[0]}</span>
                  </span>
                  {pick === t.id && <Check size={16} aria-hidden="true" />}
                </li>
              ))}
              {dq && results.length === 0 && <li className="suggest__empty">No team matches “{dq}”. Try the assignment group, or create a new team.</li>}
            </ul>
            <div className="panel__actions">
              <button className="btn btn--primary" disabled={!pick || done} onClick={join}>Join team</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- App: search only ----------

function AppFlow({ ws, setMood, onDone }: { ws: Workspace; setMood: (m: Mood) => void; onDone: (a: CmdbApp, from: DOMRect) => void }) {
  const [query, setQuery] = useState('')
  const [pick, setPick] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const dq = useDeferredValue(query)
  const results = searchApps(dq)
  const owned = new Set(ws.teamApps.map((a) => a.ciId))
  const pickRef = useRef<HTMLLIElement | null>(null)
  const ids = useId()

  useEffect(() => {
    if (done) return setMood({ expression: 'grin', prop: 'confetti' })
    if (pick) return setMood({ expression: 'joy', prop: 'sign' })
    if (dq && results.length === 0) return setMood({ expression: 'thinking' })
    if (dq) return setMood({ expression: 'happy', prop: 'magnifier' })
    setMood({ expression: 'curious', prop: 'magnifier' })
  }, [dq, results.length, pick, done, setMood])

  const onboard = () => {
    const a = results.find((r) => r.ciId === pick)
    if (!a) return
    const from = (pickRef.current ?? document.body).getBoundingClientRect()
    setDone(true)
    ws.onboardApp(a.ciId)
    window.setTimeout(() => onDone(a, from), 700)
  }

  return (
    <div className="canvas__body">
      <Header
        title={`Add an app to ${ws.team?.name ?? 'your team'}`}
        sub="Search the CMDB by CI ID or app name, then pick it. I’ll use its ServiceNow queue, service and offering to find your incidents."
      />
      <div className="panel panel--wide">
        <label className="field__label" htmlFor={`${ids}-q`}>CI ID or app name</label>
        <div className="field field--icon">
          <Search size={16} aria-hidden="true" />
          <input id={`${ids}-q`} autoFocus value={query} placeholder="e.g. CI0001001 or Clinical Supply" onChange={(e) => { setQuery(e.target.value); setPick(null) }} />
        </div>
        <ul className="suggest" role="listbox" aria-label="Applications">
          {results.map((a) => {
            const has = owned.has(a.ciId)
            return (
              <li
                key={a.ciId}
                role="option"
                aria-selected={pick === a.ciId}
                aria-disabled={has}
                tabIndex={has ? -1 : 0}
                ref={pick === a.ciId ? (el) => { pickRef.current = el } : undefined}
                className={`suggest__row${pick === a.ciId ? ' is-on' : ''}${has ? ' is-disabled' : ''}`}
                onClick={() => !has && setPick(a.ciId)}
                onKeyDown={(e) => !has && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setPick(a.ciId))}
              >
                <span className={`health-dot health-dot--${a.health}`} aria-label={a.health} />
                <span className="suggest__main">
                  <span className="suggest__name">{a.name}</span>
                  <span className="suggest__meta"><span className="mono">{a.ciId}</span> · {kindLabel[a.kind]}{a.vendor ? ` (${a.vendor})` : ''} · queue <span className="mono">{a.queue}</span></span>
                </span>
                {has ? <span className="badge badge--tint">In your team</span> : pick === a.ciId ? <Check size={16} aria-hidden="true" /> : null}
              </li>
            )
          })}
          {dq && results.length === 0 && <li className="suggest__empty">Nothing in the CMDB matches “{dq}”. Check the CI ID in ServiceNow.</li>}
          {!dq && <li className="suggest__empty">Try “CI0001001”, “LIMS” or “Batch”.</li>}
        </ul>
        <div className="panel__actions">
          <button className="btn btn--primary" disabled={!pick || done} onClick={onboard}>Onboard app <ArrowRight size={16} aria-hidden="true" /></button>
        </div>
      </div>
    </div>
  )
}

