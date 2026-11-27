import { memo, useId, type CSSProperties } from 'react'
import './mascot.css'

/**
 * Prime, the Optimus mascot. An original character: a chunky blue gumdrop with round ears,
 * a little signal antenna and a pale belly. All SVG + CSS, so it scales cleanly from the
 * 44px navbar slot to the onboarding canvas, and every motion stops under
 * prefers-reduced-motion.
 *
 * Two poses share one face rig:
 *  - stand: idle bob, blinks, glances around, antenna sway; holds props.
 *  - laptop: sits sideways with a laptop on its lap and types (used while the agent works).
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

function Eyes({ expression, look }: { expression: Expression; look: 'front' | 'side' }) {
  const lx = look === 'side' ? 70 : 64
  const rx = look === 'side' ? 98 : 96
  const px = look === 'side' ? 3 : 0
  const py = look === 'side' ? 3 : 0
  const closed = expression === 'sleepy'
  const big = expression === 'surprised'

  const eye = (cx: number, side: 'l' | 'r') => {
    if (closed || (expression === 'wink' && side === 'r')) {
      return <path key={side} d={`M${cx - 8} 76 Q${cx} 82 ${cx + 8} 76`} className="m-line" />
    }
    if (expression === 'joy' || expression === 'grin') {
      // Smiling eyes: soft upside-down arcs read as warm at small sizes.
      return <path key={side} d={`M${cx - 8} 77 Q${cx} 68 ${cx + 8} 77`} className="m-line m-line--thick" />
    }
    const ry = big ? 13 : expression === 'focused' ? 7 : 11
    return (
      <g key={side} className="m-eye">
        <ellipse cx={cx} cy={74} rx={big ? 10 : 9} ry={ry} className="m-eye__white" />
        <g className={look === 'front' ? 'm-pupil m-pupil--roam' : 'm-pupil'}>
          <circle cx={cx + px + (expression === 'thinking' ? -3 : 0)} cy={75 + py + (expression === 'thinking' ? -4 : 0)} r={big ? 4.6 : 5.4} className="m-eye__pupil" />
          <circle cx={cx + px + 2 + (expression === 'thinking' ? -3 : 0)} cy={72 + py + (expression === 'thinking' ? -4 : 0)} r={1.8} className="m-eye__glint" />
        </g>
      </g>
    )
  }

  return (
    <g className="m-eyes">
      {eye(lx, 'l')}
      {eye(rx, 'r')}
      {expression === 'focused' && (
        <>
          <path d={`M${lx - 10} 64 L${lx + 9} 66`} className="m-line" />
          <path d={`M${rx - 9} 66 L${rx + 10} 64`} className="m-line" />
        </>
      )}
      {expression === 'curious' && <path d={`M${rx - 9} 58 Q${rx} 52 ${rx + 9} 57`} className="m-line" />}
      {expression === 'thinking' && <path d={`M${lx - 8} 59 L${lx + 8} 57`} className="m-line" />}
      {expression === 'sad' && (
        <>
          <path d={`M${lx - 9} 60 L${lx + 7} 64`} className="m-line" />
          <path d={`M${rx + 9} 60 L${rx - 7} 64`} className="m-line" />
        </>
      )}
    </g>
  )
}

function Mouth({ expression, cx }: { expression: Expression; cx: number }) {
  switch (expression) {
    case 'grin':
      return <path d={`M${cx - 9} 92 Q${cx} 106 ${cx + 9} 92 Z`} className="m-mouth-open" />
    case 'surprised':
      return <ellipse cx={cx} cy={97} rx={4.5} ry={5.5} className="m-mouth-open" />
    case 'curious':
      return <circle cx={cx + 2} cy={96} r={3} className="m-mouth-open" />
    case 'thinking':
      return <path d={`M${cx - 6} 96 Q${cx - 2} 93 ${cx + 2} 96 T${cx + 8} 95`} className="m-line" />
    case 'focused':
      return <path d={`M${cx - 5} 96 L${cx + 5} 96`} className="m-line" />
    case 'sleepy':
      return <ellipse cx={cx} cy={96} rx={3} ry={2.4} className="m-mouth-open" />
    case 'sad':
      return <path d={`M${cx - 7} 99 Q${cx} 92 ${cx + 7} 99`} className="m-line" />
    default:
      return <path d={`M${cx - 8} 92 Q${cx} 101 ${cx + 8} 92`} className="m-line" />
  }
}

function PropItem({ prop }: { prop: Prop }) {
  switch (prop) {
    case 'magnifier':
      return (
        <g className="m-prop m-prop--sweep">
          <path d="M128 112 L142 128" className="m-handle" />
          <circle cx={120} cy={102} r={13} className="m-glass" />
          <path d="M113 96 Q117 91 123 92" className="m-glass__shine" />
        </g>
      )
    case 'sign':
      return (
        <g className="m-prop m-prop--nod">
          <path d="M132 136 L132 84" className="m-handle" />
          <rect x={114} y={56} width={38} height={32} rx={7} className="m-sign" />
          <path d="M124 72 L131 79 L143 64" className="m-sign__tick" />
        </g>
      )
    case 'clipboard':
      return (
        <g className="m-prop">
          <rect x={112} y={92} width={30} height={38} rx={5} className="m-sign" />
          <rect x={120} y={88} width={14} height={7} rx={3} className="m-clip" />
          <path d="M118 106 H136 M118 114 H136 M118 122 H130" className="m-sign__lines" />
        </g>
      )
    case 'confetti':
      return (
        <g className="m-confetti" aria-hidden="true">
          {[
            [30, 30, '#ffd02f'], [130, 24, '#38d6f5'], [18, 70, '#ff7aa8'], [144, 64, '#ffd02f'],
            [44, 12, '#7fe3c3'], [116, 8, '#ff7aa8'], [148, 100, '#38d6f5'], [12, 108, '#7fe3c3'],
          ].map(([x, y, c], i) => (
            <rect key={i} x={x as number} y={y as number} width={6} height={9} rx={1.5} fill={c as string} style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </g>
      )
    default:
      return null
  }
}

function Antenna({ x = 80 }: { x?: number }) {
  return (
    <g className="m-antenna" style={{ transformOrigin: `${x}px 34px` }}>
      <path d={`M${x} 34 Q${x + 2} 22 ${x + 7} 16`} className="m-antenna__stem" />
      <circle cx={x + 8} cy={14} r={5.5} className="m-antenna__tip" />
    </g>
  )
}

const BODY = 'M80 30 C110 30 126 54 126 86 C126 120 108 142 80 142 C52 142 34 120 34 86 C34 54 50 30 80 30 Z'

function Standing({ expression, prop }: { expression: Expression; prop: Prop }) {
  const armsUp = prop === 'confetti'
  const holding = prop === 'magnifier' || prop === 'sign' || prop === 'clipboard'
  return (
    <g className="m-pose m-pose--stand">
      <ellipse cx={80} cy={150} rx={34} ry={5} className="m-shadow" />
      <g className="m-bob">
        <ellipse cx={64} cy={142} rx={11} ry={6.5} className="m-foot" />
        <ellipse cx={96} cy={142} rx={11} ry={6.5} className="m-foot" />
        <g className="m-ear m-ear--l">
          <circle cx={50} cy={42} r={14} className="m-fill" />
          <circle cx={50} cy={42} r={6.5} className="m-ear__inner" />
        </g>
        <g className="m-ear m-ear--r">
          <circle cx={110} cy={42} r={14} className="m-fill" />
          <circle cx={110} cy={42} r={6.5} className="m-ear__inner" />
        </g>
        <Antenna />
        <path d={BODY} className="m-fill" />
        <path d="M46 60 C52 44 64 38 76 37" className="m-sheen" />
        <ellipse cx={80} cy={123} rx={24} ry={17} className="m-belly" />
        <Eyes expression={expression} look="front" />
        <ellipse cx={54} cy={90} rx={6} ry={3.6} className="m-cheek" />
        <ellipse cx={106} cy={90} rx={6} ry={3.6} className="m-cheek" />
        <Mouth expression={expression} cx={80} />
        {/* Left arm */}
        <g className={armsUp ? 'm-arm m-arm--up-l' : 'm-arm m-arm--l'} style={{ transformOrigin: '40px 104px' }}>
          <ellipse cx={34} cy={112} rx={8} ry={13} transform="rotate(24 34 112)" className="m-fill" />
        </g>
        {/* Right arm: waves, holds a prop, or rests */}
        <g
          className={
            prop === 'wave' ? 'm-arm m-arm--wave' : armsUp ? 'm-arm m-arm--up-r' : holding ? 'm-arm m-arm--hold' : 'm-arm m-arm--r'
          }
          style={{ transformOrigin: '120px 104px' }}
        >
          <ellipse cx={126} cy={112} rx={8} ry={13} transform="rotate(-24 126 112)" className="m-fill" />
        </g>
        <PropItem prop={prop} />
      </g>
    </g>
  )
}

/** Sitting sideways, laptop on its lap, typing. The screen light flickers on its face. */
function Laptop({ expression }: { expression: Expression }) {
  return (
    <g className="m-pose m-pose--laptop">
      <ellipse cx={86} cy={150} rx={46} ry={5} className="m-shadow" />
      <g className="m-breathe">
        {/* legs stretched toward the laptop */}
        <ellipse cx={104} cy={140} rx={16} ry={7} className="m-foot" />
        <ellipse cx={96} cy={144} rx={14} ry={6.5} className="m-foot" />
        <g className="m-ear m-ear--l">
          <circle cx={52} cy={46} r={13} className="m-fill" />
          <circle cx={52} cy={46} r={6} className="m-ear__inner" />
        </g>
        <g className="m-ear m-ear--r">
          <circle cx={104} cy={40} r={13} className="m-fill" />
          <circle cx={104} cy={40} r={6} className="m-ear__inner" />
        </g>
        <Antenna x={78} />
        <path d="M78 32 C106 32 122 54 122 86 C122 118 106 142 78 142 C50 142 36 118 36 88 C36 56 50 32 78 32 Z" className="m-fill" />
        <path d="M46 62 C52 46 62 40 74 39" className="m-sheen" />
        <ellipse cx={72} cy={124} rx={21} ry={15} className="m-belly" />
        <Eyes expression={expression} look="side" />
        <ellipse cx={110} cy={92} rx={5} ry={3.2} className="m-cheek" />
        <Mouth expression={expression === 'happy' ? 'focused' : expression} cx={88} />
        {/* screen glow on the face */}
        <ellipse cx={104} cy={86} rx={22} ry={26} className="m-glow" />
        {/* arms reaching to the keyboard, alternating taps */}
        <g className="m-type m-type--a"><ellipse cx={108} cy={118} rx={7} ry={11} transform="rotate(-62 108 118)" className="m-fill" /></g>
        <g className="m-type m-type--b"><ellipse cx={100} cy={124} rx={7} ry={11} transform="rotate(-70 100 124)" className="m-fill-shade" /></g>
        {/* laptop, seen from behind its lid */}
        <path d="M112 128 L156 124 L160 130 L116 134 Z" className="m-laptop-base" />
        <path d="M124 90 L158 84 L156 124 L120 128 Z" className="m-laptop-lid" />
        <circle cx={139} cy={106} r={4} className="m-laptop-logo" />
        {/* tiny thoughts drifting up from the work */}
        <g className="m-bits" aria-hidden="true">
          <circle cx={140} cy={74} r={2.4} />
          <circle cx={150} cy={66} r={1.8} />
          <circle cx={132} cy={62} r={1.6} />
        </g>
      </g>
    </g>
  )
}

export const Mascot = memo(function Mascot({ expression = 'happy', prop = 'none', pose = 'stand', size = 120, label, className }: Props) {
  const gid = `m${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const style = { '--m-body': `url(#${gid}b)`, '--m-shade': `url(#${gid}s)` } as CSSProperties
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
      style={style}
    >
      <defs>
        {/* Soft periwinkle-to-lavender body, loosely Muse-like and calm next to Pfizer blue. */}
        <linearGradient id={`${gid}b`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" className="m-stop-1" />
          <stop offset="0.55" className="m-stop-2" />
          <stop offset="1" className="m-stop-3" />
        </linearGradient>
        <linearGradient id={`${gid}s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" className="m-stop-2" />
          <stop offset="1" className="m-stop-3" />
        </linearGradient>
      </defs>
      {pose === 'laptop' ? <Laptop expression={expression} /> : <Standing expression={expression} prop={prop} />}
    </svg>
  )
})
