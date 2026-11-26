/**
 * A tiny fake OpenAI-compatible /v1/chat/completions server for local testing
 * without a real API key. It is scripted, not intelligent:
 *   1st call in a conversation -> asks to call dynatrace_problems(app="csp")
 *   after a tool result         -> streams a short canned diagnosis
 *
 * Run: npm run mock-llm   then set LLM_PROVIDER_TYPE=openai LLM_BASE_URL=http://127.0.0.1:11435/v1 LLM_MODEL=mock-1
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_PORT ?? 11435);
const VERBOSE = process.env.MOCK_VERBOSE === "1";

createServer(async (req, res) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (VERBOSE) console.log(req.method, req.url, body.slice(0, 2000));

  if (req.url?.endsWith("/models")) {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ object: "list", data: [{ id: "mock-1", object: "model" }] }));
  }
  if (!req.url?.endsWith("/chat/completions")) {
    res.writeHead(404).end();
    return;
  }

  const json = JSON.parse(body || "{}");
  const messages: { role: string }[] = json.messages ?? [];
  const sawToolResult = messages.some((m) => m.role === "tool");
  const id = "chatcmpl-mock";
  const base = { id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: json.model };

  const chunks: unknown[] = [];
  if (!sawToolResult) {
    chunks.push({
      ...base,
      choices: [{ index: 0, delta: { role: "assistant", content: null, tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "dynatrace_problems", arguments: "" } }] }, finish_reason: null }],
    });
    chunks.push({
      ...base,
      choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: JSON.stringify({ app: "csp" }) } }] }, finish_reason: null }],
    });
    chunks.push({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
  } else {
    const text = "Clinical Supply Portal has an open Dynatrace problem P-2511734 (sample data): failure rate up, root cause csp-orders-db. Likely DB pool exhaustion after release 2.14.0 (CHG0045817). See KB0011201.";
    chunks.push({ ...base, choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] });
    for (const word of text.split(/(?<= )/)) {
      chunks.push({ ...base, choices: [{ index: 0, delta: { content: word }, finish_reason: null }] });
    }
    chunks.push({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
  }
  chunks.push({ ...base, choices: [], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } });

  if (json.stream === false) {
    // Non-streaming fallback: collapse into one response.
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ error: "mock only supports stream=true" }));
  }

  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const c of chunks) {
    res.write(`data: ${JSON.stringify(c)}\n\n`);
    await new Promise((r) => setTimeout(r, 15));
  }
  res.end("data: [DONE]\n\n");
}).listen(PORT, "127.0.0.1", () => console.log(`mock OpenAI listening on http://127.0.0.1:${PORT}/v1`));
