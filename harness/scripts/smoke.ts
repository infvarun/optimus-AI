/**
 * Smoke test against a RUNNING harness (npm run dev). Creates a session, sends one
 * question, prints the stream, and exits non-zero if no tool was called or no answer came back.
 *
 *   npm run smoke                     # default question
 *   npm run smoke -- "is LabTrack ok?"
 */
const base = process.env.HARNESS_URL ?? `http://127.0.0.1:${process.env.PORT ?? 8787}`;
const headers: Record<string, string> = { "content-type": "application/json" };
if (process.env.HARNESS_API_TOKEN) headers.authorization = `Bearer ${process.env.HARNESS_API_TOKEN}`;
const prompt = process.argv[2] ?? "Users say the Clinical Supply Portal is throwing errors. What's going on and what should we do?";

const health = await fetch(`${base}/healthz`).then((r) => r.json());
console.log("harness:", health);

const { id } = await fetch(`${base}/api/sessions`, { method: "POST", headers }).then((r) => r.json());
console.log("session:", id, "\nprompt:", prompt, "\n");

const res = await fetch(`${base}/api/sessions/${id}/messages`, { method: "POST", headers, body: JSON.stringify({ prompt }) });
if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

let buf = "";
let tools = 0;
let answer = "";
let error = "";
const decoder = new TextDecoder();
for await (const chunk of res.body) {
  buf += decoder.decode(chunk, { stream: true });
  let i: number;
  while ((i = buf.indexOf("\n\n")) >= 0) {
    const frame = buf.slice(0, i);
    buf = buf.slice(i + 2);
    const line = frame.split("\n").find((l) => l.startsWith("data: "));
    if (!line) continue;
    const e = JSON.parse(line.slice(6));
    if (e.type === "delta") process.stdout.write(e.text);
    if (e.type === "tool_start") { tools++; console.log(`\n[tool] ${e.toolName} ${JSON.stringify(e.arguments)}`); }
    if (e.type === "tool_end") console.log(`[tool] ${e.success ? "ok" : "FAILED " + (e.error ?? "")}`);
    if (e.type === "message") answer = e.content;
    if (e.type === "error") { error = e.message; console.error(`\n[error] ${e.message}`); }
  }
}
await fetch(`${base}/api/sessions/${id}`, { method: "DELETE", headers });

console.log(`\n\n--- tools called: ${tools}, answer: ${answer ? "yes" : "no"}${error ? ", error: " + error : ""}`);
if (!answer || error) process.exit(1);
if (tools === 0) {
  console.warn("WARNING: the model answered without calling any tool. Small models often do this; try a larger tool-capable model.");
  process.exit(2);
}
