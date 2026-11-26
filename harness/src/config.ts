import type { ProviderConfig } from "@github/copilot-sdk";

/**
 * All runtime configuration comes from environment variables so the same build
 * runs locally, in a container, or behind an enterprise gateway.
 *
 * There is deliberately NO default model provider. BYOK means the operator
 * chooses where prompts go (OpenAI, Azure OpenAI, Anthropic, a local Ollama,
 * or an internal OpenAI-compatible gateway), so we fail fast instead of
 * silently sending data somewhere.
 */
export interface HarnessConfig {
  port: number;
  host: string;
  model: string;
  provider: ProviderConfig;
  /** What the operator configured, for display ("ollama" shows as ollama, not openai). */
  providerLabel: string;
  /** Optional shared secret for the HTTP API. Placeholder for real SSO/OIDC. */
  apiToken?: string;
  /** Max concurrent live sessions held in memory. */
  maxSessions: number;
  /** Idle sessions are disconnected after this many minutes. */
  sessionIdleMinutes: number;
}

/** "ollama" is a convenience alias for Ollama's OpenAI-compatible endpoint. */
const PROVIDER_TYPES = ["ollama", "openai", "azure", "anthropic", "google"] as const;
const OLLAMA_DEFAULT_URL = "http://localhost:11434/v1";
type ProviderType = (typeof PROVIDER_TYPES)[number];

function required(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name]?.trim();
  if (!v) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and set it.`,
    );
  }
  return v;
}

export function loadConfig(env = process.env): HarnessConfig {
  const type = (env.LLM_PROVIDER_TYPE ?? "").trim() as ProviderType;
  if (!PROVIDER_TYPES.includes(type)) {
    throw new Error(
      `LLM_PROVIDER_TYPE must be one of ${PROVIDER_TYPES.join(", ")} (got "${type || "<unset>"}").`,
    );
  }

  const provider: ProviderConfig =
    type === "ollama"
      ? { type: "openai", baseUrl: env.LLM_BASE_URL?.trim() || OLLAMA_DEFAULT_URL }
      : { type, baseUrl: required(env, "LLM_BASE_URL") };
  if (env.LLM_BEARER_TOKEN) provider.bearerToken = env.LLM_BEARER_TOKEN;
  else if (env.LLM_API_KEY) provider.apiKey = env.LLM_API_KEY;

  if (env.LLM_WIRE_API === "responses" || env.LLM_WIRE_API === "completions") {
    provider.wireApi = env.LLM_WIRE_API;
  }
  if (type === "azure" && env.AZURE_OPENAI_API_VERSION) {
    provider.azure = { apiVersion: env.AZURE_OPENAI_API_VERSION };
  }

  return {
    port: Number(env.PORT ?? 8787),
    host: env.HOST ?? "127.0.0.1",
    model: required(env, "LLM_MODEL"),
    provider,
    providerLabel: type,
    apiToken: env.HARNESS_API_TOKEN || undefined,
    maxSessions: Number(env.MAX_SESSIONS ?? 50),
    sessionIdleMinutes: Number(env.SESSION_IDLE_MINUTES ?? 30),
  };
}
