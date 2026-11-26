import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { ChatPane } from './components/ChatPane'
import { ContextPanel } from './components/ContextPanel'
import { focusApp, incident, model as demoModel, seedMessages, type Env, type Message } from './data/mock'
import { readFile, type RunMode } from './api/harness'
import { now, uid, useAgentRuns } from './run/useAgentRuns'
import { rollbackScript, scriptFor } from './run/demoScripts'

// Palette is only needed after ⌘K, so it stays out of the first bundle chunk.
const CommandPalette = lazy(() => import('./components/CommandPalette'))

export default function App() {
  const [messages, setMessages] = useState<Message[]>(seedMessages)
  const [env, setEnv] = useState<Env>('production')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [drawer, setDrawer] = useState<'nav' | 'context' | null>(null)
  const [mode, setMode] = useState<RunMode>('auto')
  const { health, live, busy, runLive, runScripted, stop, session } = useAgentRuns(setMessages)

  // A running harness gets a clean conversation; otherwise keep the demo one.
  useEffect(() => {
    if (live) setMessages([])
  }, [live])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
      if (e.key === 'Escape') setDrawer(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const run = useCallback(
    (text: string) => {
      if (live) void runLive(text, mode, { app: focusApp.name, incident: incident.number })
      else runScripted(text, scriptFor(text))
    },
    [live, mode, runLive, runScripted],
  )

  const send = useCallback(
    (text: string) => {
      if (busy) return
      setMessages((m) => [...m, { id: uid('m'), role: 'user', time: now(), text }])
      run(text)
    },
    [busy, run],
  )

  const retry = useCallback((prompt: string) => {
    if (!busy) run(prompt)
  }, [busy, run])

  const openFile = useCallback(async (name: string) => {
    if (!session.current) return
    try {
      const body = await readFile(session.current, name)
      setMessages((ms) => [...ms, { id: uid('m'), role: 'agent', time: now(), text: `**${name}**\n\n${body}` }])
    } catch (err) {
      console.warn(err)
    }
  }, [session])

  const decide = useCallback(
    (approvalId: string, approved: boolean) => {
      setMessages((m) =>
        m.map((msg) =>
          msg.role === 'agent' && msg.approval?.id === approvalId
            ? { ...msg, approval: { ...msg.approval, state: approved ? 'approved' : 'rejected' } }
            : msg,
        ),
      )
      if (approved) runScripted('Roll back Clinical Supply Portal to 2.13.1', rollbackScript())
    },
    [runScripted],
  )

  return (
    <div className="app" data-drawer={drawer ?? undefined}>
      <Sidebar onClose={() => setDrawer(null)} />
      <div className="main">
        <TopBar
          env={env}
          onEnvChange={setEnv}
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenNav={() => setDrawer('nav')}
          onOpenContext={() => setDrawer('context')}
        />
        <ChatPane
          messages={messages}
          env={env}
          busy={busy}
          onSend={send}
          onDecide={decide}
          onOpenFile={live ? openFile : undefined}
          mode={mode}
          onModeChange={setMode}
          live={live}
          modelLabel={health ? `${health.provider} · ${health.model}` : `${demoModel.provider} · ${demoModel.name}`}
          onStop={stop}
          onRetry={retry}
        />
      </div>
      <ContextPanel onClose={() => setDrawer(null)} />
      {drawer && <button className="scrim" aria-label="Close panel" onClick={() => setDrawer(null)} />}
      {paletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette onClose={() => setPaletteOpen(false)} onRun={send} />
        </Suspense>
      )}
    </div>
  )
}
