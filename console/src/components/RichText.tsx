import { Fragment, memo } from 'react'

// Minimal inline renderer for **bold** and `code`. Swap for a real
// markdown renderer once the harness output format is settled.
export const RichText = memo(function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>
        if (p.startsWith('`') && p.endsWith('`')) return <code key={i}>{p.slice(1, -1)}</code>
        return <Fragment key={i}>{p}</Fragment>
      })}
    </>
  )
})
