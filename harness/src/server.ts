import express, { type NextFunction, type Request, type Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { HttpError, SessionManager, type HarnessEvent } from "./sessions.js";

// Load .env if present (Node >= 20.12). Real deployments should inject env vars
// from a secret store (Key Vault, Vault, AWS Secrets Manager) instead.
try {
  process.loadEnvFile(".env");
} catch {
  /* no .env file */
}
const cfg = loadConfig();
const sessions = new SessionManager(cfg);
await sessions.start();

const app = express();
app.use(express.json({ limit: "64kb" }));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, model: cfg.model, provider: cfg.providerLabel, baseUrl: cfg.provider.baseUrl });
});

// --- Auth (placeholder) -----------------------------------------------------
// A shared bearer token is NOT enterprise auth. Swap for OIDC/SSO (Entra ID,
// Okta) at a gateway or here before exposing beyond localhost.
app.use("/api", (req, res, next) => {
  if (!cfg.apiToken) return next();
  const got = Buffer.from(req.header("authorization")?.replace(/^Bearer /, "") ?? "");
  const want = Buffer.from(cfg.apiToken);
  if (got.length === want.length && timingSafeEqual(got, want)) return next();
  res.status(401).json({ error: "Unauthorized" });
});

// --- Sessions ---------------------------------------------------------------
app.post("/api/sessions", async (_req, res) => {
  const id = await sessions.create();
  res.status(201).json({ id });
});

app.get("/api/sessions", (_req, res) => {
  res.json({ sessions: sessions.list() });
});

app.delete("/api/sessions/:id", async (req, res) => {
  const ok = await sessions.delete(req.params.id);
  res.status(ok ? 204 : 404).end();
});

app.post("/api/sessions/:id/abort", async (req, res) => {
  await sessions.abort(req.params.id);
  res.status(202).json({ aborted: true });
});

/**
 * Send a message and stream the response as Server-Sent Events.
 * Each SSE `data:` line is a JSON HarnessEvent; the stream ends after {"type":"done"}.
 */
const MessageBody = z.object({ prompt: z.string().min(1).max(16_000) });

app.post("/api/sessions/:id/messages", async (req, res) => {
  const { prompt } = MessageBody.parse(req.body);
  sessions.assertReady(req.params.id); // 404 / 409 as JSON, before SSE headers

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  const write = (e: HarnessEvent) => res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000);

  // If the client goes away mid-turn, stop the agent so we don't burn tokens.
  const ac = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) ac.abort();
  });

  try {
    await sessions.sendTurn(req.params.id, prompt, write, ac.signal);
  } catch (err) {
    write({ type: "error", message: errorMessage(err) });
    write({ type: "done" });
  } finally {
    clearInterval(heartbeat);
    res.end();
  }
});

// --- Errors -----------------------------------------------------------------
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError) return res.status(400).json({ error: err.issues });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: "Internal error" });
});

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

const server = app.listen(cfg.port, cfg.host, () => {
  console.log(
    `ops harness listening on http://${cfg.host}:${cfg.port} (provider=${cfg.providerLabel} at ${cfg.provider.baseUrl}, model=${cfg.model})`,
  );
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    server.close();
    await sessions.stop();
    process.exit(0);
  });
}
