/** Shared motion helpers for the onboarding hand-offs (mascot flights, names flying into place). */

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

/** Wait for an element to appear (it may mount a frame or two after a state change). */
export async function waitFor(selector: string, tries = 20): Promise<HTMLElement | null> {
  for (let i = 0; i < tries; i++) {
    const el = document.querySelector<HTMLElement>(selector)
    if (el) return el
    await nextFrame()
  }
  return null
}

/**
 * Fly a pill with `text` from `from` to the element matching `toSelector`, along a soft arc.
 * The target gets a brief "landed" pulse. Resolves when done; instant under reduced motion.
 */
export async function flyLabel(text: string, from: DOMRect, toSelector: string, opts: { tone?: 'team' | 'app' } = {}) {
  const target = await waitFor(toSelector)
  if (!target) return
  const land = () => {
    target.classList.remove('is-landed')
    void target.offsetWidth
    target.classList.add('is-landed')
    window.setTimeout(() => target.classList.remove('is-landed'), 900)
  }
  if (reducedMotion()) return land()

  const to = target.getBoundingClientRect()
  const pill = document.createElement('div')
  pill.className = `fly-pill fly-pill--${opts.tone ?? 'team'}`
  pill.textContent = text
  pill.setAttribute('aria-hidden', 'true')
  document.body.appendChild(pill)
  const w = pill.offsetWidth
  const h = pill.offsetHeight
  const x0 = from.left + from.width / 2 - w / 2
  const y0 = from.top + from.height / 2 - h / 2
  const x1 = to.left + to.width / 2 - w / 2
  const y1 = to.top + to.height / 2 - h / 2
  const lift = Math.min(160, Math.abs(y1 - y0) * 0.5 + 60)
  const mx = (x0 + x1) / 2
  const my = Math.min(y0, y1) - lift
  const scaleEnd = Math.min(1, to.width / w)
  const anim = pill.animate(
    [
      { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 0 },
      { transform: `translate(${x0}px, ${y0 - 8}px) scale(1.06)`, opacity: 1, offset: 0.12 },
      { transform: `translate(${mx}px, ${my}px) scale(1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${x1}px, ${y1}px) scale(${scaleEnd})`, opacity: 0.2 },
    ],
    { duration: 950, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' },
  )
  await anim.finished.catch(() => undefined)
  pill.remove()
  land()
}
