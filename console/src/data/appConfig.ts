import type { CmdbApp } from './directory'

/**
 * Per-environment app configuration, edited on the config canvas.
 * Mock-first: defaults come from the CMDB record; edits live in localStorage until
 * the harness has an app config API.
 */
export type EnvId = 'stg' | 'prod'
export type NodeKind = 'servicenow' | 'dynatrace' | 'endpoints' | 'skills'

export interface EnvConfig {
  /** Prime may read this environment. Off = Prime ignores it. */
  enabled: boolean
  /** What Prime may do here without asking. */
  access: 'read' | 'propose'
  servicenow: { queue: string; service: string; offering: string }
  dynatrace: { entityId: string; managementZone: string; tags: string }
  endpoints: { urls: string; hosts: string }
  skills: { runbooks: string; notes: string }
}

export interface AppConfig {
  envs: Record<EnvId, EnvConfig>
  savedAt: string | null
}

export const ENVS: { id: EnvId; label: string; short: string }[] = [
  { id: 'stg', label: 'Staging', short: 'Stg' },
  { id: 'prod', label: 'Production', short: 'Prod' },
]

export const NODE_KINDS: { id: NodeKind; label: string; hint: string }[] = [
  { id: 'servicenow', label: 'ServiceNow', hint: 'Queue, service, offering' },
  { id: 'dynatrace', label: 'Dynatrace', hint: 'Entity, zone, tags' },
  { id: 'endpoints', label: 'Endpoints', hint: 'URLs and hosts' },
  { id: 'skills', label: 'App skill', hint: 'Runbooks and notes' },
]

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function defaultConfig(app: CmdbApp): AppConfig {
  const s = slug(app.name)
  const env = (id: EnvId): EnvConfig => {
    const stg = id === 'stg'
    return {
      enabled: true,
      access: 'read',
      servicenow: { queue: app.queue, service: app.service, offering: app.offering ?? '' },
      dynatrace: {
        entityId: stg ? `${app.dynatraceEntityId}-STG` : app.dynatraceEntityId,
        managementZone: `${app.service} ${stg ? 'Non-Prod' : 'Prod'}`,
        tags: `app:${s}, env:${id}`,
      },
      endpoints: {
        urls: app.kind === 'saas' ? `https://${s}${stg ? '-sandbox' : ''}.vendor.example.com` : `https://${s}${stg ? '.stg' : ''}.example.com`,
        hosts: app.kind === 'saas' ? '' : `${s.slice(0, 10)}-${id}-01, ${s.slice(0, 10)}-${id}-02`,
      },
      skills: {
        runbooks: `${app.name} runbook${app.kind === 'cots' || app.kind === 'saas' ? `, ${app.vendor ?? 'Vendor'} support guide` : ''}`,
        notes: '',
      },
    }
  }
  return { envs: { stg: env('stg'), prod: env('prod') }, savedAt: null }
}

/** What is missing on a node. Queue is mandatory; service is preferred; the rest optional. */
export function nodeIssues(env: EnvConfig, kind: NodeKind): { level: 'error' | 'warn'; text: string }[] {
  const out: { level: 'error' | 'warn'; text: string }[] = []
  if (!env.enabled) return out
  if (kind === 'servicenow') {
    if (!env.servicenow.queue.trim()) out.push({ level: 'error', text: 'Queue is required to list incidents.' })
    if (!env.servicenow.service.trim()) out.push({ level: 'warn', text: 'Add a service to narrow the incident list.' })
  }
  if (kind === 'dynatrace' && !env.dynatrace.entityId.trim()) out.push({ level: 'warn', text: 'Without an entity, Prime can’t check health or logs.' })
  if (kind === 'endpoints' && !env.endpoints.urls.trim() && !env.endpoints.hosts.trim()) out.push({ level: 'warn', text: 'No URL or host yet.' })
  if (kind === 'skills' && !env.skills.runbooks.trim()) out.push({ level: 'warn', text: 'No runbook: answers fall back to the team and global skills.' })
  return out
}

/** One-line summary shown on a node. */
export function nodeSummary(env: EnvConfig, kind: NodeKind): string {
  switch (kind) {
    case 'servicenow': return env.servicenow.queue || 'No queue'
    case 'dynatrace': return env.dynatrace.entityId || 'Not linked'
    case 'endpoints': {
      const n = [env.endpoints.urls, env.endpoints.hosts].join(',').split(',').filter((x) => x.trim()).length
      return n ? `${n} ${n === 1 ? 'endpoint' : 'endpoints'}` : 'None'
    }
    case 'skills': {
      const n = env.skills.runbooks.split(',').filter((x) => x.trim()).length
      return n ? `${n} ${n === 1 ? 'runbook' : 'runbooks'}` : 'No runbooks'
    }
  }
}

const KEY = 'optimus.appconfig.v1'

export function loadConfigs(): Record<string, AppConfig> {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Record<string, AppConfig>) : {}
  } catch {
    return {}
  }
}

export function saveConfigs(all: Record<string, AppConfig>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* private mode: config just won't survive a reload */
  }
}
