import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { ChatPane } from './components/ChatPane'
import { ContextPanel } from './components/ContextPanel'
import { model as demoModel, seedMessages, type Env, type Message, type ToolCall } from './data/mock'
import { abortRun, createSession, getHealth, readFile, streamMessage, type HarnessEvent, type Health, type RunMode } from './api/harness'

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
  const [health, setHealth] = useState<Health | null>(null)
  const [mode, setMode] = useState<RunMode>('auto')
  const session = useRef<string | null>(null)
  const run = useRef<AbortController | null>(null)
  const live = health !== null

  // Use the real harness when it's running; otherwise keep the demo conversation.
  useEffect(() => {
    const ac = new AbortController()
    getHealth(ac.signal).then((h) => {
      if (!h) return
      setHealth(h)
      setMessages([])
    })
    return () => ac.abort()
  }, [])

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

  // Live agent run against the harness: one agent message, updated by each streamed event.
  const runLive = useCallback(async (text: string, runMode: RunMode) => {
    const id = uid('m')
    const update = (fn: (m: Extract<Message, { role: 'agent' }>) => Extract<Message, { role: 'agent' }>) =>
      setMessages((ms) => ms.map((m) => (m.id === id && m.role === 'agent' ? fn(m) : m)))
    const started = new Map<string, number>()
    const notice = (kind: 'info' | 'warn' | 'error', t: string) =>
      update((m) => ({ ...m, notices: [...(m.notices ?? []), { kind, text: t }] }))

    setBusy(true)
    setMessages((ms) => [...ms, { id, role: 'agent', time: now(), text: '', streaming: true, tools: [] }])
    const ac = new AbortController()
    run.current = ac
    try {
      if (!session.current) session.current = await createSession()
      await streamMessage(session.current, text, runMode, (e: HarnessEvent) => {
        switch (e.type) {
          case 'turn_start':
            // A new model call: text from the previous step was interim narration, keep it but separate it.
            update((m) => ({
              ...m,
              step: e.step,
              text: m.text && !m.text.endsWith('\n\n') ? m.text + '\n\n' : m.text,
              thinking: m.thinking && !m.thinking.endsWith('\n\n') ? m.thinking + '\n\n' : m.thinking,
            }))
            break
          case 'thinking':
            update((m) => ({ ...m, thinking: (m.thinking ?? '') + e.text }))
            break
          case 'delta':
            update((m) => ({ ...m, text: m.text + e.text }))
            break
          case 'tool_start': {
            started.set(e.toolCallId, performance.now())
            const call: ToolCall = { id: e.toolCallId, name: e.toolName, args: JSON.stringify(e.arguments ?? {}), status: 'running' }
            update((m) => ({ ...m, tools: [...(m.tools ?? []), call] }))
            break
          }
          case 'tool_end': {
            const t0 = started.get(e.toolCallId)
            update((m) => ({
              ...m,
              tools: m.tools?.map((c) =>
                c.id === e.toolCallId
                  ? { ...c, status: e.success ? 'ok' : 'error', output: e.result ?? e.error, durationMs: t0 ? Math.round(performance.now() - t0) : undefined }
                  : c,
              ),
            }))
            break
          }
          case 'plan':
            update((m) => ({ ...m, plan: { goal: e.goal, steps: e.steps } }))
            break
          case 'workspace':
            update((m) => ({ ...m, files: Array.from(new Set([...(m.files ?? []), e.file])) }))
            break
          case 'resolution': {
            const { type: _t, ...r } = e
            update((m) => ({ ...m, resolution: r }))
            break
          }
          case 'continue':
            notice('info', `Stopped before finishing, so Optimus was asked to keep going (${e.attempt}/${e.of}).`)
            break
          case 'limit':
            notice('warn', e.reason === 'timeout' ? 'Stopped: the run hit its time limit.'
              : e.reason === 'max_tool_calls' ? `Stopped after ${e.toolCalls} tool calls (limit).`
              : 'Stopped: the agent ended without a resolution.')
            break
          case 'error':
            notice('error', e.message)
            break
          case 'done':
            update((m) => ({ ...m, streaming: false, files: m.plan ? Array.from(new Set(['Plan.md', ...(m.files ?? [])])) : m.files }))
            break
        }
      }, ac.signal)
    } catch (err) {
      if (!ac.signal.aborted) notice('error', err instanceof Error ? err.message : String(err))
    } finally {
      update((m) => ({ ...m, streaming: false }))
      run.current = null
      setBusy(false)
    }
  }, [])

  const stop = useCallback(() => {
    if (session.current) void abortRun(session.current)
    run.current?.abort()
  }, [])

  const openFile = useCallback(async (name: string) => {
    if (!session.current) return
    try {
      const body = await readFile(session.current, name)
      setMessages((ms) => [...ms, { id: uid('m'), role: 'agent', time: now(), text: `**${name}**\n\n${body}` }])
    } catch (err) {
      console.warn(err)
    }
  }, [])

  const send = useCallback(
    (text: string) => {
      setMessages((m) => [...m, { id: uid('m'), role: 'user', time: now(), text }])
      if (live) {
        void runLive(text, mode)
        return
      }
      runAgentTurn(
        'In the last 2 hours there was one change on Clinical Supply Portal: **CHG0045817** deployed release 2.14.0. Nothing changed on its dependencies (CSP Orders DB, Identity Gateway, LabTrack LIMS). That release is the only change that lines up with the failure spike.',
        { name: 'servicenow_change_search', args: '{"ci":"Clinical Supply Portal","window":"2h","includeDependencies":true}', output: 'CHG0045817  Normal  Review  Deploy Clinical Supply Portal release 2.14.0\n(no changes on CSP Orders DB, Identity Gateway, LabTrack LIMS)' },
      )
    },
    [runAgentTurn, runLive, live, mode],
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
          onStop={live ? stop : undefined}
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
