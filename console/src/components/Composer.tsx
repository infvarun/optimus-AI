import { memo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowUp, AtSign, Cpu, ListChecks, Paperclip, Square } from 'lucide-react'
import type { RunMode } from '../api/harness'
import type { Env } from '../data/mock'
import { suggestions } from '../data/mock'

interface Props {
  env: Env
  busy: boolean
  onSend: (text: string) => void
  mode: RunMode
  onModeChange: (m: RunMode) => void
  /** True when talking to a running harness; false on demo data. */
  live: boolean
  modelLabel: string
  onStop?: () => void
}

export const Composer = memo(function Composer({ env, busy, onSend, mode, onModeChange, live, modelLabel, onStop }: Props) {
  const [value, setValue] = useState('')
  const canSend = value.trim().length > 0 && !busy

  const submit = (e?: FormEvent) => {
    e?.preventDefault()
    if (!canSend) return
    onSend(value.trim())
    setValue('')
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="composer-wrap">
      <div className="chips" aria-label="Suggested prompts">
        {suggestions.map((s) => (
          <button key={s} className="chip" disabled={busy} onClick={() => onSend(s)}>{s}</button>
        ))}
      </div>
      <form className="composer" onSubmit={submit}>
        <label htmlFor="prompt" className="sr-only">Message Optimus</label>
        <textarea
          id="prompt"
          rows={2}
          value={value}
          placeholder="Ask about an app, an incident, a change, or a Dynatrace problem…"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <div className="composer__bar">
          <button type="button" className="icon-btn" aria-label="Attach a file or log"><Paperclip size={18} /></button>
          <button type="button" className="icon-btn" aria-label="Mention a service or incident"><AtSign size={18} /></button>
          <button
            type="button"
            className={`chip composer__mode${mode === 'plan' ? ' is-on' : ''}`}
            aria-pressed={mode === 'plan'}
            title="Plan mode: the agent writes a plan (Plan.md) and waits for you before investigating"
            onClick={() => onModeChange(mode === 'plan' ? 'auto' : 'plan')}
          >
            <ListChecks size={14} aria-hidden="true" /> Plan
          </button>
          <span
            className={`badge ${live ? 'badge--tint' : 'badge--coral'} composer__model`}
            title={live ? 'Model the harness is using (bring your own key)' : 'Harness not reachable: showing demo data'}
          >
            <Cpu size={14} aria-hidden="true" /> {live ? modelLabel : 'Demo data'}
          </span>
          <span className={`composer__env${env === 'production' ? ' is-prod' : ''}`}>
            {env === 'production' ? 'Production changes need a team lead’s approval' : `Working in ${env}`}
          </span>
          {busy && onStop ? (
            <button type="button" className="btn btn--secondary btn--icon" aria-label="Stop the agent" onClick={onStop}>
              <Square size={16} />
            </button>
          ) : (
            <button type="submit" className="btn btn--primary btn--icon" aria-label="Send" disabled={!canSend}>
              <ArrowUp size={18} />
            </button>
          )}
        </div>
      </form>
    </div>
  )
})
