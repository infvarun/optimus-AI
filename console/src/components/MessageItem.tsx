import { memo, useState } from 'react'
import type { Message } from '../data/mock'
import { ApprovalCard } from './ApprovalCard'
import { Activity, ErrorCard, FilesRow, PlanCard, ResolutionCard, RunFootnote, RunStatus } from './AgentRun'
import { Markdown } from './Markdown'

interface Props {
  message: Message
  onDecide: (id: string, approved: boolean) => void
  onOpenFile?: (name: string) => void
  onRetry?: (prompt: string) => void
}

type AgentMessage = Extract<Message, { role: 'agent' }>

/** Activity opens while the agent works and folds away when it's done, unless the user chose otherwise. */
function useActivityOpen(m: AgentMessage) {
  const [userChoice, setUserChoice] = useState<boolean | null>(null)
  const open = userChoice ?? !!m.streaming
  return [open, () => setUserChoice(!open)] as const
}

function AgentBody({ m, onDecide, onOpenFile, onRetry }: { m: AgentMessage } & Omit<Props, 'message'>) {
  const [open, toggle] = useActivityOpen(m)
  const isRun = m.phase !== undefined
  const answer = m.text.trim()
  const writing = !!m.streaming && m.phase === 'writing'
  return (
    <div className="msg__body">
      <div className="msg__meta">
        <span className="msg__who">Optimus</span>
        <time className="msg__time">{m.time}</time>
      </div>
      {isRun && <RunStatus m={m} open={open} onToggle={toggle} />}
      {isRun && <Activity m={m} open={open} />}
      {m.plan && <PlanCard goal={m.plan.goal} steps={m.plan.steps} running={!!m.streaming} />}
      {(answer || writing) && (
        <div className={`answer${writing ? ' is-writing' : ''}`}>
          <Markdown text={answer} />
        </div>
      )}
      {m.resolution && <ResolutionCard r={m.resolution} />}
      {m.error && <ErrorCard message={m.error} onRetry={m.prompt && onRetry ? () => onRetry(m.prompt!) : undefined} />}
      <RunFootnote m={m} />
      {onOpenFile && m.files && m.files.length > 0 && <FilesRow files={m.files} onOpen={onOpenFile} />}
      {m.approval && <ApprovalCard approval={m.approval} onDecide={onDecide} />}
    </div>
  )
}

// memo: during streaming only the last message changes, so the rest skip render.
export const MessageItem = memo(function MessageItem({ message, onDecide, onOpenFile, onRetry }: Props) {
  if (message.role === 'user') {
    return (
      <li className="msg msg--user">
        <div className="msg__bubble">{message.text}</div>
        <time className="msg__time">{message.time}</time>
      </li>
    )
  }
  return (
    <li className="msg msg--agent">
      <div className="msg__avatar" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 17 10 7l4 7 2-3 3 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <AgentBody m={message} onDecide={onDecide} onOpenFile={onOpenFile} onRetry={onRetry} />
    </li>
  )
})
