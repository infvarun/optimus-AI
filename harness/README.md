# Optimus harness (v0.1, Python + FastAPI)

The agent backend for Optimus: a Copilot-like assistant for enterprise **application support and
operations**. Built on the Copilot SDK for Python ([`microsoft-copilot-sdk`](https://pypi.org/project/microsoft-copilot-sdk/) 2.0.3)
with **bring-your-own-key (BYOK)**. No GitHub Copilot login is used for model calls.

- **An agent that keeps going**: it plans, calls tools, reads the results, revises its hypothesis and calls more
  tools until it can submit a structured resolution. See [How the agent loop works](#how-the-agent-loop-works).
- **Plan mode**: writes `Plan.md` (and scratch notes like `context.md`) for review before it investigates.
- **Sessions**: create, list, abort, delete. Each one is a Copilot SDK session with its own history and workspace folder.
- **Streaming**: every step streams as Server-Sent Events: thinking, text, tool calls and results, plan updates, the resolution.
- **Ops tools (stubs, invented data)** modelled on the systems in use:
  - ServiceNow: `servicenow_cmdb_lookup`, `servicenow_incident_search`, `servicenow_change_search`, `servicenow_kb_search`
  - Dynatrace: `dynatrace_problems`, `dynatrace_service_health`, `dynatrace_log_search`
- **Locked-down tool surface**: only these read-only tools are exposed. The SDK's built-in shell, file-edit and
  web tools are disabled (`available_tools: ["custom:*"]`) and a permission handler rejects anything else.

> **About the SDK package.** `github-copilot-sdk` on PyPI (and `@github/copilot-sdk` on npm) are now marked
> deprecated in favour of `microsoft-copilot-sdk` / `@microsoft/copilot-sdk` 2.x, which is what this uses. The 2.x
> API differs from the GitHub docs' examples (e.g. `inference={"providers": [...]}` instead of `provider=...`).

## Run it locally with Ollama

Needs Python 3.11+ and [Ollama](https://ollama.com).

```bash
# 1. A model that supports tool calling, and enough context (see note below)
ollama pull qwen3:8b
OLLAMA_CONTEXT_LENGTH=16384 ollama serve        # or set it in the Ollama app settings

# 2. The harness
cd harness
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
python -m copilot download-runtime                  # one-time: fetches the Copilot runtime (~100 MB)
cp .env.example .env                                # defaults to ollama + qwen3:8b
python -m optimus_harness                           # http://127.0.0.1:8787  (RELOAD=1 for auto-reload)

# 3. In another terminal: ask it something and watch the tool calls
python scripts/smoke.py
python scripts/smoke.py "Is LabTrack LIMS healthy? Any changes coming up?"
```

Interactive API docs: http://127.0.0.1:8787/docs

**How reliable is it on your model?** With the harness running:

```bash
python scripts/eval.py --repeat 3 --out eval.json
```

It runs six fixed questions (an investigation, "what changed", "this app" with console context, a status update
draft, a health check and a plan-mode request), checks each answer for the right ticket ids, normal finish and no
repetition, and prints a pass rate per question.

`scripts/smoke.py` prints each step, the thinking (dimmed), tool calls, plan updates and the final resolution. It exits
0 if the agent used tools and submitted a resolution, 2 if it never did, and 1 on error or a limit.

**Which model.** Use `qwen3` from Ollama: it does tool calling and thinking, and Ollama streams its thinking
separately so the console can show it. `qwen3:8b` (~6 GB) runs on most laptops; `qwen3:14b` (~10 GB) generally follows the
plan-investigate-resolve loop and recovers from tool errors better if you have the memory (expectation, not yet measured here). Expect
a full investigation to take a few minutes on a laptop.

**Ollama gotchas (read if answers look wrong):**
- **Context length.** Before the user says anything, the request is about 13 KB (roughly 3.5k tokens): the SDK's
  system prompt plus 7 tool schemas. If Ollama runs with a small context window (older versions and some setups
  default to 2k to 4k tokens), it silently cuts the start of the prompt and the model "forgets" its tools.
  Set `OLLAMA_CONTEXT_LENGTH` to 16384 or more.
- **Tool calling.** Only models tagged *tools* in the Ollama library work (qwen3, qwen2.5, llama3.1, mistral-nemo…).
  Small models (≤8B) call tools less reliably than hosted models. That's expected, not a harness bug.

**No model at all?** Run the scripted fake LLM instead:

```bash
python scripts/mock_llm.py &
LLM_PROVIDER_TYPE=openai LLM_BASE_URL=http://127.0.0.1:11435/v1 LLM_MODEL=mock-1 python -m optimus_harness
```

## How the agent loop works

Each user message starts a **run**:

1. **Inner loop (Copilot runtime):** model → tool calls → results → model → … until the model stops calling tools.
   Tool argument mistakes come back to the model as readable errors (e.g. *missing required argument: app*), so it
   fixes the call and retries.
2. **Outer loop (harness):** decides whether the run is finished.
   - An investigation ends when the agent calls `submit_resolution` (status `resolved`, `needs_human`,
     `needs_info`, `answered` or `plan_ready`): outcome `resolved`.
   - A question or a draft ("what changed?", "write a status update") ends with a plain-text answer:
     outcome `answered`. That is a normal finish, not a failure.
   - If the agent stops with no text, or stops partway through its own plan with a statement instead of an
     answer, the harness nudges it once to continue (`continue` event, internal; don't show it to users).
     Text written after a nudge is held back and dropped if it only repeats the earlier answer.
   - Plan mode: if the agent wrote the plan but forgot `submit_resolution`, the harness completes it as `plan_ready`.
3. **Working memory:** for multi-step work the agent writes `Plan.md` with `update_plan` and keeps findings in
   `context.md` with `workspace_write`, reading them back later. Files live in
   `<HARNESS_DATA_DIR>/workspaces/<session id>/`; the tools can't write anywhere else (plain `*.md` names only,
   64 KB per file, 20 files).
4. **Long runs:** the runtime is told the model's real context window (`LLM_CONTEXT_TOKENS`) and compacts older
   context in the background before the model server would silently truncate it.
5. **Guards:** `AGENT_MAX_TOOL_CALLS` (30) and `AGENT_TURN_TIMEOUT_SECONDS` (900) per run. On breach the run is
   aborted and a `limit` event is sent.

**Plan mode** (`"mode": "plan"` on the message, or `python scripts/smoke.py --plan`): the agent identifies the app,
writes the plan and stops with `plan_ready`. Reply in normal mode ("go ahead") and it executes the plan, updating
step status as it goes. *Guess at the intended behaviour: plan first, human approves, then execute, like Copilot's
plan mode. Easy to change if you meant something else.*

## Providers

Set in `.env`. The server refuses to start without `LLM_PROVIDER_TYPE` and `LLM_MODEL`.

| Provider | `LLM_PROVIDER_TYPE` | `LLM_BASE_URL` | Notes |
|---|---|---|---|
| Ollama (now) | `ollama` | optional, default `http://localhost:11434/v1` | No key. |
| Azure OpenAI | `azure` | `https://<resource>.openai.azure.com` | Host only. `LLM_MODEL` = deployment name. Entra ID token via `LLM_BEARER_TOKEN`. |
| Internal multi-model gateway | `openai` | `https://<gateway>/v1` | Any OpenAI-compatible gateway (LiteLLM, APIM…) |
| AWS Bedrock | `openai` via a gateway | gateway URL | The SDK has **no native Bedrock provider**. Put an OpenAI-compatible gateway in front of Bedrock. |
| OpenAI | `openai` | `https://api.openai.com/v1` | |
| Anthropic | `anthropic` | `https://api.anthropic.com` | |

Only the OpenAI-compatible path (what Ollama uses) has been exercised, against the mock. Azure, Anthropic and
gateways are wired from the SDK's documented config but untested.

## HTTP API

All `/api/*` routes require `Authorization: Bearer $HARNESS_API_TOKEN` when that variable is set.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/healthz` | | `{ ok, model, provider, baseUrl }` |
| POST | `/api/sessions` | | `201 { id }` |
| GET | `/api/sessions` | | `{ sessions: [{ id, createdAt, lastUsed, busy }] }` |
| GET | `/api/sessions/{id}` | | `{ id, busy, plan, resolution, files }` |
| GET | `/api/sessions/{id}/files` | | `{ files: [{ name, bytes }] }` |
| GET | `/api/sessions/{id}/files/{name}` | | the file, `text/markdown` |
| POST | `/api/sessions/{id}/messages` | `{ "prompt": "...", "mode": "auto" \| "plan", "context"?: { "app": "...", "incident": "..." } }` | `text/event-stream` (below) |
| POST | `/api/sessions/{id}/abort` | | `202` |
| DELETE | `/api/sessions/{id}` | | `204` |

Errors: `401` bad token, `404` unknown session, `409` session already mid-turn, `422` bad body, `429` too many sessions.
Set `CORS_ORIGINS` to let a browser app (e.g. the console's Vite dev server) call the API directly.

### Stream events

Each SSE message has `event: <type>` and a JSON `data:` line (field names are camelCase for the JS console):

```
run_start   { mode, limits }                 the run began
turn_start  { step }                         a model call began (one per step)
thinking    { text }                         streamed reasoning (models that think, e.g. qwen3)
delta       { text }                         streamed assistant text
tool_start  { toolCallId, toolName, arguments }
tool_end    { toolCallId, success, result?, error? }   result truncated to 4000 chars
plan        { file, goal, steps: [{ title, status, note? }] }   after each update_plan
workspace   { file }                         a scratch file was written
continue    { attempt, of }                  internal: agent stopped mid-plan and was nudged (don't show users)
limit       { reason, toolCalls, steps }     max_tool_calls | timeout | max_continues (nudged, still no answer)
resolution  { status, summary, likely_cause?, confidence?, evidence[], next_steps[], owner? }
usage       { data }                         tokens, latency, finish reason
compacted                                    older context was summarised
message     { content }                      complete assistant message
error       { message }
done        { outcome, toolCalls, steps, continues, answer? }   always last
            outcome: resolved | answered (answer = the final plain-text reply) | no_answer | error | timeout | max_tool_calls
```

If the client disconnects mid-reply, the harness aborts the agent so it stops spending tokens.

## Layout

```
optimus_harness/
  __main__.py          python -m optimus_harness  (uvicorn)
  app.py               FastAPI app, routes, SSE, auth placeholder, CORS
  sessions.py          SessionManager: Copilot client, sessions, event mapping, permission policy, system prompt
  config.py            env -> BYOK provider config
  tools/
    __init__.py        tool registry (OPS_TOOLS)
    agent.py           per-session tools: update_plan, workspace_*, submit_resolution
    servicenow.py      CMDB, incidents, changes, knowledge (STUBS)
    dynatrace.py       problems, service health, logs (STUBS)
    fixtures.py        invented apps, teams, tickets, problems; times stay fresh and get "15 min ago" fields
scripts/
  mock_llm.py          scripted fake LLM that plays an 8-step investigation (thinks, plans, makes a bad
                       tool call and retries, stops early and gets nudged, submits a resolution)
  smoke.py             end-to-end check against a running harness
  eval.py              reliability check: fixed questions x N runs, pass rate per question
tests/                 tools, config, and the API end to end through the real Copilot runtime (mock LLM)
```

## Making the tools real

Each tool module says which API to call. In short:
- **ServiceNow** Table API (`cmdb_ci_appl`, `incident`, `change_request`, `kb_knowledge`) with OAuth for a read-only integration user.
- **Dynatrace** Environment API v2 (`/problems`, `/metrics/query`, `/logs/search`) with a read-only token.
- Resolve the app through the CMDB first and pass only its known Dynatrace entity id. Never let the model pass raw
  selectors or URLs through.
- Anything that changes a system (create incident, restart, rollback) must not set `skip_permission`. Route it through
  a human approval step in `permission_policy` (`sessions.py`), ideally checked against the app's team leads.

## Tests

```bash
pytest          # 20 tests, about 8 s
```

## Known limits of v0.1

- **Sessions live in memory.** A restart loses them; multiple replicas need sticky sessions. The SDK can resume sessions; a session store is next.
- **Auth is a shared-token placeholder.** Needs SSO (Entra ID) and per-user identity, then scoping by team (who may see which apps).
- **Tools are stubs** with invented data.
- **No audit log** of prompts, tool calls and results yet.
- **One provider per process.**
- **Abort on client disconnect** is implemented but not covered by a test.
- The Copilot runtime is a native binary downloaded per platform on first use (or via `python -m copilot download-runtime`).
  Locked-down networks may need `COPILOT_CLI_DOWNLOAD_BASE_URL` pointed at an internal mirror.
