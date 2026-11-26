import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { ChatPane } from './components/ChatPane'
import { ContextPanel } from './components/ContextPanel'
import { seedMessages, type Env, type Message } from './data/mock'

// Palette is only needed after ⌘K, so it stays out of the first bundle chunk.
const CommandPalette = lazy(() => import('./components/CommandPalette'))

const now = () => new Date().toTimeString().slice(0, 5)
let seq = 100
const uid = (p: string) => `${p}${++seq}`

export default function App() {
  const [messages, setMessages] = useState<Message[]>(seedMessages)
  const [env, setEnv] = useState<Env>('production')
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [drawer, setDrawer] = useState<'nav' | 'context' | null>(null)
  const timers = useRef<number[]>([])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
      if (e.key === 'Escape') setDrawer(null)
    }
    window.addEventListener('keydown', onKey)
    const t = timers.current
    return () => {
      window.removeEventListener('keydown', onKey)
      t.forEach(clearTimeout)
    }
  }, [])

  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])

  // Simulated agent turn: one tool call, then streamed text.
  const runAgentTurn = useCallback(
    (reply: string, tool: { name: string; args: string; output: string }) => {
      const id = uid('m')
      const toolId = uid('t')
      setBusy(true)
      setMessages((m) => [
        ...m,
        {
          id,
          role: 'agent',
          time: now(),
          text: '',
          streaming: true,
          tools: [{ id: toolId, name: tool.name, args: tool.args, status: 'running' }],
        },
      ])
      later(() => {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === id && msg.role === 'agent'
              ? { ...msg, tools: msg.tools?.map((t) => ({ ...t, status: 'ok' as const, durationMs: 640, output: tool.output })) }
              : msg,
          ),
        )
        const words = reply.split(' ')
        words.forEach((_, i) =>
          later(() => {
            const done = i === words.length - 1
            setMessages((m) =>
              m.map((msg) =>
                msg.id === id && msg.role === 'agent'
                  ? { ...msg, text: words.slice(0, i + 1).join(' '), streaming: !done }
                  : msg,
              ),
            )
            if (done) setBusy(false)
          }, 28 * i),
        )
      }, 900)
    },
    [later],
  )

  const send = useCallback(
    (text: string) => {
      setMessages((m) => [...m, { id: uid('m'), role: 'user', time: now(), text }])
      runAgentTurn(
        'In the last 2 hours there was one change on Clinical Supply Portal: **CHG0045817** deployed release 2.14.0. Nothing changed on its dependencies (CSP Orders DB, Identity Gateway, LabTrack LIMS). That release is the only change that lines up with the failure spike.',
        { name: 'servicenow_change_search', args: '{"ci":"Clinical Supply Portal","window":"2h","includeDependencies":true}', output: 'CHG0045817  Normal  Review  Deploy Clinical Supply Portal release 2.14.0\n(no changes on CSP Orders DB, Identity Gateway, LabTrack LIMS)' },
      )
    },
    [runAgentTurn],
  )

  const decide = useCallback(
    (approvalId: string, approved: boolean) => {
      setMessages((m) =>
        m.map((msg) =>
          msg.role === 'agent' && msg.approval?.id === approvalId
            ? { ...msg, approval: { ...msg.approval, state: approved ? 'approved' : 'rejected' } }
            : msg,
        ),
      )
      if (approved) {
        runAgentTurn(
          'Rollback finished. `csp-api` is on 2.13.1, and Dynatrace shows the failure rate back at 0.4%. I added a work note to INC0104521 and CHG0045817. Before 2.14.0 is released again, the team should find the connection leak the release introduced.',
          { name: 'pipeline_rollback', args: '{"app":"Clinical Supply Portal","to":"2.13.1","change":"CHG0045817"}', output: 'rollback job #8813 succeeded in 9m 40s\ncsp-api 2.13.1 healthy · failure rate 0.4%' },
        )
      }
    },
    [runAgentTurn],
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
        <ChatPane messages={messages} env={env} busy={busy} onSend={send} onDecide={decide} />
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
