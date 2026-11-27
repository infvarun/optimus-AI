import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BarChart3, ChevronDown, LogOut, RotateCcw, Settings, Users } from 'lucide-react'
import { me } from '../data/directory'
import type { Mood } from '../mascot/MascotDock'

export interface BubbleAction {
  label: string
  primary?: boolean
  onClick: () => void
}

export interface Bubble {
  text: ReactNode
  actions?: BubbleAction[]
  /** How Prime looks while saying it. */
  mood?: Mood
}

interface Props {
  teamName: string | null
  /** Mascot is away (in the onboarding canvas): the home slot stays empty. */
  mascotAway: boolean
  bubble: Bubble | null
  onMascotClick: () => void
  onTeamClick: () => void
  onHome: () => void
  onReset: () => void
}

export function NavBar({ teamName, mascotAway, bubble, onMascotClick, onTeamClick, onHome, onReset }: Props) {
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenu(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [menu])

  return (
    <header className="nav">
      <button className="nav__brand" onClick={onHome} aria-label="Optimus home">
        <span className="nav__logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 17 10 7l4 7 2-3 3 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <span className="nav__word">Optimus</span>
      </button>

      <div className="nav__center">
        <button
          className={`nav__mascot${mascotAway ? ' is-away' : ''}`}
          onClick={onMascotClick}
          aria-label="Prime, your assistant"
          data-mascot-anchor={mascotAway ? undefined : 'nav'}
        />
        {bubble && !mascotAway && (
          <div className="bubble bubble--nav" role="status">
            <p className="bubble__text">{bubble.text}</p>
            {bubble.actions && (
              <div className="bubble__actions">
                {bubble.actions.map((a) => (
                  <button key={a.label} className={`btn ${a.primary ? 'btn--primary' : 'btn--secondary'} btn--sm`} onClick={a.onClick}>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="nav__right">
        {teamName !== null && (
          <button className="team-btn" onClick={onTeamClick} data-fly-target="team" aria-haspopup="dialog">
            <Users size={16} aria-hidden="true" />
            <span className="team-btn__name">{teamName}</span>
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        )}
        <div className="avatar-menu" ref={menuRef}>
          <button className="avatar" aria-label={`Account: ${me.name}`} aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((m) => !m)}>
            {me.initials}
          </button>
          {menu && (
            <div className="menu" role="menu">
              <div className="menu__head">
                <strong>{me.name}</strong>
                <span>{me.email}</span>
              </div>
              <button role="menuitem" className="menu__item" onClick={() => setMenu(false)}><Settings size={16} aria-hidden="true" /> Settings</button>
              <button role="menuitem" className="menu__item" onClick={() => setMenu(false)}><BarChart3 size={16} aria-hidden="true" /> Usage</button>
              <button role="menuitem" className="menu__item" onClick={() => { setMenu(false); onReset() }}><RotateCcw size={16} aria-hidden="true" /> Reset demo setup</button>
              <hr className="menu__sep" />
              <button role="menuitem" className="menu__item" onClick={() => setMenu(false)}><LogOut size={16} aria-hidden="true" /> Log out</button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
