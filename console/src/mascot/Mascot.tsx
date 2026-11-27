import { memo, useId } from 'react'
import './mascot.css'

/**
 * Prime, the Optimus agent. An original character: a small hovering assistant with a soft
 * white shell, a dark glass visor where its glowing eyes live, side "ear" pods, a little
 * antenna light and a chest core that breathes slowly. It floats rather than walks, so the
 * motion stays calm. Pure SVG + CSS: crisp from the 54px navbar slot to the onboarding
 * canvas, and every motion stops under prefers-reduced-motion.
 *
 * Poses:
 *  - stand: hovers, blinks, glances around; holds props.
 *  - laptop: turns sideways with a laptop in front and types (while the agent works).
 */

export type Expression = 'happy' | 'joy' | 'grin' | 'wink' | 'curious' | 'surprised' | 'thinking' | 'focused' | 'sleepy' | 'sad'
export type Prop = 'none' | 'wave' | 'magnifier' | 'sign' | 'confetti' | 'clipboard'
export type Pose = 'stand' | 'laptop'

interface Props {
  expression?: Expression
  prop?: Prop
  pose?: Pose
  size?: number
  /** Accessible label; omit to hide from screen readers (decorative). */
  label?: string
  className?: string
}

type G = { shell: string; visor: string; pod: string; glow: string; aura: string }

/** Eyes are light on the visor glass: shape carries the expression. */
function Eyes({ e, dx = 0 }: { e: Expression; dx?: number }) {
  const L = 68 + dx
  const R = 96 + dx
  const Y = 66
  const arc = (x: number, up: boolean) => <path d={up ? `M${x - 6} ${Y + 2} Q${x} ${Y - 6} ${x + 6} ${Y + 2}` : `M${x - 6} ${Y - 1} Q${x} ${Y + 5} ${x + 6} ${Y - 1}`} className="m-eye-line" />
  const pill = (x: number, h = 14, w = 9, y = Y) => <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={w / 2} className="m-eye" />

  let left: JSX.Element
  let right: JSX.Element
  switch (e) {
    case 'joy':
    case 'grin':
      left = arc(L, true)
      right = arc(R, true)
      break
    case 'wink':
      left = pill(L)
      right = arc(R, true)
      break
    case 'sleepy':
      left = <path d={`M${L - 6} ${Y} H${L + 6}`} className="m-eye-line" />
      right = <path d={`M${R - 6} ${Y} H${R + 6}`} className="m-eye-line" />
      break
    case 'focused':
      left = pill(L, 6, 12)
      right = pill(R, 6, 12)
      break
    case 'surprised':
      left = <circle cx={L} cy={Y} r={6.5} className="m-eye" />
      right = <circle cx={R} cy={Y} r={6.5} className="m-eye" />
      break
    case 'thinking':
      left = pill(L - 2, 12, 9, Y - 3)
      right = pill(R - 2, 12, 9, Y - 3)
      break
    case 'sad':
      left = <path d={`M${L - 5} ${Y - 4} L${L + 5} ${Y + 1}`} className="m-eye-line" />
      right = <path d={`M${R + 5} ${Y - 4} L${R - 5} ${Y + 1}`} className="m-eye-line" />
      break
    case 'curious':
      left = pill(L, 11)
      right = pill(R, 16, 10)
      break
    default:
      left = pill(L)
      right = pill(R)
  }
  const blinks = ['happy', 'curious', 'thinking', 'surprised', 'wink'].includes(e)
  return (
    <g className={`m-eyes${blinks ? ' m-eyes--blink' : ''}${e === 'happy' ? ' m-eyes--roam' : ''}`}>
      {left}
      {right}
    </g>
  )
}

function Mouth({ e, dx = 0 }: { e: Expression; dx?: number }) {
  const x = 82 + dx
  if (e === 'sleepy' || e === 'focused' || e === 'thinking') return null
  if (e === 'surprised') return <circle cx={x} cy={81} r={2.4} className="m-eye" />
  if (e === 'sad') return <path d={`M${x - 5} 83 Q${x} 79 ${x + 5} 83`} className="m-mouth" />
  if (e === 'grin') return <path d={`M${x - 7} 79 Q${x} 87 ${x + 7} 79`} className="m-mouth m-mouth--wide" />
  return <path d={`M${x - 5} 80 Q${x} 84 ${x + 5} 80`} className="m-mouth" />
}

function Head({ g, e, dx = 0 }: { g: G; e: Expression; dx?: number }) {
  return (
    <g className="m-head">
      {/* antenna light */}
      <g className="m-antenna">
        <path d="M82 26 V16" className="m-antenna__stem" />
        <circle cx={82} cy={13} r={4.5} className="m-antenna__tip" />
      </g>
      {/* ear pods */}
      <rect x={28} y={54} width={12} height={26} rx={6} fill={g.pod} />
      <rect x={124} y={54} width={12} height={26} rx={6} fill={g.pod} />
      <rect x={31} y={61} width={4} height={12} rx={2} className="m-pod-light" />
      <rect x={129} y={61} width={4} height={12} rx={2} className="m-pod-light" />
      {/* shell */}
      <rect x={36} y={26} width={92} height={76} rx={34} fill={g.shell} className="m-shell" />
      {/* visor */}
      <rect x={45} y={41} width={74} height={48} rx={24} fill={g.visor} />
      <path d="M56 48 Q70 43 86 44" className="m-visor-shine" />
      <Eyes e={e} dx={dx} />
      <Mouth e={e} dx={dx} />
    </g>
  )
}

function PropItem({ prop }: { prop: Prop }) {
  switch (prop) {
    case 'magnifier':
      return (
        <g className="m-prop m-prop--sweep">
          <path d="M139 122 L150 134" className="m-handle" />
          <circle cx={132} cy={113} r={11} className="m-glass" />
        </g>
      )
    case 'sign':
      return (
        <g className="m-prop m-prop--nod">
          <rect x={124} y={92} width={30} height={26} rx={8} className="m-card" />
          <path d="M132 105 L137 110 L146 100" className="m-tick" />
        </g>
      )
    case 'clipboard':
      return (
        <g className="m-prop">
          <rect x={124} y={98} width={26} height={32} rx={6} className="m-card" />
          <path d="M130 108 H144 M130 115 H144 M130 122 H139" className="m-card__lines" />
        </g>
      )
    case 'confetti':
      return (
        <g className="m-confetti" aria-hidden="true">
          {[[26, 34], [138, 28], [18, 82], [148, 76], [46, 12], [118, 10], [150, 112], [14, 118]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={i % 2 ? 2.6 : 3.4} className={`m-spark m-spark--${i % 3}`} style={{ animationDelay: `${i * 70}ms` }} />
          ))}
        </g>
      )
    default:
      return null
  }
}

function Standing({ g, e, prop }: { g: G; e: Expression; prop: Prop }) {
  const holding = prop === 'magnifier' || prop === 'sign' || prop === 'clipboard'
  const up = prop === 'confetti'
  return (
    <g className="m-pose m-pose--stand">
      <ellipse cx={82} cy={152} rx={24} ry={4} className="m-shadow" />
      <g className="m-hover">
        <circle cx={82} cy={70} r={62} fill={g.aura} className="m-aura" />
        {/* body */}
        <path d="M60 106 Q60 100 66 100 H98 Q104 100 104 106 V120 Q104 136 82 138 Q60 136 60 120 Z" fill={g.shell} className="m-shell" />
        <circle cx={82} cy={117} r={6} fill={g.glow} className="m-core" />
        {/* hands */}
        <g className={up ? 'm-hand m-hand--up-l' : 'm-hand m-hand--l'} style={{ transformOrigin: '60px 108px' }}>
          <ellipse cx={48} cy={118} rx={7} ry={8} fill={g.shell} className="m-shell" />
        </g>
        <g
          className={prop === 'wave' ? 'm-hand m-hand--wave' : up ? 'm-hand m-hand--up-r' : holding ? 'm-hand m-hand--hold' : 'm-hand m-hand--r'}
          style={{ transformOrigin: '104px 108px' }}
        >
          <ellipse cx={116} cy={118} rx={7} ry={8} fill={g.shell} className="m-shell" />
        </g>
        <Head g={g} e={e} />
        <PropItem prop={prop} />
      </g>
    </g>
  )
}

/** Turned sideways at a laptop, typing; the screen light plays on its visor. */
function Laptop({ g, e }: { g: G; e: Expression }) {
  return (
    <g className="m-pose m-pose--laptop">
      <ellipse cx={90} cy={152} rx={40} ry={4} className="m-shadow" />
      <g className="m-hover m-hover--slow">
        <circle cx={78} cy={72} r={58} fill={g.aura} className="m-aura" />
        <path d="M50 106 Q50 100 56 100 H90 Q96 100 96 106 V120 Q96 136 73 138 Q50 136 50 120 Z" fill={g.shell} className="m-shell" />
        <circle cx={73} cy={117} r={5.5} fill={g.glow} className="m-core m-core--busy" />
        <g transform="translate(-6 2)">
          <Head g={g} e={e === 'happy' ? 'focused' : e} dx={8} />
        </g>
        <ellipse cx={104} cy={70} rx={18} ry={20} className="m-screenlight" />
        {/* laptop, seen from the side and slightly behind */}
        <path d="M100 132 L152 128 L156 134 L104 138 Z" className="m-laptop-base" />
        <path d="M128 96 L156 92 L152 128 L124 131 Z" className="m-laptop-lid" />
        <circle cx={140} cy={112} r={3} className="m-laptop-logo" />
        {/* hands tapping */}
        <g className="m-type m-type--a"><ellipse cx={110} cy={128} rx={7} ry={5.5} fill={g.shell} className="m-shell" /></g>
        <g className="m-type m-type--b"><ellipse cx={96} cy={130} rx={7} ry={5.5} fill={g.shell} className="m-shell" /></g>
        <g className="m-bits" aria-hidden="true">
          <rect x={136} y={78} width={8} height={2.6} rx={1.3} />
          <rect x={146} y={70} width={6} height={2.6} rx={1.3} />
          <rect x={130} y={66} width={7} height={2.6} rx={1.3} />
        </g>
      </g>
    </g>
  )
}

export const Mascot = memo(function Mascot({ expression = 'happy', prop = 'none', pose = 'stand', size = 120, label, className }: Props) {
  const id = `m${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const g: G = { shell: `url(#${id}sh)`, visor: `url(#${id}vi)`, pod: `url(#${id}po)`, glow: `url(#${id}gl)`, aura: `url(#${id}au)` }
  return (
    <svg
      className={`mascot mascot--${pose}${className ? ` ${className}` : ''}`}
      viewBox="0 0 164 160"
      width={size}
      height={size}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}sh`} x1="0.2" y1="0" x2="0.7" y2="1">
          <stop offset="0" className="m-s-shell1" />
          <stop offset="1" className="m-s-shell2" />
        </linearGradient>
        <linearGradient id={`${id}vi`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="m-s-visor1" />
          <stop offset="1" className="m-s-visor2" />
        </linearGradient>
        <linearGradient id={`${id}po`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="m-s-pod1" />
          <stop offset="1" className="m-s-pod2" />
        </linearGradient>
        <radialGradient id={`${id}gl`}>
          <stop offset="0" className="m-s-glow1" />
          <stop offset="1" className="m-s-glow2" />
        </radialGradient>
        <radialGradient id={`${id}au`}>
          <stop offset="0" className="m-s-aura1" />
          <stop offset="1" className="m-s-aura2" />
        </radialGradient>
      </defs>
      {pose === 'laptop' ? <Laptop g={g} e={expression} /> : <Standing g={g} e={expression} prop={prop} />}
    </svg>
  )
})
