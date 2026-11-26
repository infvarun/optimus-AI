import { memo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowUp, AtSign, Cpu, Paperclip } from 'lucide-react'
import type { Env } from '../data/mock'
import { model, suggestions } from '../data/mock'

interface Props {
  env: Env
  busy: boolean
  onSend: (text: string) => void
}

export const Composer = memo(function Composer({ env, busy, onSend }: Props) {
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
          <span className="badge badge--tint composer__model" title="Model the harness is using (bring your own key)">
            <Cpu size={14} aria-hidden="true" /> {model.provider} · {model.name}
          </span>
          <span className={`composer__env${env === 'production' ? ' is-prod' : ''}`}>
            {env === 'production' ? 'Production changes need a team lead’s approval' : `Working in ${env}`}
          </span>
          <button type="submit" className="btn btn--primary btn--icon" aria-label="Send" disabled={!canSend}>
            <ArrowUp size={18} />
          </button>
        </div>
      </form>
    </div>
  )
})
