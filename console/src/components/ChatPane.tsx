import { useEffect, useRef } from 'react'
import type { Env, Message } from '../data/mock'
import type { RunMode } from '../api/harness'
import { MessageItem } from './MessageItem'
import { Composer } from './Composer'

interface Props {
  messages: Message[]
  env: Env
  busy: boolean
  onSend: (text: string) => void
  onDecide: (id: string, approved: boolean) => void
  onOpenFile?: (name: string) => void
  mode: RunMode
  onModeChange: (m: RunMode) => void
  live: boolean
  modelLabel: string
  onStop?: () => void
  onRetry?: (prompt: string) => void
}

export function ChatPane({ messages, env, busy, onSend, onDecide, onOpenFile, mode, onModeChange, live, modelLabel, onStop, onRetry }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const last = messages[messages.length - 1]

  // Follow the run only while the reader is at the bottom; scrolling up to read stops the follow.
  const onScroll = () => {
    const el = scrollRef.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }
  useEffect(() => {
    if (last?.role === 'user') stick.current = true
    const el = scrollRef.current
    if (!el || !stick.current) return
    const id = requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight }))
    return () => cancelAnimationFrame(id)
  }, [messages.length, last])

  return (
    <section className="chat" aria-label="Conversation">
      <div className="chat__scroll" ref={scrollRef} onScroll={onScroll}>
        <ol className="messages" aria-live="polite" aria-relevant="additions text">
          {messages.map((m) => <MessageItem key={m.id} message={m} onDecide={onDecide} onOpenFile={onOpenFile} onRetry={onRetry} />)}
        </ol>
      </div>
      <Composer env={env} busy={busy} onSend={onSend} mode={mode} onModeChange={onModeChange} live={live} modelLabel={modelLabel} onStop={onStop} />
    </section>
  )
}
