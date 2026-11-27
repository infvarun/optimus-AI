import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Boxes, MessageSquare, Plus, Settings2, Users, X } from 'lucide-react'
import { NavBar, type Bubble } from './components/NavBar'
import { PromptBox } from './components/PromptBox'
import { OnboardingCanvas } from './components/OnboardingCanvas'
import { TeamAppsModal } from './components/TeamAppsModal'
import { IncidentBoard } from './components/IncidentBoard'
import { ResultView } from './components/ResultView'
import { ConfigCanvas } from './components/ConfigCanvas'
import { CopilotSidebar, type HistoryItem, type SideTab } from './components/CopilotSidebar'
import { Markdown } from './components/Markdown'
import { MascotDock, type Mood } from './mascot/MascotDock'
import { flyLabel, nextFrame } from './mascot/motion'
import { useWorkspace } from './state/workspace'
import { incidentsFor, me, type CmdbApp, type DirTeam, type SnIncident } from './data/directory'
import { model as demoModel, type Message } from './data/mock'
import { readFile } from './api/harness'
import { now, uid, useAgentRuns } from './run/useAgentRuns'
import { scriptFor, type CopilotMode } from './run/demoScripts'

type AgentMessage = Extract<Message, { role: 'agent' }>

function greeting(d = new Date()) {
  const h = d.getHours()
  if (h >= 5 && h < 12) return 'Good morning'
  if (h >= 12 && h < 17) return 'Good afternoon'
  if (h >= 17 && h < 22) return 'Good evening'
  return 'Working late'
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function saveJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}

/** Finished messages only, so a saved conversation never restores a half-streamed run. */
const settled = (ms: Message[]) => ms.map((m) => (m.role === 'agent' && m.streaming ? { ...m, streaming: false, phase: 'done' as const, outcome: 'stopped' as const } : m))

export default function App() {
  const ws = useWorkspace()
  const wsRef = useRef(ws)
  wsRef.current = ws
  const [view, setView] = useState<'home' | 'workspace'>(ws.app ? 'workspace' : 'home')
  const [onboarding, setOnboarding] = useState<null | 'team' | 'app'>(null)
  const [canvasMood, setCanvasMood] = useState<Mood>({ expression: 'happy', prop: 'wave' })
  const [messages, setMessages] = useState<Message[]>([])
  const [mode, setMode] = useState<CopilotMode>('agent')
  const [focused, setFocused] = useState<SnIncident | null>(null)
  const [selectedRun, setSelectedRun] = useState<string | null>(null)
  const [pinned, setPinned] = useState<AgentMessage[]>(() => loadJson('optimus.pinned.v1', []))
  const [history, setHistory] = useState<HistoryItem[]>(() => loadJson('optimus.history.v1', []))
  const [sideTab, setSideTab] = useState<SideTab>('chat')
  const [modal, setModal] = useState(false)
  const [note, setNote] = useState<Bubble | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [fileView, setFileView] = useState<{ name: string; body: string } | null>(null)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [idle, setIdle] = useState(false)
  /** True while a name is flying into place, so the next nudge waits for the landing. */
  const [transit, setTransit] = useState(false)
  /** The app whose configuration canvas is open. */
  const [configApp, setConfigApp] = useState<CmdbApp | null>(null)
  const [configMood, setConfigMood] = useState<Mood>({ expression: 'happy', prop: 'clipboard' })
  const { health, live, busy, runLive, runScripted, stop, session } = useAgentRuns(setMessages)

  useEffect(() => saveJson('optimus.pinned.v1', pinned), [pinned])
  useEffect(() => saveJson('optimus.history.v1', history), [history])

  // Prime dozes off after a quiet spell and wakes on any input.
  useEffect(() => {
    let t = window.setTimeout(() => setIdle(true), 90_000)
    const wake = () => {
      setIdle(false)
      window.clearTimeout(t)
      t = window.setTimeout(() => setIdle(true), 90_000)
    }
    window.addEventListener('pointermove', wake, { passive: true })
    window.addEventListener('keydown', wake)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [])

  const toastTimer = useRef(0)
  const showToast = useCallback((t: string) => {
    setToast(t)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3800)
  }, [])

  const noteTimer = useRef(0)
  const flashNote = useCallback((b: Bubble, ms = 9000) => {
    setNote(b)
    window.clearTimeout(noteTimer.current)
    noteTimer.current = window.setTimeout(() => setNote(null), ms)
  }, [])

  const incidents = useMemo(() => (ws.app ? incidentsFor(ws.app) : []), [ws.app])
  const agentMsgs = messages.filter((m): m is AgentMessage => m.role === 'agent')
  const latestRun = agentMsgs[agentMsgs.length - 1] ?? null
  const shownRun = (selectedRun && (agentMsgs.find((m) => m.id === selectedRun) ?? pinned.find((m) => m.id === selectedRun))) || latestRun

  // ---------- Conversation ----------

  const msgsRef = useRef(messages)
  msgsRef.current = messages
  const archive = useCallback(() => {
    const ms = msgsRef.current
    if (ms.length) {
      const first = ms.find((m) => m.role === 'user')
      const item: HistoryItem = { id: uid('h'), title: first?.text ?? 'Conversation', app: ws.app?.name ?? null, when: `${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${now()}`, messages: settled(ms) }
      setHistory((h) => [item, ...h].slice(0, 30))
    }
    setMessages([])
    setSelectedRun(null)
  }, [ws.app])

  const startOver = useCallback(() => {
    if (busy) stop()
    archive()
    setFocused(null)
  }, [busy, stop, archive])

  const run = useCallback(
    (text: string, incident: SnIncident | null) => {
      const ctx: Record<string, string> = { copilot_mode: mode, skills: ws.app ? 'app > team > global' : ws.team ? 'team > global' : 'global' }
      if (ws.app) {
        ctx.app = ws.app.name
        ctx.ci = ws.app.ciId
        ctx.queue = ws.app.queue
      }
      if (ws.team) ctx.team = ws.team.name
      if (incident) ctx.incident = incident.number
      if (live) void runLive(text, mode === 'plan' ? 'plan' : 'auto', ctx)
      else runScripted(text, scriptFor(text, { app: ws.app ?? undefined, incident: incident ?? undefined, mode }))
    },
    [live, mode, runLive, runScripted, ws.app, ws.team],
  )

  const send = useCallback(
    (text: string) => {
      if (busy) return
      setView('workspace')
      setSideTab('chat')
      setSelectedRun(null)
      setMessages((m) => [...m, { id: uid('m'), role: 'user', time: now(), text }])
      run(text, focused)
    },
    [busy, run, focused],
  )

  const retry = useCallback((prompt: string) => !busy && run(prompt, focused), [busy, run, focused])

  const openFile = useCallback(async (name: string) => {
    if (!session.current) return
    try {
      setFileView({ name, body: await readFile(session.current, name) })
    } catch (err) {
      showToast(`Couldn’t open ${name}.`)
      console.warn(err)
    }
  }, [session, showToast])

  const togglePin = useCallback((m: AgentMessage) => {
    setPinned((p) => (p.some((x) => x.id === m.id) ? p.filter((x) => x.id !== m.id) : [{ ...m, streaming: false }, ...p]))
  }, [])

  const restore = useCallback((h: HistoryItem) => {
    if (busy) stop()
    archive()
    setHistory((hs) => hs.filter((x) => x.id !== h.id))
    setMessages(h.messages)
    setSideTab('chat')
    setView('workspace')
  }, [busy, stop, archive])

  // ---------- Onboarding ----------

  const startTeam = useCallback(() => {
    setNote(null)
    setModal(false)
    setView('home')
    setOnboarding('team')
  }, [])
  const startApp = useCallback(() => {
    setNote(null)
    setModal(false)
    setView('home')
    setOnboarding(ws.team ? 'app' : 'team')
  }, [ws.team])

  const onTeamDone = useCallback(
    async (team: DirTeam, from: DOMRect) => {
      setTransit(true)
      setOnboarding(null)
      await nextFrame()
      await flyLabel(team.name, from, '[data-fly-target="team"]', { tone: 'team' })
      setTransit(false)
      const n = wsRef.current.appsOf(team.id).length
      if (n > 0)
        flashNote({
          text: <>You’re in <strong>{team.name}</strong>. It already has {n} apps. Open one, or add yours.</>,
          actions: [{ label: 'Show apps', primary: true, onClick: () => { setNote(null); setModal(true) } }, { label: 'Add an app', onClick: () => { setNote(null); setOnboarding('app') } }],
        }, 14000)
      else flashNote({ text: <>Welcome to <strong>{team.name}</strong>!</>, mood: { expression: 'grin', prop: 'confetti' } }, 2600)
    },
    [flashNote],
  )

  const onAppDone = useCallback(
    async (app: CmdbApp, from: DOMRect) => {
      setTransit(true)
      setOnboarding(null)
      await nextFrame()
      await flyLabel(app.name, from, '[data-fly-target="app-chip"]', { tone: 'app' })
      setTransit(false)
      flashNote({
        mood: { expression: 'joy', prop: 'sign' },
        text: <>All set. Ask me anything about <strong>{app.name}</strong>, or open its workspace to see incidents.</>,
        actions: [{ label: 'Open workspace', primary: true, onClick: () => { setNote(null); setView('workspace') } }],
      }, 14000)
    },
    [flashNote],
  )

  const goApp = useCallback((a: CmdbApp) => {
    if (ws.app?.ciId !== a.ciId) {
      startOver()
      ws.setApp(a.ciId)
    }
    setModal(false)
    setOnboarding(null)
    setView('workspace')
  }, [ws, startOver])

  const pickApp = useCallback((ciId: string | null) => {
    if (ws.app?.ciId === ciId) return
    if (messages.length) startOver()
    ws.setApp(ciId)
  }, [ws, messages.length, startOver])

  const removeApp = useCallback((teamId: string, a: CmdbApp) => {
    if (ws.app?.ciId === a.ciId && ws.team?.id === teamId) {
      startOver()
      setView('home')
    }
    setConfigApp((c) => (c?.ciId === a.ciId ? null : c))
    ws.removeApp(teamId, a.ciId)
    showToast(`Removed ${a.name}.`)
  }, [ws, startOver, showToast])

  const removeTeam = useCallback((teamId: string) => {
    const t = ws.teams.find((x) => x.id === teamId)
    const own = ws.isOwnTeam(teamId)
    if (ws.team?.id === teamId) {
      startOver()
      setView('home')
    }
    setConfigApp(null)
    ws.removeTeam(teamId)
    if (ws.teams.length <= 1) setModal(false)
    showToast(own ? `Deleted ${t?.name ?? 'the team'}.` : `You left ${t?.name ?? 'the team'}.`)
  }, [ws, startOver, showToast])

  const reset = useCallback(() => {
    startOver()
    setConfigApp(null)
    ws.reset()
    setHistory([])
    setPinned([])
    setOnboarding(null)
    setView('home')
    setNote(null)
  }, [startOver, ws])

  // ---------- Mascot: where it is, how it feels, what it says ----------

  const nudge: Bubble | null = onboarding || transit || ws.state.nudgeDismissed ? null
    : !ws.team ? {
        text: 'You don’t have a team yet. Want me to help you get set up?',
        actions: [{ label: 'Yes, let’s go', primary: true, onClick: startTeam }, { label: 'Not now', onClick: () => ws.dismissNudge() }],
      }
    : ws.teamApps.length === 0 ? {
        text: <>You don’t have any app onboarded in <strong>{ws.team.name}</strong>. Want to add one?</>,
        actions: [{ label: 'Add an app', primary: true, onClick: startApp }, { label: 'Not now', onClick: () => ws.dismissNudge() }],
      }
    : null
  const bubble = note ?? nudge
  const flyingMood: Mood | null = transit ? { expression: 'joy', prop: 'wave' } : null

  const lastRunFailed = !busy && !!latestRun?.error
  const mood: Mood = configApp ? configMood
    : onboarding ? canvasMood
    : flyingMood ? flyingMood
    : busy ? { expression: 'focused', pose: 'laptop' }
    : note?.mood ? note.mood
    : bubble ? { expression: 'happy', prop: 'wave' }
    : lastRunFailed ? { expression: 'sad' }
    : idle ? { expression: 'sleepy' }
    : { expression: 'happy' }

  const onMascotClick = () => {
    if (ws.state.nudgeDismissed && (!ws.team || ws.teamApps.length === 0)) return ws.dismissNudge(false)
    flashNote({
      text: ws.app ? <>I’m Prime. I’m looking after <strong>{ws.app.name}</strong> with you.</> : 'I’m Prime, your support sidekick.',
      actions: ws.team ? [{ label: 'Team apps', onClick: () => { setNote(null); setModal(true) } }, { label: 'Add an app', onClick: () => { setNote(null); startApp() } }] : [{ label: 'Set up a team', primary: true, onClick: startTeam }],
    })
  }

  // ---------- Prompt box (shared by home hero and the Copilot sidebar) ----------

  const modelLabel = health ? `${health.provider} · ${health.model}` : demoModel.name
  const promptProps = {
    busy,
    onSend: send,
    onStop: stop,
    mode,
    onModeChange: setMode,
    modelLabel,
    live,
    app: ws.app,
    apps: ws.teamApps,
    onPickApp: pickApp,
    onAddApp: startApp,
  }

  const suggestions = focused
    ? [`Investigate ${focused.number}`, `Draft a status update for ${focused.number}`, 'Find similar incidents']
    : ws.app
      ? [`What changed on ${ws.app.name} in the last 2 hours?`, `Is ${ws.app.name} healthy right now?`, 'Draft a status update for the business']
      : ['How should I triage a P1 incident?', 'What makes a good change backout plan?']

  const first = me.name.split(' ')[0]

  return (
    <div className={`shell${view === 'workspace' ? ' shell--ws' : ''}${bubble ? ' has-bubble' : ''}`}>
      <a href="#main" className="skip">Skip to content</a>
      <NavBar
        teamName={ws.team?.name ?? null}
        mascotAway={onboarding !== null || configApp !== null}
        bubble={bubble}
        onMascotClick={onMascotClick}
        onTeamClick={() => setModal(true)}
        onHome={() => { setOnboarding(null); setConfigApp(null); setView('home') }}
        onReset={reset}
      />

      {configApp ? (
        <main id="main" className="cfgmain">
          <ConfigCanvas
            key={configApp.ciId}
            app={configApp}
            teamName={ws.team?.name ?? null}
            setMood={setConfigMood}
            onClose={() => setConfigApp(null)}
            onSaved={showToast}
          />
        </main>
      ) : view === 'home' ? (
        <main id="main" className="home">
          {onboarding ? (
            <OnboardingCanvas
              kind={onboarding}
              ws={ws}
              setMood={setCanvasMood}
              onTeamDone={onTeamDone}
              onAppDone={onAppDone}
              onCancel={() => setOnboarding(null)}
            />
          ) : (
            <div className="home__inner">
              <h1 className="home__title">{greeting()}, {first}. <span>How can Prime help you today?</span></h1>
              <PromptBox variant="hero" {...promptProps} autoFocus />
              <div className="home__sugg">
                {suggestions.map((s) => <button key={s} className="chip" onClick={() => send(s)} disabled={busy}>{s}</button>)}
              </div>
              {ws.teams.length > 0 && (
                <ul className="teamcards" aria-label="Your teams">
                  {ws.teams.map((t) => {
                    const apps = ws.appsOf(t.id)
                    return (
                      <li key={t.id} className={`teamcard${t.id === ws.team?.id ? ' is-active' : ''}`}>
                        <div className="teamcard__head">
                          <Users size={16} aria-hidden="true" />
                          <h2>{t.name}</h2>
                        </div>
                        <p className="teamcard__meta">{apps.length} {apps.length === 1 ? 'app' : 'apps'} · {t.members} {t.members === 1 ? 'member' : 'members'} · <span className="mono">{t.assignmentGroup}</span></p>
                        {apps.length > 0 && <p className="teamcard__apps">{apps.slice(0, 3).map((a) => a.name).join(' · ')}{apps.length > 3 ? ` +${apps.length - 3}` : ''}</p>}
                        <div className="teamcard__actions">
                          <button className="btn btn--secondary btn--sm" onClick={() => { ws.setTeam(t.id); setModal(true) }}><Boxes size={14} aria-hidden="true" /> Load</button>
                          <button className="btn btn--secondary btn--sm" onClick={() => { ws.setTeam(t.id); setOnboarding('app') }}><Plus size={14} aria-hidden="true" /> Add app</button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </main>
      ) : (
        <div className="ws">
          <main id="main" className="ws__main">
            <header className="ws__head">
              <div>
                <p className="ws__greet">{greeting()}, {first}</p>
                <h1 className="ws__title">
                  {ws.app ? (
                    <>
                      <span className={`health-dot health-dot--${ws.app.health}`} aria-label={`Health: ${ws.app.health}`} />
                      {ws.app.name} <span className="mono ws__ci">{ws.app.ciId}</span>
                    </>
                  ) : 'General support'}
                </h1>
              </div>
              <div className="ws__actions">
                {ws.team && <button className="btn btn--secondary btn--sm" onClick={() => setModal(true)}><Boxes size={14} aria-hidden="true" /> Switch app</button>}
                {ws.app && <button className="btn btn--secondary btn--sm" onClick={() => setConfigApp(ws.app)}><Settings2 size={14} aria-hidden="true" /> Configure</button>}
              </div>
            </header>

            {!ws.app && (
              <div className="notice">
                <p>
                  {ws.team ? <>You haven’t picked an app, so answers come from the <strong>global skill</strong>.</> : <>You haven’t set up a team yet, so answers come from the <strong>global skill</strong> only.</>}
                </p>
                <button className="btn btn--primary btn--sm" onClick={ws.team ? (ws.teamApps.length ? () => setModal(true) : startApp) : startTeam}>
                  {ws.team ? (ws.teamApps.length ? 'Pick an app' : 'Add an app') : 'Set up'} <ArrowRight size={14} aria-hidden="true" />
                </button>
              </div>
            )}

            <div className="ws__stage" key={shownRun ? 'result' : 'board'}>
              {shownRun ? (
                <ResultView
                  run={shownRun}
                  app={ws.app}
                  incident={focused}
                  pinned={pinned.some((p) => p.id === shownRun.id)}
                  onTogglePin={() => togglePin(shownRun)}
                  onStartOver={startOver}
                  onOpenFile={live ? openFile : undefined}
                  onRetry={retry}
                />
              ) : ws.app ? (
                <IncidentBoard app={ws.app} incidents={incidents} focused={focused?.number ?? null} onFocus={(i) => { setFocused((f) => (f?.number === i.number ? null : i)); setCopilotOpen(true) }} />
              ) : (
                <div className="empty empty--ws">
                  <p className="empty__title">Ask Prime anything</p>
                  <p className="empty__text">Results show up here as tables, charts, diagrams and files.</p>
                </div>
              )}
            </div>
          </main>

          <div className={`ws__side${copilotOpen ? ' is-open' : ''}`}>
            <CopilotSidebar
              tab={sideTab}
              onTab={setSideTab}
              messages={messages}
              pinned={pinned}
              history={history}
              selectedRun={shownRun?.id ?? null}
              onSelectRun={setSelectedRun}
              onRestore={restore}
              app={ws.app}
              team={ws.team}
              suggestions={suggestions}
              onSuggest={send}
              busy={busy}
              onClose={() => setCopilotOpen(false)}
              prompt={{
                variant: 'sidebar',
                ...promptProps,
                focus: focused ? { number: focused.number, title: focused.title } : null,
                onClearFocus: () => setFocused(null),
                placeholder: focused ? `Ask about ${focused.number}…` : ws.app ? `Ask about ${ws.app.name}…` : 'Ask a support question…',
              }}
            />
          </div>
          <button className="fab" onClick={() => setCopilotOpen(true)} aria-label="Open Copilot"><MessageSquare size={18} aria-hidden="true" /> Ask Prime</button>
          {copilotOpen && <button className="scrim scrim--side" aria-label="Close Copilot" onClick={() => setCopilotOpen(false)} />}
        </div>
      )}

      {modal && ws.team && (
        <TeamAppsModal
          teams={ws.teams}
          activeTeamId={ws.team.id}
          appsOf={ws.appsOf}
          onSwitchTeam={ws.setTeam}
          onGo={goApp}
          onConfigure={(a) => { setModal(false); setConfigApp(a) }}
          onAddApp={startApp}
          onAddTeam={startTeam}
          onRemoveApp={removeApp}
          onRemoveTeam={removeTeam}
          isOwnTeam={ws.isOwnTeam}
          onClose={() => setModal(false)}
        />
      )}

      {fileView && (
        <div className="modal" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setFileView(null)}>
          <div className="modal__card" role="dialog" aria-modal="true" aria-label={fileView.name}>
            <header className="modal__head">
              <h2>{fileView.name}</h2>
              <button className="icon-btn" aria-label="Close" onClick={() => setFileView(null)}><X size={18} /></button>
            </header>
            <div className="answer"><Markdown text={fileView.body} /></div>
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}

      <MascotDock anchor={configApp ? 'config' : onboarding ? 'canvas' : 'nav'} mood={mood} label={`Prime looks ${busy ? 'busy on a laptop' : mood.expression}`} />
    </div>
  )
}
