# Optimus harness (v0.1, Python + FastAPI)

The agent backend for Optimus: a Copilot-like assistant for enterprise **application support and
operations**. Built on the Copilot SDK for Python ([`microsoft-copilot-sdk`](https://pypi.org/project/microsoft-copilot-sdk/) 2.0.3)
with **bring-your-own-key (BYOK)**. No GitHub Copilot login is used for model calls.

- **Sessions**: create, list, abort, delete. Each one is a Copilot SDK session with its own history.
- **Streaming**: each reply streams back as Server-Sent Events (text, tool calls, tool results, usage, done).
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

`scripts/smoke.py` exits 0 if the model called at least one tool and answered, 2 if it answered without using any
tool, and 1 on error.

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
| POST | `/api/sessions/{id}/messages` | `{ "prompt": "..." }` | `text/event-stream` (below) |
| POST | `/api/sessions/{id}/abort` | | `202` |
| DELETE | `/api/sessions/{id}` | | `204` |

Errors: `401` bad token, `404` unknown session, `409` session already mid-turn, `422` bad body, `429` too many sessions.
Set `CORS_ORIGINS` to let a browser app (e.g. the console's Vite dev server) call the API directly.

### Stream events

Each SSE message has `event: <type>` and a JSON `data:` line (field names are camelCase for the JS console):

```
turn_start                                   a model call began (several per reply when tools are used)
delta       { text }                         streamed assistant text
tool_start  { toolCallId, toolName, arguments }
tool_end    { toolCallId, success, result?, error? }   result truncated to 4000 chars
usage       { data }                         tokens, latency, finish reason
message     { content }                      complete assistant message
error       { message }
done                                         always last
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
    servicenow.py      CMDB, incidents, changes, knowledge (STUBS)
    dynatrace.py       problems, service health, logs (STUBS)
    fixtures.py        invented apps, teams, tickets, problems
scripts/
  mock_llm.py          scripted fake OpenAI-compatible LLM for offline tests
  smoke.py             end-to-end check against a running harness
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
pytest          # 13 tests, about 5 s
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
