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
}

export function ChatPane({ messages, env, busy, onSend, onDecide, onOpenFile, mode, onModeChange, live, modelLabel, onStop }: Props) {
  const endRef = useRef<HTMLDivElement>(null)
  const last = messages[messages.length - 1]

  // Follow the run: the last message object changes on every streamed event.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, last])

  return (
    <section className="chat" aria-label="Conversation">
      <div className="chat__scroll">
        <ol className="messages" aria-live="polite" aria-relevant="additions text">
          {messages.map((m) => <MessageItem key={m.id} message={m} onDecide={onDecide} onOpenFile={onOpenFile} />)}
        </ol>
        <div ref={endRef} />
      </div>
      <Composer env={env} busy={busy} onSend={onSend} mode={mode} onModeChange={onModeChange} live={live} modelLabel={modelLabel} onStop={onStop} />
    </section>
  )
}
