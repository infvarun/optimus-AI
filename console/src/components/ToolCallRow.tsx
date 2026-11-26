import { memo, useState } from 'react'
import { Check, ChevronRight, CircleAlert, LoaderCircle } from 'lucide-react'
import type { ToolCall } from '../data/mock'

export const ToolCallRow = memo(function ToolCallRow({ call }: { call: ToolCall }) {
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
        <span className="tool__name mono">{call.name}</span>
        <span className="tool__args mono">{call.args}</span>
        <span className="tool__time mono">
          {call.status === 'running' ? 'running' : call.durationMs ? `${call.durationMs} ms` : ''}
        </span>
        {call.output && <ChevronRight size={16} className="tool__chev" aria-hidden="true" />}
      </button>
      {open && call.output && <pre className="tool__out">{call.output}</pre>}
    </li>
  )
})
