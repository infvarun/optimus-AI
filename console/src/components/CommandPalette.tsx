import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, Boxes, GitPullRequestArrow, MessageSquare, Search, Siren } from 'lucide-react'

const items = [
  { id: 'c1', kind: 'Ask', icon: MessageSquare, label: 'What changed on this app in the last 2 hours?' },
  { id: 'c2', kind: 'Ask', icon: MessageSquare, label: 'Draft a status update for the business' },
  { id: 'c3', kind: 'Knowledge', icon: BookOpen, label: 'KB0011201 DB connection pool exhausted' },
  { id: 'c4', kind: 'Knowledge', icon: BookOpen, label: 'KB0010050 Standard rollback of a custom application release' },
  { id: 'c5', kind: 'Incident', icon: Siren, label: 'INC0104521 Clinical Supply Portal order submission failing' },
  { id: 'c6', kind: 'Incident', icon: Siren, label: 'INC0104402 LabTrack LIMS label printing delayed' },
  { id: 'c7', kind: 'Change', icon: GitPullRequestArrow, label: 'CHG0045901 LabTrack LIMS vendor patch 9.4.2' },
  { id: 'c8', kind: 'App', icon: Boxes, label: 'Expense Cloud' },
]

interface Props {
  onClose: () => void
  onRun: (text: string) => void
}

export default function CommandPalette({ onClose, onRun }: Props) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const dq = useDeferredValue(q)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    const s = dq.trim().toLowerCase()
    return s ? items.filter((i) => i.label.toLowerCase().includes(s) || i.kind.toLowerCase().includes(s)) : items
  }, [dq])

  useEffect(() => inputRef.current?.focus(), [])

  const run = (i: number) => {
    const item = results[i]
    if (!item) {
      if (q.trim()) { onRun(q.trim()); onClose() }
      return
    }
    onRun(item.kind === 'Ask' ? item.label : `Open ${item.kind.toLowerCase()}: ${item.label}`)
    onClose()
  }

  return (
    <div className="palette-scrim" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
          if (e.key === 'Enter') run(active)
        }}
      >
        <div className="palette__input">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0) }}
            placeholder="Search apps, incidents, changes, knowledge, or ask Optimus"
            aria-label="Search"
            aria-controls="palette-list"
            aria-activedescendant={results[active] ? `pal-${results[active].id}` : undefined}
          />
          <kbd>Esc</kbd>
        </div>
        <ul id="palette-list" role="listbox" className="palette__list">
          {results.map((r, i) => (
            <li
              key={r.id}
              id={`pal-${r.id}`}
              role="option"
              aria-selected={i === active}
              className="palette__item"
              onMouseEnter={() => setActive(i)}
              onClick={() => run(i)}
            >
              <r.icon size={16} aria-hidden="true" />
              <span>{r.label}</span>
              <span className="palette__kind">{r.kind}</span>
            </li>
          ))}
          {results.length === 0 && <li className="palette__empty">No matches. Press Enter to ask Optimus.</li>}
        </ul>
      </div>
    </div>
  )
}
