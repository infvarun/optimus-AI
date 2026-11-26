# Optimus console (v0.1)

React web console for Optimus: chat with the support agent, watch the ServiceNow and Dynatrace tools it calls,
approve production changes, and see the incident, app, team and monitoring context beside the conversation.

Design: Miro's design language with Pfizer blue in place of black. See [DESIGN-NOTES.md](DESIGN-NOTES.md) for
the decisions, how it maps to the harness, and the guesses still to confirm.

**Status:** the chat runs against the real harness when it's up: thinking, plan (Plan.md), every tool call, nudges and
limits, and the final resolution stream in live. Plan mode is the **Plan** toggle in the composer; Stop aborts a run.
If the harness isn't reachable, the console falls back to the demo conversation (badge shows *Demo data*).
The context panel, sidebar sessions and approval card still use `src/data/mock.ts`.

Run both locally:

```bash
# terminal 1: the harness (see harness/README.md for Ollama setup)
cd harness && source .venv/bin/activate && python -m optimus_harness     # :8787

# terminal 2: the console; Vite proxies /api and /healthz to :8787
cd console && npm install && npm run dev                                 # http://localhost:5173
```

```bash
cd console
npm install
npm run dev            # http://localhost:5173
npm run build          # production build in dist/
npm run build:single   # one self-contained HTML file in dist-single/, handy for sharing a preview
```

Try **Approve as lead** on the rollback card, the suggested prompts above the composer, the tabs on the right,
and Ctrl/⌘K for the command palette.
