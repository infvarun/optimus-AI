import { memo } from 'react'

export const Sparkline = memo(function Sparkline({ data, tone }: { data: number[]; tone: 'ok' | 'warn' | 'bad' }) {
  const w = 72
  const h = 24
  const max = Math.max(...data)
  const min = Math.min(...data)
  const span = max - min || 1
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`).join(' ')
  return (
    <svg className={`spark spark--${tone}`} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={pts} fill="none" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
})
