import { useEffect, useId, useMemo, useState } from 'react'
import { Activity, AlertTriangle, ArrowLeft, BookOpen, CircleAlert, CircleCheck, Copy, Globe, Inbox, Layers, RotateCcw, Save } from 'lucide-react'
import type { CmdbApp } from '../data/directory'
import { ENVS, NODE_KINDS, defaultConfig, loadConfigs, nodeIssues, nodeSummary, saveConfigs, type AppConfig, type EnvConfig, type EnvId, type NodeKind } from '../data/appConfig'
import type { Mood } from '../mascot/MascotDock'

type Sel = { type: 'app' } | { type: 'env'; env: EnvId } | { type: 'node'; env: EnvId; kind: NodeKind }

interface Props {
  app: CmdbApp
  teamName: string | null
  setMood: (m: Mood) => void
  onClose: () => void
  onSaved: (msg: string) => void
}

const kindIcon: Record<NodeKind, typeof Inbox> = { servicenow: Inbox, dynatrace: Activity, endpoints: Globe, skills: BookOpen }
const kindLabel = { custom: 'Custom', saas: 'SaaS', cots: 'COTS' } as const

// Board geometry (px). Stg on top, Prod below, as in the sketch.
const ROW = 62
const NODE_H = 50
const GROUP_GAP = 44
const PAD = 28
const APP = { x: 24, w: 196, h: 104 }
const ENV = { x: 292, w: 148, h: 60 }
const KID = { x: 520, w: 248 }
const W = KID.x + KID.w + 24
const GROUP_H = NODE_KINDS.length * ROW - (ROW - NODE_H)
const H = PAD * 2 + GROUP_H * 2 + GROUP_GAP

const groupTop = (i: number) => PAD + i * (GROUP_H + GROUP_GAP)
const kidY = (gi: number, ki: number) => groupTop(gi) + ki * ROW
const envY = (gi: number) => groupTop(gi) + GROUP_H / 2 - ENV.h / 2
const appY = H / 2 - APP.h / 2
const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const mx = (x1 + x2) / 2
  return `M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function ConfigCanvas({ app, teamName, setMood, onClose, onSaved }: Props) {
  const ids = useId()
  const [saved, setSaved] = useState<AppConfig>(() => loadConfigs()[app.ciId] ?? defaultConfig(app))
  const [draft, setDraft] = useState<AppConfig>(saved)
  const [sel, setSel] = useState<Sel>({ type: 'app' })
  const [leaving, setLeaving] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const dirty = !same(saved, draft)

  const issues = useMemo(() => {
    const all: { env: EnvId; kind: NodeKind; level: 'error' | 'warn'; text: string }[] = []
    for (const e of ENVS) for (const k of NODE_KINDS) for (const i of nodeIssues(draft.envs[e.id], k.id)) all.push({ env: e.id, kind: k.id, ...i })
    return all
  }, [draft])
  const errors = issues.filter((i) => i.level === 'error')

  // Prime reads along: curious while you edit, worried at a blocking gap, delighted on save.
  useEffect(() => {
    setMood(
      celebrate ? { expression: 'joy', prop: 'confetti' }
        : errors.length ? { expression: 'thinking' }
        : dirty ? { expression: 'curious', prop: 'clipboard' }
        : { expression: 'happy', prop: 'clipboard' },
    )
  }, [celebrate, errors.length, dirty, setMood])
  useEffect(() => {
    if (!celebrate) return
    const t = window.setTimeout(() => setCelebrate(false), 2600)
    return () => window.clearTimeout(t)
  }, [celebrate])

  const setEnv = (env: EnvId, fn: (e: EnvConfig) => EnvConfig) => setDraft((d) => ({ ...d, envs: { ...d.envs, [env]: fn(d.envs[env]) } }))
  const setField = <K extends NodeKind>(env: EnvId, kind: K, field: keyof EnvConfig[K], value: string) =>
    setEnv(env, (e) => ({ ...e, [kind]: { ...e[kind], [field]: value } }))

  const save = () => {
    if (errors.length) {
      setSel({ type: 'node', env: errors[0].env, kind: errors[0].kind })
      return
    }
    const next = { ...draft, savedAt: new Date().toISOString() }
    saveConfigs({ ...loadConfigs(), [app.ciId]: next })
    setSaved(next)
    setDraft(next)
    setCelebrate(true)
    onSaved(`Saved ${app.name} configuration.`)
  }
  const discard = () => setDraft(saved)
  const back = () => (dirty ? setLeaving(true) : onClose())

  const savedLabel = saved.savedAt ? `Saved ${new Date(saved.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Defaults from the CMDB'
  const isSel = (s: Sel) => same(s, sel)

  return (
    <section className="cfg" aria-labelledby={`${ids}-title`}>
      <header className="cfg__head">
        <button className="btn btn--secondary btn--sm" onClick={back}><ArrowLeft size={14} aria-hidden="true" /> Back</button>
        <div className="cfg__anchor" data-mascot-anchor="config" aria-hidden="true" />
        <div className="cfg__titles">
          <p className="eyebrow">App configuration{teamName ? ` · ${teamName}` : ''}</p>
          <h1 id={`${ids}-title`} className="cfg__title">{app.name} <span className="mono cfg__ci">{app.ciId}</span></h1>
        </div>
        <span className={`cfg__state${dirty ? ' is-dirty' : ''}`} aria-live="polite">
          {dirty ? 'Unsaved changes' : savedLabel}
        </span>
      </header>

      {leaving && (
        <div className="confirm confirm--team cfg__leave" role="alertdialog" aria-labelledby={`${ids}-leave`}>
          <p id={`${ids}-leave`} className="confirm__title">Leave without saving?</p>
          <p className="confirm__text">Your changes to {app.name} will be lost.</p>
          <div className="confirm__actions">
            <button className="btn btn--secondary btn--sm" autoFocus onClick={() => setLeaving(false)}>Keep editing</button>
            <button className="btn btn--danger btn--sm" onClick={onClose}>Discard and leave</button>
          </div>
        </div>
      )}

      <div className="cfg__body">
        <div className="cfg__board" role="group" aria-label={`${app.name} configuration map`}>
          <div className="cfg__graph" style={{ width: W, height: H }}>
            <svg className="cfg__edges" width={W} height={H} aria-hidden="true">
              {ENVS.map((e, gi) => (
                <g key={e.id} className={draft.envs[e.id].enabled ? '' : 'is-off'}>
                  <path className="cfg__edge" style={{ animationDelay: `${gi * 80}ms` }} d={curve(APP.x + APP.w, appY + APP.h / 2, ENV.x, envY(gi) + ENV.h / 2)} />
                  {NODE_KINDS.map((k, ki) => (
                    <path key={k.id} className="cfg__edge" style={{ animationDelay: `${180 + gi * 80 + ki * 40}ms` }} d={curve(ENV.x + ENV.w, envY(gi) + ENV.h / 2, KID.x, kidY(gi, ki) + NODE_H / 2)} />
                  ))}
                </g>
              ))}
            </svg>

            <button
              className={`cnode cnode--app${isSel({ type: 'app' }) ? ' is-sel' : ''}`}
              style={{ left: APP.x, top: appY, width: APP.w, height: APP.h }}
              aria-pressed={isSel({ type: 'app' })}
              onClick={() => setSel({ type: 'app' })}
            >
              <span className="cnode__eyebrow"><Layers size={13} aria-hidden="true" /> {kindLabel[app.kind]} app</span>
              <span className="cnode__name">{app.name}</span>
              <span className="cnode__meta mono">{app.ciId}</span>
            </button>

            {ENVS.map((e, gi) => {
              const env = draft.envs[e.id]
              const envIssues = issues.filter((i) => i.env === e.id)
              return (
                <div key={e.id}>
                  <button
                    className={`cnode cnode--env${isSel({ type: 'env', env: e.id }) ? ' is-sel' : ''}${env.enabled ? '' : ' is-off'}`}
                    style={{ left: ENV.x, top: envY(gi), width: ENV.w, height: ENV.h, animationDelay: `${120 + gi * 80}ms` }}
                    aria-pressed={isSel({ type: 'env', env: e.id })}
                    onClick={() => setSel({ type: 'env', env: e.id })}
                  >
                    <span className="cnode__name">{e.short}</span>
                    <span className="cnode__meta">{!env.enabled ? 'Off' : env.access === 'read' ? 'Read only' : 'Can propose'}</span>
                    {envIssues.length > 0 && <span className={`cnode__badge${envIssues.some((i) => i.level === 'error') ? ' is-error' : ''}`} aria-label={`${envIssues.length} to review`}>{envIssues.length}</span>}
                  </button>
                  {NODE_KINDS.map((k, ki) => {
                    const Icon = kindIcon[k.id]
                    const ni = nodeIssues(env, k.id)
                    const s: Sel = { type: 'node', env: e.id, kind: k.id }
                    const state = !env.enabled ? 'off' : ni.some((i) => i.level === 'error') ? 'error' : ni.length ? 'warn' : 'ok'
                    return (
                      <button
                        key={k.id}
                        className={`cnode cnode--kid is-${state}${isSel(s) ? ' is-sel' : ''}`}
                        style={{ left: KID.x, top: kidY(gi, ki), width: KID.w, height: NODE_H, animationDelay: `${240 + gi * 80 + ki * 40}ms` }}
                        aria-pressed={isSel(s)}
                        aria-label={`${e.label} ${k.label}: ${nodeSummary(env, k.id)}${ni.length ? `, ${ni.length} to review` : ''}`}
                        onClick={() => setSel(s)}
                      >
                        <span className="cnode__icon"><Icon size={15} aria-hidden="true" /></span>
                        <span className="cnode__text">
                          <span className="cnode__label">{k.label}</span>
                          <span className="cnode__meta">{nodeSummary(env, k.id)}</span>
                        </span>
                        <span className="cnode__dot" aria-hidden="true" />
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>

        <aside className="cfg__panel" aria-label="Selected node">
          <div className="cfg__panelbody" key={JSON.stringify(sel)}>
            {sel.type === 'app' && <AppPanel app={app} draft={draft} onCopy={() => setEnv('stg', (e) => ({ ...e, servicenow: { ...draft.envs.prod.servicenow }, skills: { ...draft.envs.prod.skills } }))} onPick={setSel} issues={issues.length} />}
            {sel.type === 'env' && <EnvPanel id={sel.env} env={draft.envs[sel.env]} onChange={(fn) => setEnv(sel.env, fn)} onPick={setSel} />}
            {sel.type === 'node' && <NodePanel ids={ids} envId={sel.env} kind={sel.kind} env={draft.envs[sel.env]} setField={setField} />}
          </div>
          <footer className="cfg__foot">
            {errors.length > 0 ? (
              <p className="cfg__msg is-error"><CircleAlert size={14} aria-hidden="true" /> {errors.length === 1 ? '1 required field is empty.' : `${errors.length} required fields are empty.`}</p>
            ) : issues.length > 0 ? (
              <p className="cfg__msg"><AlertTriangle size={14} aria-hidden="true" /> {issues.length} {issues.length === 1 ? 'suggestion' : 'suggestions'}, none blocking.</p>
            ) : (
              <p className="cfg__msg is-good"><CircleCheck size={14} aria-hidden="true" /> Everything Prime needs is set.</p>
            )}
            <div className="cfg__actions">
              <button className="btn btn--secondary btn--sm" disabled={!dirty} onClick={discard}><RotateCcw size={14} aria-hidden="true" /> Discard</button>
              <button className="btn btn--primary btn--sm" disabled={!dirty} onClick={save}><Save size={14} aria-hidden="true" /> Save</button>
            </div>
          </footer>
        </aside>
      </div>
    </section>
  )
}

// ---------- Panels ----------

function AppPanel({ app, draft, onCopy, onPick, issues }: { app: CmdbApp; draft: AppConfig; onCopy: () => void; onPick: (s: Sel) => void; issues: number }) {
  const synced = same(draft.envs.stg.servicenow, draft.envs.prod.servicenow) && same(draft.envs.stg.skills, draft.envs.prod.skills)
  return (
    <>
      <div className="cfg__ph">
        <p className="eyebrow">From the CMDB</p>
        <h2>{app.name}</h2>
      </div>
      <dl className="cfg__facts">
        <dt>CI ID</dt><dd className="mono">{app.ciId}</dd>
        <dt>Type</dt><dd>{kindLabel[app.kind]}{app.vendor ? ` · ${app.vendor}` : ''}</dd>
        <dt>Criticality</dt><dd>{app.criticality === 1 ? '1, most critical' : app.criticality === 2 ? '2, somewhat critical' : '3, less critical'}</dd>
        <dt>Support queue</dt><dd className="mono">{app.queue}</dd>
        <dt>Depends on</dt><dd>{app.dependsOn.length ? app.dependsOn.join(', ') : 'Nothing recorded'}</dd>
      </dl>
      <p className="cfg__help">Pick an environment or one of its nodes to edit it. Prime uses Prod settings unless you ask about Stg. {issues ? `${issues} ${issues === 1 ? 'node needs' : 'nodes need'} a look.` : ''}</p>
      <div className="cfg__quick">
        {ENVS.map((e) => <button key={e.id} className="chip" onClick={() => onPick({ type: 'env', env: e.id })}>{e.label}</button>)}
      </div>
      <button className="btn btn--secondary btn--sm cfg__copy" disabled={synced} onClick={onCopy}>
        <Copy size={14} aria-hidden="true" /> {synced ? 'Stg matches Prod' : 'Copy Prod queue and skill to Stg'}
      </button>
    </>
  )
}

function EnvPanel({ id, env, onChange, onPick }: { id: EnvId; env: EnvConfig; onChange: (fn: (e: EnvConfig) => EnvConfig) => void; onPick: (s: Sel) => void }) {
  const label = ENVS.find((e) => e.id === id)!.label
  return (
    <>
      <div className="cfg__ph">
        <p className="eyebrow">Environment</p>
        <h2>{label}</h2>
      </div>
      <label className="switchrow">
        <span>
          <span className="switchrow__title">Prime watches {label}</span>
          <span className="switchrow__text">Off: Prime ignores this environment’s incidents and health.</span>
        </span>
        <input type="checkbox" role="switch" className="switch" checked={env.enabled} onChange={(e) => onChange((c) => ({ ...c, enabled: e.target.checked }))} />
      </label>
      <fieldset className="cfg__field" disabled={!env.enabled}>
        <legend className="field__label">What Prime may do</legend>
        <div className="seg" role="radiogroup" aria-label="What Prime may do">
          {(['read', 'propose'] as const).map((a) => (
            <button key={a} type="button" role="radio" aria-checked={env.access === a} className={`seg__opt${env.access === a ? ' is-on' : ''}`} onClick={() => onChange((c) => ({ ...c, access: a }))}>
              {a === 'read' ? 'Read only' : 'Can propose changes'}
            </button>
          ))}
        </div>
        <p className="cfg__help">{env.access === 'read' ? 'Prime looks things up but never suggests changes here.' : 'Prime may draft change requests and fixes. A person still approves every change.'}</p>
      </fieldset>
      <ul className="cfg__kids">
        {NODE_KINDS.map((k) => {
          const Icon = kindIcon[k.id]
          const n = nodeIssues(env, k.id).length
          return (
            <li key={k.id}>
              <button className="hrow cfg__kid" onClick={() => onPick({ type: 'node', env: id, kind: k.id })}>
                <span className="hrow__title"><Icon size={14} aria-hidden="true" /> {k.label}</span>
                <span className="hrow__meta">{nodeSummary(env, k.id)}{n ? ` · ${n} to review` : ''}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

const FIELDS: { [K in NodeKind]: { key: keyof EnvConfig[K]; label: string; need: 'Required' | 'Preferred' | 'Optional'; long?: boolean; mono?: boolean; hint?: string }[] } = {
  servicenow: [
    { key: 'queue', label: 'Assignment queue', need: 'Required', mono: true, hint: 'Incidents in this queue show on the app screen.' },
    { key: 'service', label: 'Business service', need: 'Preferred' },
    { key: 'offering', label: 'Service offering', need: 'Optional' },
  ],
  dynatrace: [
    { key: 'entityId', label: 'Entity ID', need: 'Preferred', mono: true, hint: 'The service or application Prime checks for problems and logs.' },
    { key: 'managementZone', label: 'Management zone', need: 'Optional' },
    { key: 'tags', label: 'Tags', need: 'Optional', mono: true, hint: 'Comma-separated.' },
  ],
  endpoints: [
    { key: 'urls', label: 'URLs', need: 'Optional', long: true, mono: true, hint: 'Comma-separated. Prime can check that they respond.' },
    { key: 'hosts', label: 'Hosts', need: 'Optional', long: true, mono: true, hint: 'Comma-separated.' },
  ],
  skills: [
    { key: 'runbooks', label: 'Runbooks', need: 'Preferred', long: true, hint: 'Comma-separated. These make up the app skill, which Prime uses before team and global skills.' },
    { key: 'notes', label: 'Notes for Prime', need: 'Optional', long: true, hint: 'Anything Prime should know, like “never restart during the 02:00 batch”.' },
  ],
}

function NodePanel<K extends NodeKind>({ ids, envId, kind, env, setField }: { ids: string; envId: EnvId; kind: K; env: EnvConfig; setField: (env: EnvId, kind: K, field: keyof EnvConfig[K], v: string) => void }) {
  const meta = NODE_KINDS.find((k) => k.id === kind)!
  const envLabel = ENVS.find((e) => e.id === envId)!.label
  const issues = nodeIssues(env, kind)
  const Icon = kindIcon[kind as NodeKind]
  const values = env[kind] as Record<string, string>
  return (
    <>
      <div className="cfg__ph">
        <p className="eyebrow">{envLabel}</p>
        <h2><Icon size={18} aria-hidden="true" /> {meta.label}</h2>
      </div>
      {!env.enabled && <p className="cfg__help">Prime doesn’t watch {envLabel}, so these settings aren’t used.</p>}
      {(FIELDS[kind] as (typeof FIELDS)[NodeKind]).map((f) => {
        const id = `${ids}-${kind}-${String(f.key)}`
        const v = values[f.key as string] ?? ''
        const invalid = f.need === 'Required' && env.enabled && !v.trim()
        return (
          <div key={String(f.key)} className="cfg__field">
            <label className="field__label" htmlFor={id}>{f.label} <span className={`need need--${f.need.toLowerCase()}`}>{f.need}</span></label>
            {f.long ? (
              <textarea id={id} className={`field field--area${f.mono ? ' mono' : ''}`} rows={3} value={v} aria-invalid={invalid} onChange={(e) => setField(envId, kind, f.key as keyof EnvConfig[K], e.target.value)} />
            ) : (
              <input id={id} className={`field${f.mono ? ' mono' : ''}`} value={v} aria-invalid={invalid} onChange={(e) => setField(envId, kind, f.key as keyof EnvConfig[K], e.target.value)} />
            )}
            {f.hint && <p className="cfg__hint">{f.hint}</p>}
          </div>
        )
      })}
      {issues.length > 0 && (
        <ul className="cfg__issues">
          {issues.map((i) => (
            <li key={i.text} className={`is-${i.level}`}>{i.level === 'error' ? <CircleAlert size={14} aria-hidden="true" /> : <AlertTriangle size={14} aria-hidden="true" />} {i.text}</li>
          ))}
        </ul>
      )}
    </>
  )
}
