# Optimus console (v0.1)

React web console for Optimus: chat with the support agent, watch the ServiceNow and Dynatrace tools it calls,
approve production changes, and see the incident, app, team and monitoring context beside the conversation.

Design: Miro's design language with Pfizer blue in place of black. See [DESIGN-NOTES.md](DESIGN-NOTES.md) for
the decisions, how it maps to the harness, and the guesses still to confirm.

**Status:** UI only. All data is mocked in `src/data/mock.ts` (mirrors `harness/src/tools/fixtures.ts`).

```bash
cd console
npm install
npm run dev            # http://localhost:5173
npm run build          # production build in dist/
npm run build:single   # one self-contained HTML file in dist-single/, handy for sharing a preview
```

Try **Approve as lead** on the rollback card, the suggested prompts above the composer, the tabs on the right,
and Ctrl/⌘K for the command palette.
