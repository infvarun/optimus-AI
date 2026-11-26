// Client for the Optimus harness API (harness/README.md, "HTTP API" and "Stream events").
// In dev, Vite proxies /api and /healthz to the harness (see vite.config.ts), so no CORS is needed.
// Set VITE_HARNESS_URL to call a harness elsewhere (it must allow this origin in CORS_ORIGINS).

const BASE = import.meta.env.VITE_HARNESS_URL?.replace(/\/$/, '') ?? ''
const TOKEN = import.meta.env.VITE_HARNESS_TOKEN

export type RunMode = 'auto' | 'plan'

export interface PlanStep {
  title: string
  status?: 'pending' | 'in_progress' | 'done' | 'skipped' | 'blocked'
  note?: string | null
}

export interface Resolution {
  status: 'resolved' | 'needs_human' | 'needs_info' | 'answered' | 'plan_ready'
  summary: string
  likely_cause?: string | null
  confidence?: 'low' | 'medium' | 'high' | null
  evidence?: string[]
  next_steps?: string[]
  owner?: string | null
}

export type HarnessEvent =
  | { type: 'run_start'; mode: RunMode; limits: { maxToolCalls: number; maxContinues: number; timeoutSeconds: number } }
  | { type: 'turn_start'; step: number }
  | { type: 'thinking'; text: string }
  | { type: 'delta'; text: string }
  | { type: 'message'; content: string }
  | { type: 'tool_start'; toolCallId: string; toolName: string; arguments: unknown }
  | { type: 'tool_end'; toolCallId: string; success: boolean; result?: string; error?: string }
  | ({ type: 'plan'; file: string; goal: string; steps: PlanStep[] })
  | { type: 'workspace'; file: string }
  | { type: 'continue'; attempt: number; of: number }
  | { type: 'limit'; reason: 'max_tool_calls' | 'timeout' | 'max_continues'; toolCalls: number; steps: number }
  | ({ type: 'resolution' } & Resolution)
  | { type: 'usage'; data: Record<string, unknown> }
  | { type: 'compacted' }
  | { type: 'error'; message: string }
  | { type: 'done'; outcome?: string; toolCalls?: number; steps?: number; continues?: number }

export interface Health {
  ok: boolean
  model: string
  provider: string
  baseUrl: string
}

function headers(json = false): HeadersInit {
  const h: Record<string, string> = {}
  if (json) h['content-type'] = 'application/json'
  if (TOKEN) h.authorization = `Bearer ${TOKEN}`
  return h
}

async function check(res: Response): Promise<Response> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      msg = typeof body.error === 'string' ? body.error : body.detail ? JSON.stringify(body.detail) : msg
    } catch {
      /* not JSON */
    }
    throw new Error(msg)
  }
  return res
}

/** Resolves to null when the harness isn't reachable (the console then runs on demo data). */
export async function getHealth(signal?: AbortSignal): Promise<Health | null> {
  try {
    const res = await fetch(`${BASE}/healthz`, { signal })
    if (!res.ok) return null
    const body = (await res.json()) as Health
    return body.ok ? body : null
  } catch {
    return null
  }
}

export async function createSession(): Promise<string> {
  const res = await check(await fetch(`${BASE}/api/sessions`, { method: 'POST', headers: headers() }))
  return ((await res.json()) as { id: string }).id
}

export async function abortRun(sessionId: string): Promise<void> {
  await fetch(`${BASE}/api/sessions/${sessionId}/abort`, { method: 'POST', headers: headers() })
}

export async function readFile(sessionId: string, name: string): Promise<string> {
  const res = await check(await fetch(`${BASE}/api/sessions/${sessionId}/files/${encodeURIComponent(name)}`, { headers: headers() }))
  return res.text()
}

/**
 * Send a message and call onEvent for each streamed event until the run ends.
 * Uses fetch + a stream reader (EventSource can't POST). Aborting the signal
 * closes the stream, and the harness then aborts the agent run.
 */
export async function streamMessage(
  sessionId: string,
  prompt: string,
  mode: RunMode,
  onEvent: (e: HarnessEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await check(
    await fetch(`${BASE}/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ prompt, mode }),
      signal,
    }),
  )
  if (!res.body) throw new Error('No response stream')
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buf = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += value
    let i: number
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, i)
      buf = buf.slice(i + 2)
      const data = frame
        .split('\n')
        .filter((l) => l.startsWith('data: '))
        .map((l) => l.slice(6))
        .join('\n')
      if (data) onEvent(JSON.parse(data) as HarnessEvent)
    }
  }
}
