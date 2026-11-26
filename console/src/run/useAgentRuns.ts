import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  abortRun,
  createSession,
  getHealth,
  HarnessError,
  streamMessage,
  type HarnessEvent,
  type Health,
  type RunMode,
} from '../api/harness'
import type { Message, ToolCall } from '../data/mock'

type AgentMessage = Extract<Message, { role: 'agent' }>
type Setter = Dispatch<SetStateAction<Message[]>>

export const now = () => new Date().toTimeString().slice(0, 5)
let seq = 1000
export const uid = (p: string) => `${p}${++seq}`

/**
 * Turns a harness event stream into one agent message.
 * Shared by live runs and the scripted demo, so both look and behave the same.
 *
 * - Text from earlier steps becomes `notes` (shown under Activity); only the last
 *   step's text is the answer. That stops interim narration piling up as repeats.
 * - Harness nudges (`continue`) and limits are bookkeeping, never user-facing rows.
 * - Deltas are batched per animation frame so long answers stream smoothly.
 */
export function createRun(setMessages: Setter, prompt: string) {
  const id = uid('m')
  const started = new Map<string, number>()
  let pendingText = ''
  let pendingThinking = ''
  let raf = 0
  let harnessError: string | undefined
  let finished = false

  const update = (fn: (m: AgentMessage) => AgentMessage) =>
    setMessages((ms) => ms.map((m) => (m.id === id && m.role === 'agent' ? fn(m) : m)))

  const flush = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    const t = pendingText
    const th = pendingThinking
    pendingText = ''
    pendingThinking = ''
    if (!t && !th) return
    update((m) => ({
      ...m,
      text: m.text + t,
      thinking: th ? (m.thinking ?? '') + th : m.thinking,
      phase: t ? 'writing' : m.phase === 'starting' ? 'thinking' : m.phase,
    }))
  }
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(flush)
  }

  setMessages((ms) => [
    ...ms,
    { id, role: 'agent', time: now(), text: '', streaming: true, tools: [], notes: [], phase: 'starting', startedAt: Date.now(), prompt },
  ])

  const onEvent = (e: HarnessEvent) => {
    if (finished) return
    switch (e.type) {
      case 'turn_start':
        flush()
        update((m) => {
          const t = m.text.trim()
          return t ? { ...m, step: e.step, notes: [...(m.notes ?? []), t], text: '' } : { ...m, step: e.step }
        })
        break
      case 'thinking':
        pendingThinking += e.text
        schedule()
        break
      case 'delta':
        pendingText += e.text
        schedule()
        break
      case 'message':
        // Providers that don't stream deltas still send the whole message.
        flush()
        update((m) => (m.text.trim() || !e.content?.trim() ? m : { ...m, text: e.content, phase: 'writing' }))
        break
      case 'tool_start': {
        flush()
        started.set(e.toolCallId, performance.now())
        const call: ToolCall = { id: e.toolCallId, name: e.toolName, args: JSON.stringify(e.arguments ?? {}), status: 'running' }
        update((m) => ({ ...m, tools: [...(m.tools ?? []), call], phase: e.toolName === 'update_plan' ? 'planning' : 'checking' }))
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
        flush()
        const { type: _t, ...r } = e
        update((m) => ({ ...m, resolution: r }))
        break
      }
      case 'continue':
        update((m) => ({ ...m, continues: e.attempt }))
        break
      case 'limit':
        update((m) => ({ ...m, outcome: e.reason === 'max_continues' ? 'no_resolution' : e.reason }))
        break
      case 'error':
        harnessError = e.message
        console.warn('[harness]', e.message)
        break
      case 'done':
        flush()
        update((m) => ({
          ...m,
          // done.answer repeats the streamed text; use it only if nothing streamed.
          text: m.text.trim() || !e.answer?.trim() ? m.text : e.answer,
          outcome: m.outcome === 'timeout' || m.outcome === 'max_tool_calls' ? m.outcome : e.outcome ?? m.outcome,
          files: m.plan ? Array.from(new Set(['Plan.md', ...(m.files ?? [])])) : m.files,
        }))
        break
      default:
        break
    }
  }

  /** Close out the message. `failure` is a user-facing error; `stopped` means the user pressed Stop. */
  const finish = (opts: { failure?: string; stopped?: boolean } = {}) => {
    if (finished) return
    flush()
    finished = true
    update((m) => {
      let text = m.text
      let notes = m.notes ?? []
      // The last step produced no text (it ended on a tool call): promote the last note to the answer.
      if (!text.trim() && notes.length) {
        text = notes[notes.length - 1]
        notes = notes.slice(0, -1)
      }
      const hasAnswer = !!text.trim() || !!m.resolution
      const error =
        opts.stopped ? undefined
        : opts.failure ?? (!hasAnswer ? (harnessError ?? 'Optimus couldn’t put together an answer this time. Try again, or add the app or incident number to your question.') : undefined)
      return {
        ...m,
        text,
        notes,
        streaming: false,
        phase: 'done',
        endedAt: Date.now(),
        error,
        outcome: opts.stopped ? 'stopped' : error ? 'error' : m.outcome,
        tools: m.tools?.map((t) => (t.status === 'running' ? { ...t, status: 'error' as const, output: t.output ?? 'Did not finish.' } : t)),
      }
    })
  }

  return { id, onEvent, finish }
}

function friendlyError(err: unknown): string {
  if (err instanceof HarnessError) {
    if (err.status === 409) return 'Optimus is still working on the previous message. Wait for it to finish, or press Stop.'
    if (err.status === 429) return 'Too many open sessions on the harness. Close an old session and retry.'
    if (err.status === 401) return 'The harness rejected the API token. Check VITE_HARNESS_TOKEN.'
    if (err.status && err.status >= 500) return `The harness isn’t responding (HTTP ${err.status}). Check that it’s running, then retry.`
    return err.message
  }
  if (err instanceof TypeError) return 'Can’t reach the harness. Check that it’s running, then retry.'
  return err instanceof Error ? err.message : String(err)
}

/** Owns harness health, the session, and the active run. */
export function useAgentRuns(setMessages: Setter) {
  const [health, setHealth] = useState<Health | null>(null)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const session = useRef<string | null>(null)
  const active = useRef<AbortController | null>(null)
  const timers = useRef<number[]>([])

  useEffect(() => {
    const ac = new AbortController()
    getHealth(ac.signal).then((h) => {
      setHealth(h)
      setChecked(true)
    })
    const t = timers.current
    return () => {
      ac.abort()
      t.forEach(clearTimeout)
    }
  }, [])

  const runLive = useCallback(
    async (prompt: string, mode: RunMode, context?: Record<string, string>) => {
      const ac = new AbortController()
      active.current = ac
      setBusy(true)
      const run = createRun(setMessages, prompt)
      try {
        if (!session.current) session.current = await createSession()
        let gotDone: boolean
        try {
          gotDone = await streamMessage(session.current, prompt, mode, run.onEvent, ac.signal, context)
        } catch (err) {
          // The harness restarted and forgot our session: start a new one and try once more.
          if (err instanceof HarnessError && err.status === 404 && !ac.signal.aborted) {
            session.current = await createSession()
            gotDone = await streamMessage(session.current, prompt, mode, run.onEvent, ac.signal, context)
          } else throw err
        }
        if (ac.signal.aborted) run.finish({ stopped: true })
        else if (!gotDone) run.finish({ failure: 'The connection to the harness closed before the run finished.' })
        else run.finish()
      } catch (err) {
        if (ac.signal.aborted) run.finish({ stopped: true })
        else {
          run.finish({ failure: friendlyError(err) })
          // Harness down? Re-check so the badge tells the truth.
          if (err instanceof TypeError || (err instanceof HarnessError && (err.status ?? 0) >= 500)) {
            getHealth().then((h) => h && setHealth(h))
          }
        }
      } finally {
        if (active.current === ac) active.current = null
        setBusy(false)
      }
    },
    [setMessages],
  )

  /** Plays a scripted event list through the same reducer, for demo mode. */
  const runScripted = useCallback(
    (prompt: string, script: { at: number; e: HarnessEvent }[]) => {
      setBusy(true)
      const run = createRun(setMessages, prompt)
      const ac = new AbortController()
      active.current = ac
      const ids: number[] = []
      for (const { at, e } of script) {
        ids.push(
          window.setTimeout(() => {
            run.onEvent(e)
            if (e.type === 'done') {
              run.finish()
              setBusy(false)
              active.current = null
            }
          }, at),
        )
      }
      timers.current.push(...ids)
      ac.signal.addEventListener('abort', () => {
        ids.forEach(clearTimeout)
        run.finish({ stopped: true })
        setBusy(false)
      })
    },
    [setMessages],
  )

  const stop = useCallback(() => {
    if (health && session.current) void abortRun(session.current).catch(() => undefined)
    active.current?.abort()
  }, [health])

  return { health, checked, live: health !== null, busy, runLive, runScripted, stop, session }
}
