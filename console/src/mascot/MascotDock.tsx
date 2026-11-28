import { useEffect, useRef } from 'react'
import { Mascot, type Expression, type Pose, type Prop } from './Mascot'
import { reducedMotion } from './motion'

export interface Mood {
  expression: Expression
  prop?: Prop
  pose?: Pose
}

const BASE = 160

/**
 * One mascot for the whole app. It lives in a fixed layer and glides to whichever
 * anchor is active (`[data-mascot-anchor="nav"]` in the navbar, or `"canvas"` in the
 * onboarding canvas), so moving between them is a real flight, not a swap.
 * Anchors are plain boxes; the dock reads their size and position every frame and
 * follows them through layout changes, scrolling and resizes.
 */
export function MascotDock({ anchor, mood, label }: { anchor: string; mood: Mood; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const pos = useRef<{ x: number; y: number; s: number } | null>(null)
  const flying = useRef<Animation | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    let raf = 0
    let first = true
    const tf = (p: { x: number; y: number; s: number }) => `translate(${p.x}px, ${p.y}px) scale(${p.s})`

    const tick = () => {
      raf = requestAnimationFrame(tick)
      const el = document.querySelector<HTMLElement>(`[data-mascot-anchor="${anchor}"]`)
      if (!el) {
        node.style.opacity = '0'
        return
      }
      const r = el.getBoundingClientRect()
      const s = r.width / BASE
      const next = { x: r.left, y: r.top + r.height - BASE * s, s }
      const prev = pos.current
      node.style.opacity = '1'
      if (flying.current) return
      if (!prev || (prev.x === next.x && prev.y === next.y && prev.s === next.s)) {
        pos.current = next
        node.style.transform = tf(next)
        return
      }
      const dist = Math.hypot(next.x - prev.x, next.y - prev.y)
      // A genuine move between anchors gets a flight; small layout shifts just follow.
      if (first && dist > 60 && !reducedMotion()) {
        first = false
        const mid = { x: (prev.x + next.x) / 2, y: Math.min(prev.y, next.y) - Math.min(140, dist * 0.35), s: Math.max(prev.s, next.s) * 1.08 }
        node.classList.add('is-flying')
        const a = node.animate([{ transform: tf(prev) }, { transform: tf(mid), offset: 0.5 }, { transform: tf(next) }], {
          duration: 1000,
          easing: 'cubic-bezier(0.45, 0, 0.2, 1)',
        })
        flying.current = a
        node.style.transform = tf(next)
        pos.current = next
        a.finished
          .catch(() => undefined)
          .then(() => {
            flying.current = null
            node.classList.remove('is-flying')
          })
        return
      }
      first = false
      pos.current = next
      node.style.transform = tf(next)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [anchor])

  return (
    <div ref={ref} className="mascot-dock" style={{ width: BASE, height: BASE }}>
      <Mascot size={BASE} label={label} {...mood} />
    </div>
  )
}
