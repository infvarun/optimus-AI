# Optimus console: design notes (v0.1)

React 18 + Vite + TypeScript. All data is mocked in `src/data/mock.ts`, and nothing calls the harness yet.

The mock data mirrors `harness/src/tools/fixtures.ts`: the same three apps (Clinical Supply Portal, LabTrack LIMS,
Expense Cloud), their support teams with leads, members and on-call, ServiceNow incidents, change requests, CMDB
dependencies and KB articles, and Dynatrace problems and service health. Tool names in the chat trace match the
harness tools exactly. ServiceNow requests (RITM) are invented in the console only; the harness has no tool for them yet.

## Run
    npm install
    npm run dev            # local dev
    npm run build:single   # one self-contained HTML in dist-single/

## How the Miro template was adapted
- `{colors.primary}` (Miro's black pill CTA) is now **Pfizer blue**. It drives primary pills,
  the user's chat bubbles, active nav, switches, focus rings, and the approval card border.
- Miro's separate link blue is folded into Pfizer blue so there is only one blue.
- Ink keeps Miro's navy (#050038), which sits well beside the blue.
- Canary yellow is kept only for the wordmark and agent avatar, as Miro reserves it.
- Sticky-note pastels carry meaning: coral = active incident, teal/rose/yellow = runbook cards.
- Pills (`rounded.full`) on every button, tab, chip and badge. 28px corners on pastel cards.
- Flat surfaces with hairline borders; elevation only on the composer, approval card, and overlays.

## Guidance applied
- ui-ux-pro-max: 4.5:1 text contrast, visible focus rings, 36–44px targets, SVG icons (no emoji),
  `prefers-reduced-motion`, no horizontal scroll at 390px, loading/streaming states.
- interface-design: one depth strategy (borders first), monospace for machine data (tool calls,
  IDs, latencies), product-specific layout (chat + tool trace + approval gate + live context).
- vercel react best practices: `React.lazy` for the command palette, `memo` on message rows so
  streaming re-renders only the last message, functional `setState`, `useDeferredValue` for
  palette search, direct icon imports from `lucide-react`.

## Screens
- **Left:** navigation (Console, Incidents, Changes, Requests, Applications, Knowledge), your teams' apps with
  health and app type (Custom, SaaS, COTS), and recent sessions keyed by ServiceNow number.
- **Centre:** the agent conversation. Each reply shows the tool calls it made (expand for output), then the answer.
  Production changes stop at an approval card that names the owning team's leads.
- **Right:** context in four tabs: Overview (incident, app and team, matching knowledge), Dynatrace (problems,
  service health against last week), ServiceNow (changes, other incidents, requests, CMDB dependencies), Tools.

## Wiring it to the harness (next step)
The harness streams `turn_start`, `delta`, `tool_start`, `tool_end`, `message`, `usage`, `error`, `done`
over SSE. `delta` appends to the streaming agent message, `tool_start`/`tool_end` map onto `ToolCall`
(`running` → `ok`/`error`), and `done` clears `streaming`. The approval card has no harness counterpart yet:
the harness exposes read-only tools only, so a write tool plus a lead-approval step in `permissionPolicy` is needed first.

## Guesses to confirm
1. **Pfizer blue hex = #0000C9.** From memory of the 2021 brand; check against your brand portal.
2. **Font.** Roobert PRO is licensed; Figtree is a free stand-in. Swap in `--font-sans` if you hold a licence or have a Pfizer brand font.
3. **Miro token hexes.** getdesign.md was not reachable from the build environment, so neutrals and pastels are approximations.
4. **The wordmark glyph** is a placeholder. The product name now follows the repo: Optimus.
5. **Dark theme** is derived; Miro publishes none.
6. **Harness event shapes** (tool calls, approval requests) are guessed from Copilot SDK concepts.
7. **Model badge shows Ollama · qwen3:8b,** matching the harness default. It should read `/healthz` once wired.
8. **Who can approve.** The card says a team lead must approve, but the demo lets anyone click Approve. Real role checks belong in the harness.

## Agent run UI (v0.2)
- **One status pill per run.** While running it shows a pulsing dot, a shimmering label for the current step
  ("Checking Dynatrace problems…"), elapsed time and the number of checks. When done it reads "Worked 14s · 5 checks"
  and expands to the Activity panel (thought process, notes from earlier steps, every tool call with its output).
  Activity opens while the agent works and folds away (animated) when it finishes.
- **Only the final step's text is the answer.** Text from earlier steps goes to Activity as notes, so interim
  narration never piles up as repeats.
- **Harness bookkeeping stays out of sight.** `continue` nudges are a count in Activity; limits become one quiet
  footnote; a run with no usable answer shows one error card with Retry.
- **Answers render as Markdown** (tables, lists, headings, code) via react-markdown + remark-gfm, with no raw HTML.
  INC / CHG / RITM / KB / Dynatrace P- ids become colour-coded chips.
- **Robustness:** tolerant SSE parser, deltas batched per animation frame, session recreated once if the harness
  restarted (404), friendly errors for 409/429/401/5xx/network, Stop marks the run "Stopped by you".
- The demo plays scripted runs through the same event reducer as live runs (`src/run/demoScripts.ts`).

## v0.3: team and app onboarding, app workspace, Copilot sidebar
Rebuilt the console around Varun's hand-sketched flow. Everything is still mock data
(`src/data/directory.ts`), except chat runs, which use the harness when it is running.

**Flow**
1. No team: Prime (the mascot, centre of the navbar) offers to help. "Yes" hides the chat box, and Prime flies
   into a canvas in the centre: *Create a new team* (unique-name check, live) or *Join an existing team*
   (search, pick, join). On success Prime flies home and the team name flies into the navbar Team dropdown.
2. No app: Prime suggests app onboarding. Search only, by CI ID or app name. On success Prime flies home, the
   app name flies into the composer's app chip, and the chat box is back.
3. Team dropdown opens a modal of the team's apps, 4 per page, with search, *Configure* and *Go*.
   Configure shows a "coming next" toast: the app configuration canvas is deferred.
4. *Go* (or asking a question) opens the app workspace: navbar, main area, Copilot sidebar on the right.
   Main area: time-of-day greeting and ServiceNow incidents filtered by queue (mandatory, locked), service
   (preferred, on) and service offering (optional, off). Tabs: Assigned to me, Created by me, All in queue. Search.
5. Picking an incident focuses the chat on it (chip in the composer, incident-specific suggestions). Once a run
   starts, the incident list gives way to the result: Answer, Table, Chart, Diagram, Files tabs. *Start over*
   saves the conversation to History and brings the list back.
6. Sidebar: Chat, Pinned, History tabs. Ask, Plan and Agent modes. The skills row shows which skills apply,
   in priority order: App › Team › Global. With no app, the workspace says answers come from the global skill.

**Modes and the harness.** The harness has `auto` and `plan` only. Ask and Agent both send `auto`, with
`copilot_mode` in the run context so the harness can tell them apart once it supports it. Plan sends `plan`.
The context also carries `app`, `ci`, `queue`, `team`, `incident` and `skills` (priority order).

**Prime, the mascot** (`src/mascot/`). An original character: a chunky gumdrop with round ears, a little antenna
and a pale belly. Palette is a soft periwinkle to violet to orchid gradient, loosely inspired by Meta's Muse
tones (not copied), so it stays calm beside Pfizer blue. SVG + CSS only.
- Expressions: happy, joy, grin, wink, curious, surprised, thinking, focused, sleepy, sad.
- Props: wave, magnifier (searching), sign with a tick (ready), clipboard (typing a name), confetti (done).
- Idle: slow bob, blinks every ~5 s, glances around every ~11 s, antenna sway, an ear twitch. Dozes off after
  90 s without input.
- Working: while a run is going it sits sideways with a laptop and types; the screen light flickers on its face.
- One instance for the whole app (`MascotDock`), so moving between the navbar and the canvas is a real flight
  along an arc. Everything stops under `prefers-reduced-motion`.

**Kept in localStorage** (all reads/writes guarded): teams joined or created, team apps, active app, pinned
answers, history. *Reset demo setup* in the avatar menu clears it.

**Deferred:** app configuration canvas (Stg/Prod nodes), agent-created tools, real team/app APIs, role checks.
