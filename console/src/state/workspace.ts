import { useCallback, useEffect, useReducer } from 'react'
import { cmdbApps, directoryTeams, normaliseTeamName, type CmdbApp, type DirTeam } from '../data/directory'

/**
 * Who you are in Optimus: the teams you belong to and the apps each team has onboarded.
 * Mock-first: kept in localStorage so a reload keeps your setup. It moves to the harness
 * once team and app APIs exist.
 */
export interface WorkspaceState {
  createdTeams: DirTeam[]
  myTeams: string[]
  activeTeam: string | null
  teamApps: Record<string, string[]>
  activeApp: string | null
  /** The user said "not now" to the mascot's onboarding nudge. */
  nudgeDismissed: boolean
}

/** Apps that existing directory teams already onboarded (so joining a team brings its apps). */
const seededTeamApps: Record<string, string[]> = {
  't-order': ['CI0001001', 'CI0001004', 'CI0001005', 'CI0001006', 'CI0001002'],
  't-lab': ['CI0001002', 'CI0001007'],
  't-mes': ['CI0001008', 'CI0001009', 'CI0001016'],
}

const initial: WorkspaceState = { createdTeams: [], myTeams: [], activeTeam: null, teamApps: {}, activeApp: null, nudgeDismissed: false }

type Action =
  | { type: 'createTeam'; team: DirTeam }
  | { type: 'joinTeam'; id: string }
  | { type: 'setTeam'; id: string }
  | { type: 'onboardApp'; ciId: string }
  | { type: 'setApp'; ciId: string | null }
  | { type: 'dismissNudge'; value: boolean }
  | { type: 'reset' }

function reducer(s: WorkspaceState, a: Action): WorkspaceState {
  switch (a.type) {
    case 'createTeam':
      return { ...s, createdTeams: [...s.createdTeams, a.team], myTeams: [...s.myTeams, a.team.id], activeTeam: a.team.id, teamApps: { ...s.teamApps, [a.team.id]: [] }, activeApp: null, nudgeDismissed: false }
    case 'joinTeam': {
      if (s.myTeams.includes(a.id)) return { ...s, activeTeam: a.id }
      const apps = s.teamApps[a.id] ?? seededTeamApps[a.id] ?? []
      return { ...s, myTeams: [...s.myTeams, a.id], activeTeam: a.id, teamApps: { ...s.teamApps, [a.id]: apps }, activeApp: null, nudgeDismissed: false }
    }
    case 'setTeam':
      return { ...s, activeTeam: a.id, activeApp: null }
    case 'onboardApp': {
      if (!s.activeTeam) return s
      const list = s.teamApps[s.activeTeam] ?? []
      return { ...s, teamApps: { ...s.teamApps, [s.activeTeam]: list.includes(a.ciId) ? list : [...list, a.ciId] }, activeApp: a.ciId }
    }
    case 'setApp':
      return { ...s, activeApp: a.ciId }
    case 'dismissNudge':
      return { ...s, nudgeDismissed: a.value }
    case 'reset':
      return initial
  }
}

const KEY = 'optimus.workspace.v1'

function load(): WorkspaceState {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? { ...initial, ...(JSON.parse(raw) as WorkspaceState) } : initial
  } catch {
    return initial
  }
}

export function useWorkspace() {
  const [state, dispatch] = useReducer(reducer, undefined, load)

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state))
    } catch {
      /* private mode: setup just won't survive a reload */
    }
  }, [state])

  const allTeams = [...directoryTeams, ...state.createdTeams]
  const team = allTeams.find((t) => t.id === state.activeTeam) ?? null
  const teams = state.myTeams.map((id) => allTeams.find((t) => t.id === id)).filter(Boolean) as DirTeam[]
  const appsOf = useCallback(
    (teamId: string) => (state.teamApps[teamId] ?? []).map((c) => cmdbApps.find((a) => a.ciId === c)).filter(Boolean) as CmdbApp[],
    [state.teamApps],
  )
  const teamApps = team ? appsOf(team.id) : []
  const app = cmdbApps.find((a) => a.ciId === state.activeApp) ?? null

  /** Unique across the directory and teams created here. */
  const isNameTaken = useCallback(
    (name: string) => {
      const n = normaliseTeamName(name)
      return [...directoryTeams, ...state.createdTeams].some((t) => normaliseTeamName(t.name) === n)
    },
    [state.createdTeams],
  )

  return {
    state,
    team,
    teams,
    teamApps,
    app,
    appsOf,
    isNameTaken,
    createTeam: (name: string) => {
      const team: DirTeam = { id: `t-new-${Date.now().toString(36)}`, name: name.trim().replace(/\s+/g, ' '), assignmentGroup: 'Not linked yet', description: 'Created in Optimus', leads: ['Alex Kim'], members: 1 }
      dispatch({ type: 'createTeam', team })
      return team
    },
    joinTeam: (id: string) => dispatch({ type: 'joinTeam', id }),
    setTeam: (id: string) => dispatch({ type: 'setTeam', id }),
    onboardApp: (ciId: string) => dispatch({ type: 'onboardApp', ciId }),
    setApp: (ciId: string | null) => dispatch({ type: 'setApp', ciId }),
    dismissNudge: (value = true) => dispatch({ type: 'dismissNudge', value }),
    reset: () => dispatch({ type: 'reset' }),
  }
}

export type Workspace = ReturnType<typeof useWorkspace>
