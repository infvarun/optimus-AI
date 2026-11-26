import { memo } from 'react'
import { Menu, PanelRight, Search } from 'lucide-react'
import type { Env } from '../data/mock'

interface Props {
  env: Env
  onEnvChange: (e: Env) => void
  onOpenPalette: () => void
  onOpenNav: () => void
  onOpenContext: () => void
}

const envs: { id: Env; label: string }[] = [
  { id: 'production', label: 'Production' },
  { id: 'staging', label: 'Staging' },
  { id: 'dev', label: 'Dev' },
]

export const TopBar = memo(function TopBar({ env, onEnvChange, onOpenPalette, onOpenNav, onOpenContext }: Props) {
  return (
    <header className="topbar">
      <button className="icon-btn only-mobile" aria-label="Open navigation" onClick={onOpenNav}><Menu size={18} /></button>

      <div className="topbar__title">
        <span className="badge badge--coral mono">INC0104521</span>
        <h1>Clinical Supply Portal 503s</h1>
      </div>

      <div className="topbar__actions">
        <button className="search-pill hide-sm" aria-label="Search or run a command (Ctrl or Cmd + K)" onClick={onOpenPalette}>
          <Search size={16} aria-hidden="true" />
          <span>Search or run a command</span>
          <kbd>⌘K</kbd>
        </button>

        <div className="segmented" role="radiogroup" aria-label="Environment">
          {envs.map((e) => (
            <button
              key={e.id}
              role="radio"
              aria-checked={env === e.id}
              className={`segmented__opt${env === e.id ? ' is-on' : ''}${e.id === 'production' ? ' is-prod' : ''}`}
              onClick={() => onEnvChange(e.id)}
            >
              {e.id === 'production' && <span className="dot dot--danger" aria-hidden="true" />}
              {e.label}
            </button>
          ))}
        </div>

        <button className="icon-btn only-tablet" aria-label="Open context panel" onClick={onOpenContext}><PanelRight size={18} /></button>
      </div>
    </header>
  )
})
