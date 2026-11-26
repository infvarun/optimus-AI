import { memo, useState } from 'react'
import { Check, ChevronRight, CircleAlert, LoaderCircle } from 'lucide-react'
import type { ToolCall } from '../data/mock'

/** Pretty-print JSON tool output; leave anything else as it came. */
function formatOutput(out: string) {
  const t = out.trim()
  if (!(t.startsWith('{') || t.startsWith('['))) return out
  try {
    return JSON.stringify(JSON.parse(t), null, 2)
  } catch {
    return out
  }
}

const fmtMs = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`)

export const ToolCallRow = memo(function ToolCallRow({ call, label }: { call: ToolCall; label?: string }) {
  const [open, setOpen] = useState(false)
  const Icon = call.status === 'running' ? LoaderCircle : call.status === 'ok' ? Check : CircleAlert
  return (
    <li className={`tool tool--${call.status}`}>
      <button
        className="tool__head"
        aria-expanded={open}
        disabled={!call.output}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="tool__status" aria-label={call.status}>
          <Icon size={14} className={call.status === 'running' ? 'spin' : undefined} />
        </span>
        <span className="tool__text">
          {label && <span className="tool__label">{label}</span>}
          <span className="tool__sig mono">
            <span className="tool__name">{call.name}</span> <span className="tool__args">{call.args}</span>
          </span>
        </span>
        <span className="tool__time mono">
          {call.status === 'running' ? '' : call.status === 'error' ? 'failed' : call.durationMs ? fmtMs(call.durationMs) : ''}
        </span>
        {call.output && <ChevronRight size={16} className="tool__chev" aria-hidden="true" />}
      </button>
      {open && call.output && <pre className="tool__out">{formatOutput(call.output)}</pre>}
    </li>
  )
})
