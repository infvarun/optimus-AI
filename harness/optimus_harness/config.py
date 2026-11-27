"""Runtime configuration from environment variables.

There is deliberately no default model provider in code. BYOK means the
operator chooses where prompts and tool output go, so we fail fast instead of
silently sending data somewhere. `.env.example` sets Ollama on localhost.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Mapping

PROVIDER_TYPES = ("ollama", "openai", "azure", "anthropic", "google")
OLLAMA_DEFAULT_URL = "http://localhost:11434/v1"


class ConfigError(ValueError):
    pass


@dataclass(frozen=True)
class HarnessConfig:
    model: str
    #: Provider entry as the Copilot SDK expects it (inference.providers[0]).
    provider: dict[str, Any]
    #: What the operator configured, for display ("ollama" rather than "openai").
    provider_label: str
    host: str = "127.0.0.1"
    port: int = 8787
    #: Optional shared secret for the HTTP API. Placeholder for real SSO/OIDC.
    api_token: str | None = None
    max_sessions: int = 50
    session_idle_minutes: int = 30
    cors_origins: list[str] = field(default_factory=list)
    #: Where the Copilot runtime keeps session state for this harness.
    data_dir: Path = Path(".optimus-data")
    #: Model context window. Tells the runtime when to compact long investigations.
    #: Must match what the model server actually uses (e.g. OLLAMA_CONTEXT_LENGTH).
    context_tokens: int | None = None
    max_output_tokens: int = 4096
    #: Agent loop guards, per user message.
    max_tool_calls: int = 30
    max_continues: int = 2
    turn_timeout_seconds: int = 900


def _required(env: Mapping[str, str], name: str) -> str:
    value = (env.get(name) or "").strip()
    if not value:
        raise ConfigError(f"Missing required env var {name}. Copy .env.example to .env and set it.")
    return value


def load_config(env: Mapping[str, str] | None = None) -> HarnessConfig:
    env = os.environ if env is None else env
    ptype = (env.get("LLM_PROVIDER_TYPE") or "").strip()
    if ptype not in PROVIDER_TYPES:
        raise ConfigError(
            f"LLM_PROVIDER_TYPE must be one of {', '.join(PROVIDER_TYPES)} (got {ptype or '<unset>'!r})."
        )

    if ptype == "ollama":
        # Ollama exposes an OpenAI-compatible API; no key needed.
        provider: dict[str, Any] = {
            "name": "byok",
            "type": "openai",
            "base_url": (env.get("LLM_BASE_URL") or "").strip() or OLLAMA_DEFAULT_URL,
        }
    else:
        provider = {"name": "byok", "type": ptype, "base_url": _required(env, "LLM_BASE_URL")}

    if env.get("LLM_BEARER_TOKEN"):
        provider["bearer_token"] = env["LLM_BEARER_TOKEN"]
    elif env.get("LLM_API_KEY"):
        provider["api_key"] = env["LLM_API_KEY"]

    if env.get("LLM_WIRE_API") in ("completions", "responses"):
        provider["wire_api"] = env["LLM_WIRE_API"]
    if ptype == "azure" and env.get("AZURE_OPENAI_API_VERSION"):
        provider["azure"] = {"api_version": env["AZURE_OPENAI_API_VERSION"]}

    cors = [o.strip() for o in (env.get("CORS_ORIGINS") or "").split(",") if o.strip()]

    return HarnessConfig(
        model=_required(env, "LLM_MODEL"),
        provider=provider,
        provider_label=ptype,
        host=env.get("HOST") or "127.0.0.1",
        port=int(env.get("PORT") or 8787),
        api_token=env.get("HARNESS_API_TOKEN") or None,
        max_sessions=int(env.get("MAX_SESSIONS") or 50),
        session_idle_minutes=int(env.get("SESSION_IDLE_MINUTES") or 30),
        cors_origins=cors,
        data_dir=Path(env.get("HARNESS_DATA_DIR") or ".optimus-data").resolve(),
        # Ollama's context is whatever the server was started with; assume the
        # 16k the README asks for unless told otherwise.
        context_tokens=_int(env, "LLM_CONTEXT_TOKENS", 16384 if ptype == "ollama" else None),
        max_output_tokens=_int(env, "LLM_MAX_OUTPUT_TOKENS", 4096),
        max_tool_calls=_int(env, "AGENT_MAX_TOOL_CALLS", 30),
        max_continues=_int(env, "AGENT_MAX_CONTINUES", 2),
        turn_timeout_seconds=_int(env, "AGENT_TURN_TIMEOUT_SECONDS", 900),
    )


def _int(env: Mapping[str, str], name: str, default: int | None) -> int | None:
    raw = (env.get(name) or "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        raise ConfigError(f"{name} must be an integer (got {raw!r}).") from None
