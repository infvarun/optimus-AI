import { memo, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowUp, Boxes, Check, ChevronDown, Cpu, Plus, Sparkles, Square, X } from 'lucide-react'
import type { CmdbApp } from '../data/directory'
import type { CopilotMode } from '../run/demoScripts'

interface Props {
  variant: 'hero' | 'sidebar'
  busy: boolean
  onSend: (text: string) => void
  onStop?: () => void
  mode: CopilotMode
  onModeChange: (m: CopilotMode) => void
  modelLabel: string
  live: boolean
  app: CmdbApp | null
  apps: CmdbApp[]
  onPickApp: (ciId: string | null) => void
  onAddApp?: () => void
  /** Incident the chat is focused on, shown as a removable chip. */
  focus?: { number: string; title: string } | null
  onClearFocus?: () => void
  placeholder?: string
  autoFocus?: boolean
}

const modes: { id: CopilotMode; label: string; hint: string }[] = [
  { id: 'ask', label: 'Ask', hint: 'Answers from your skills: app first, then team, then global' },
  { id: 'plan', label: 'Plan', hint: 'Writes a Plan.md for this session and waits for you' },
  { id: 'agent', label: 'Agent', hint: 'Investigates with tools, step by step, until it has an answer' },
]

function Popover({ label, icon, children, className = '', flyTarget }: { label: string; icon: React.ReactNode; children: (close: () => void) => React.ReactNode; className?: string; flyTarget?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | globalThis.KeyboardEvent) => {
      if (e instanceof globalThis.KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  return (
    <div className="pop" ref={ref}>
      <button type="button" className={`pchip ${className}`} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)} data-fly-target={flyTarget}>
        {icon}
        <span className="pchip__label">{label}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && <div className="menu menu--up" role="menu">{children(() => setOpen(false))}</div>}
    </div>
  )
}

export const PromptBox = memo(function PromptBox(p: Props) {
  const [value, setValue] = useState('')
  const canSend = value.trim().length > 0 && !p.busy
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (p.autoFocus) ref.current?.focus()
  }, [p.autoFocus])

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!canSend) return
    p.onSend(value.trim())
    setValue('')
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form className={`pbox pbox--${p.variant}`} onSubmit={submit}>
      {p.focus && (
        <div className="pbox__focus">
          <span className="pbox__focus-label">Focused on</span>
          <span className="badge badge--coral mono">{p.focus.number}</span>
          <span className="pbox__focus-title">{p.focus.title}</span>
          {p.onClearFocus && (
            <button type="button" className="icon-btn icon-btn--sm" aria-label="Clear incident focus" onClick={p.onClearFocus}><X size={14} /></button>
          )}
        </div>
      )}
      <label htmlFor={`prompt-${p.variant}`} className="sr-only">Message Prime</label>
      <textarea
        id={`prompt-${p.variant}`}
        ref={ref}
        rows={p.variant === 'hero' ? 3 : 2}
        value={value}
        placeholder={p.placeholder ?? 'How can Prime help you today?'}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="pbox__bar">
        <Popover label="Prime" icon={<Sparkles size={14} aria-hidden="true" />} className="pchip--agent">
          {(close) => (
            <>
              <button role="menuitemradio" aria-checked="true" className="menu__item" onClick={close}><Check size={16} aria-hidden="true" /> Prime <span className="menu__hint">Support agent</span></button>
              <p className="menu__note">More agents arrive with team skills.</p>
            </>
          )}
        </Popover>
        <span className={`pchip pchip--static pchip--model${p.live ? '' : ' is-demo'}`} title={p.live ? 'Model the harness is using' : 'Harness not reachable: demo data'}>
          <Cpu size={14} aria-hidden="true" /> <span className="pchip__label">{p.live ? p.modelLabel : `Demo · ${p.modelLabel}`}</span>
        </span>
        <Popover
          label={p.app ? p.app.name : 'No app configured'}
          icon={<Boxes size={14} aria-hidden="true" />}
          className={p.app ? 'pchip--app is-set' : 'pchip--app'}
          flyTarget="app-chip"
        >
          {(close) => (
            <>
              {p.apps.length > 0 && <p className="menu__label">Your team’s apps</p>}
              {p.apps.map((a) => (
                <button key={a.ciId} role="menuitemradio" aria-checked={p.app?.ciId === a.ciId} className="menu__item" onClick={() => { p.onPickApp(a.ciId); close() }}>
                  {p.app?.ciId === a.ciId ? <Check size={16} aria-hidden="true" /> : <span className="menu__spacer" />}
                  {a.name} <span className="menu__hint mono">{a.ciId}</span>
                </button>
              ))}
              {p.app && (
                <button role="menuitem" className="menu__item" onClick={() => { p.onPickApp(null); close() }}>
                  <span className="menu__spacer" /> No app (general answers)
                </button>
              )}
              {p.onAddApp && (
                <button role="menuitem" className="menu__item menu__item--accent" onClick={() => { p.onAddApp?.(); close() }}>
                  <Plus size={16} aria-hidden="true" /> Onboard an app
                </button>
              )}
            </>
          )}
        </Popover>
        <div className="seg" role="radiogroup" aria-label="Mode">
          {modes.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={p.mode === m.id} title={m.hint} className={`seg__opt${p.mode === m.id ? ' is-on' : ''}`} onClick={() => p.onModeChange(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <span className="pbox__spacer" />
        {p.busy && p.onStop ? (
          <button type="button" className="btn btn--secondary btn--icon" aria-label="Stop" onClick={p.onStop}><Square size={16} /></button>
        ) : (
          <button type="submit" className="btn btn--primary btn--icon" aria-label="Send" disabled={!canSend}><ArrowUp size={18} /></button>
        )}
      </div>
    </form>
  )
})
