import { test, after } from "node:test";
import assert from "node:assert/strict";

// End-to-end: real Copilot SDK runtime, BYOK pointed at the scripted mock LLM.
process.env.MOCK_PORT = "11499";
await import("../scripts/mock-openai.js");
const { loadConfig } = await import("../src/config.js");
const { SessionManager } = await import("../src/sessions.js");

const sm = new SessionManager(
  loadConfig({
    LLM_PROVIDER_TYPE: "openai",
    LLM_BASE_URL: "http://127.0.0.1:11499/v1",
    LLM_MODEL: "mock-1",
  } as NodeJS.ProcessEnv),
);
await sm.start();
after(async () => {
  await sm.stop();
  process.exit(0); // mock server keeps the loop alive
});

test("a turn calls a Dynatrace tool and streams a final message", { timeout: 90_000 }, async () => {
  const id = await sm.create();
  const events: any[] = [];
  await sm.sendTurn(id, "Checkout is throwing 503s", (e) => events.push(e));

  const types = events.map((e) => e.type);
  assert.ok(types.includes("tool_start"), "expected a tool call");
  assert.equal(events.find((e) => e.type === "tool_start").toolName, "dynatrace_problems");
  assert.equal(events.find((e) => e.type === "tool_end").success, true);
  assert.ok(types.filter((t) => t === "delta").length > 3, "expected streamed deltas");
  assert.match(events.find((e) => e.type === "message").content, /KB0011201/);
  assert.equal(types.at(-1), "done");
});

test("config refuses to start without a provider", () => {
  assert.throws(() => loadConfig({} as NodeJS.ProcessEnv), /LLM_PROVIDER_TYPE/);
});

test("ollama alias maps to the OpenAI-compatible endpoint on localhost", () => {
  const c = loadConfig({ LLM_PROVIDER_TYPE: "ollama", LLM_MODEL: "qwen3:8b" } as NodeJS.ProcessEnv);
  assert.equal(c.provider.type, "openai");
  assert.equal(c.provider.baseUrl, "http://localhost:11434/v1");
  assert.equal(c.provider.apiKey, undefined);
});
