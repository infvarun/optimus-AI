import { useEffect, useRef } from 'react'
import type { Env, Message } from '../data/mock'
import { MessageItem } from './MessageItem'
import { Composer } from './Composer'

interface Props {
  messages: Message[]
  env: Env
  busy: boolean
  onSend: (text: string) => void
  onDecide: (id: string, approved: boolean) => void
}

export function ChatPane({ messages, env, busy, onSend, onDecide }: Props) {
  const endRef = useRef<HTMLDivElement>(null)
  const last = messages[messages.length - 1]
  const lastLen = last?.text.length ?? 0

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, lastLen])

  return (
    <section className="chat" aria-label="Conversation">
      <div className="chat__scroll">
        <ol className="messages" aria-live="polite" aria-relevant="additions text">
          {messages.map((m) => <MessageItem key={m.id} message={m} onDecide={onDecide} />)}
        </ol>
        <div ref={endRef} />
      </div>
      <Composer env={env} busy={busy} onSend={onSend} />
    </section>
  )
}
