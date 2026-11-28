import { memo, useEffect, useRef, useState, type ComponentProps } from 'react'
import { ArrowUpRight, History, MessageSquare, Pin, X } from 'lucide-react'
import type { Message } from '../data/mock'
import type { CmdbApp, DirTeam } from '../data/directory'
import { Markdown } from './Markdown'
import { PromptBox } from './PromptBox'
import { Activity, PlanCard, RunStatus } from './AgentRun'

type AgentMessage = Extract<Message, { role: 'agent' }>
export type SideTab = 'chat' | 'pinned' | 'history'

export interface HistoryItem {
  id: string
  title: string
  app: string | null
  when: string
  messages: Message[]
}

interface Props {
  tab: SideTab
  onTab: (t: SideTab) => void
  messages: Message[]
  pinned: AgentMessage[]
  history: HistoryItem[]
  selectedRun: string | null
  onSelectRun: (id: string) => void
  onRestore: (h: HistoryItem) => void
  app: CmdbApp | null
  team: DirTeam | null
  prompt: ComponentProps<typeof PromptBox>
  suggestions: string[]
  onSuggest: (s: string) => void
  busy: boolean
  onClose?: () => void
}

function firstPara(md: string) {
  const p = md.split(/\n\s*\n/).find((s) => s.trim() && !s.trim().startsWith('|') && !s.trim().startsWith('#'))
  return p ?? ''
}

/**
 * One agent run in the sidebar. The working process lives here: status, thought process,
 * plan and checks. The main area only shows the finished answer.
 */
const AgentLine = memo(function AgentLine({ m, selected, onSelect }: { m: AgentMessage; selected: boolean; onSelect: () => void }) {
  const running = !!m.streaming
  const [open, setOpen] = useState<boolean | null>(null)
  const activityOpen = open ?? running
  const preview = m.resolution?.summary ?? firstPara(m.text)
  return (
    <li className={`smsg smsg--agent${selected ? ' is-selected' : ''}${running ? ' is-running' : ''}`}>
      <div className="smsg__status">
        <RunStatus m={m} open={activityOpen} onToggle={() => setOpen(!activityOpen)} />
        <time className="smsg__time">{m.time}</time>
      </div>
      {m.plan && <PlanCard goal={m.plan.goal} steps={m.plan.steps} running={running} />}
      <Activity m={m} open={activityOpen} />
      {!running && preview && <div className="smsg__preview"><Markdown text={preview} /></div>}
      {m.error && <p className="smsg__error">{m.error}</p>}
      {!running && (
        <button className="linkbtn" onClick={onSelect} aria-pressed={selected}>
          {selected ? 'Showing in main area' : 'View output'} <ArrowUpRight size={14} aria-hidden="true" />
        </button>
      )}
    </li>
  )
})

export function CopilotSidebar(p: Props) {
  const scroll = useRef<HTMLDivElement>(null)
  const last = p.messages[p.messages.length - 1]
  useEffect(() => {
    const el = scroll.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [p.messages.length, last])

  const skills = [
    { id: 'app', label: 'App', on: !!p.app, title: p.app ? `${p.app.name} skill` : 'No app selected' },
    { id: 'team', label: 'Team', on: !!p.team, title: p.team ? `${p.team.name} private skill` : 'No team yet' },
    { id: 'global', label: 'Global', on: true, title: 'Global public skill' },
  ]

  return (
    <aside className="copilot" aria-label="Prime, the Optimus assistant">
      <div className="copilot__tabs tabs" role="tablist" aria-label="Prime">
        <button role="tab" aria-selected={p.tab === 'chat'} className={`tab${p.tab === 'chat' ? ' is-on' : ''}`} onClick={() => p.onTab('chat')}><MessageSquare size={14} aria-hidden="true" /> Chat</button>
        <button role="tab" aria-selected={p.tab === 'pinned'} className={`tab${p.tab === 'pinned' ? ' is-on' : ''}`} onClick={() => p.onTab('pinned')}><Pin size={14} aria-hidden="true" /> Pinned{p.pinned.length > 0 && <span className="tab__count">{p.pinned.length}</span>}</button>
        <button role="tab" aria-selected={p.tab === 'history'} className={`tab${p.tab === 'history' ? ' is-on' : ''}`} onClick={() => p.onTab('history')}><History size={14} aria-hidden="true" /> History</button>
        {p.onClose && <button className="icon-btn copilot__close" aria-label="Close chat" onClick={p.onClose}><X size={18} /></button>}
      </div>

      {p.tab === 'chat' && (
        <>
          <div className="skills" title="Answers use the highest-priority skill that applies">
            <span className="skills__label">Skills</span>
            {skills.map((s, i) => (
              <span key={s.id} className="skills__item">
                {i > 0 && <span className="skills__arrow" aria-hidden="true">›</span>}
                <span className={`skill${s.on ? ' is-on' : ''}`} title={s.title}>{s.label}</span>
              </span>
            ))}
            <span className={`skills__model${p.prompt.live ? '' : ' is-demo'}`} title={p.prompt.live ? 'Model the harness is using' : 'Harness not reachable: demo data'}>
              {p.prompt.live ? p.prompt.modelLabel : `Demo · ${p.prompt.modelLabel}`}
            </span>
          </div>
          <div className="copilot__scroll" ref={scroll}>
            {p.messages.length === 0 ? (
              <div className="copilot__empty">
                <p className="copilot__hello">{p.app ? `Ask anything about ${p.app.name}, or pick an incident to work on.` : 'Ask a general support question. Onboard an app for answers from its own runbooks.'}</p>
                <div className="sugg">
                  {p.suggestions.map((s) => (
                    <button key={s} className="chip" disabled={p.busy} onClick={() => p.onSuggest(s)}>{s}</button>
                  ))}
                </div>
              </div>
            ) : (
              <ol className="smsgs" aria-live="polite">
                {p.messages.map((m) =>
                  m.role === 'user' ? (
                    <li key={m.id} className="smsg smsg--user"><div className="smsg__bubble">{m.text}</div></li>
                  ) : (
                    <AgentLine key={m.id} m={m} selected={p.selectedRun === m.id} onSelect={() => p.onSelectRun(m.id)} />
                  ),
                )}
              </ol>
            )}
          </div>
          <div className="copilot__composer">
            <PromptBox {...p.prompt} />
          </div>
        </>
      )}

      {p.tab === 'pinned' && (
        <div className="copilot__scroll">
          {p.pinned.length === 0 ? (
            <p className="copilot__hello">Pin an answer from the main area to keep it here.</p>
          ) : (
            <ul className="hlist">
              {p.pinned.map((m) => (
                <li key={m.id}>
                  <button className="hrow" onClick={() => { p.onSelectRun(m.id); p.onTab('chat') }}>
                    <span className="hrow__title">{m.prompt}</span>
                    <span className="hrow__meta">{m.resolution?.summary ?? firstPara(m.text).slice(0, 120)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {p.tab === 'history' && (
        <div className="copilot__scroll">
          {p.history.length === 0 ? (
            <p className="copilot__hello">When you start over, the conversation is saved here.</p>
          ) : (
            <ul className="hlist">
              {p.history.map((h) => (
                <li key={h.id}>
                  <button className="hrow" onClick={() => p.onRestore(h)}>
                    <span className="hrow__title">{h.title}</span>
                    <span className="hrow__meta">{h.app ?? 'General'} · {h.when} · {h.messages.filter((m) => m.role === 'user').length} questions</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  )
}
