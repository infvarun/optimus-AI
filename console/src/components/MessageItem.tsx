import { memo } from 'react'
import type { Message } from '../data/mock'
import { RichText } from './RichText'
import { ToolCallRow } from './ToolCallRow'
import { ApprovalCard } from './ApprovalCard'
import { FilesRow, Notices, PlanCard, ResolutionCard, ThinkingBlock } from './AgentRun'

interface Props {
  message: Message
  onDecide: (id: string, approved: boolean) => void
  onOpenFile?: (name: string) => void
}

// memo: during streaming only the last message changes, so the rest skip render.
export const MessageItem = memo(function MessageItem({ message, onDecide, onOpenFile }: Props) {
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
      <div className="msg__body">
        <div className="msg__meta">
          <span className="msg__who">Optimus</span>
          <time className="msg__time">{message.time}</time>
          {message.step ? <span className="msg__step mono">step {message.step}</span> : null}
        </div>
        {message.plan && <PlanCard goal={message.plan.goal} steps={message.plan.steps} />}
        {message.thinking && <ThinkingBlock text={message.thinking} live={!!message.streaming && !message.text} />}
        {message.tools && message.tools.length > 0 && (
          <ul className="tools" aria-label="Tool calls">
            {message.tools.map((t) => <ToolCallRow key={t.id} call={t} />)}
          </ul>
        )}
        {(message.text || message.streaming) && (
          <p className="msg__text">
            <RichText text={message.text} />
            {message.streaming && <span className="caret" aria-hidden="true" />}
          </p>
        )}
        {message.notices && message.notices.length > 0 && <Notices items={message.notices} />}
        {message.resolution && <ResolutionCard r={message.resolution} />}
        {message.files && message.files.length > 0 && <FilesRow files={message.files} onOpen={onOpenFile} />}
        {message.approval && <ApprovalCard approval={message.approval} onDecide={onDecide} />}
      </div>
    </li>
  )
})
