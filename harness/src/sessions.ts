import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CopilotClient,
  type CopilotSession,
  type PermissionRequest,
  type PermissionRequestResult,
  type SessionEvent,
} from "@github/copilot-sdk";
import type { HarnessConfig } from "./config.js";
import { opsTools } from "./tools/index.js";

/** Events the harness streams to its own clients (a stable, small subset of SDK events). */
export type HarnessEvent =
  | { type: "turn_start" }
  | { type: "delta"; text: string }
  | { type: "message"; content: string }
  | { type: "tool_start"; toolCallId: string; toolName: string; arguments: unknown }
  | { type: "tool_end"; toolCallId: string; success: boolean; result?: string; error?: string }
  | { type: "usage"; data: unknown }
  | { type: "error"; message: string }
  | { type: "done" };

const OPS_INSTRUCTIONS = `
You are Optimus, an enterprise application support and operations assistant.
Applications are custom-built, SaaS or COTS. Each is owned by a support team with leads and members.
Observability is Dynatrace. ITSM (incidents, changes, requests, CMDB, knowledge) is ServiceNow.

How to work:
- Identify the application first with servicenow_cmdb_lookup (type, owning team, on-call, Dynatrace entity).
- Diagnose before you prescribe: check dynatrace_problems and dynatrace_service_health, then confirm with
  dynatrace_log_search. Check servicenow_change_search for a recent change and servicenow_incident_search for
  an existing or similar past incident.
- Before recommending remediation, use servicenow_kb_search and follow the approved article. Cite KB, CHG,
  INC and Dynatrace problem ids (P-...) you relied on.
- For SaaS and COTS apps, say when the fix is the vendor's and the step is to raise a vendor case.
- You only have read-only tools. Never claim to have restarted, rolled back, or changed anything.
  If a change is needed, say what a human should do, which change type it needs, and who approves
  (the owning team's lead).
- Be concise. Lead with the likely cause and your confidence, then evidence, then next steps and owner.
- If a tool result contains "stub": true, say the data is sample data.
`.trim();

interface Entry {
  session: CopilotSession;
  createdAt: number;
  lastUsed: number;
  busy: boolean;
}

export class SessionManager {
  private client: CopilotClient;
  private sessions = new Map<string, Entry>();
  private sweeper?: NodeJS.Timeout;
  private readonly workDir = mkdtempSync(join(tmpdir(), "ops-harness-"));

  constructor(private cfg: HarnessConfig) {
    // BYOK: no GitHub identity is used for model calls. Don't pick up a
    // developer's gh login or GITHUB_TOKEN by accident.
    this.client = new CopilotClient({ useLoggedInUser: false, logLevel: "warning" });
  }

  async start() {
    await this.client.start();
    this.sweeper = setInterval(() => void this.sweepIdle(), 60_000).unref();
  }

  async stop() {
    clearInterval(this.sweeper);
    await Promise.allSettled([...this.sessions.keys()].map((id) => this.delete(id)));
    await this.client.stop();
  }

  async create(): Promise<string> {
    if (this.sessions.size >= this.cfg.maxSessions) {
      throw new HttpError(429, "Too many active sessions");
    }
    const sessionId = randomUUID();
    const session = await this.client.createSession({
      sessionId,
      model: this.cfg.model,
      provider: this.cfg.provider,
      streaming: true,
      tools: opsTools,
      // Only our own tools: no built-in shell, file edit, web fetch, etc.
      availableTools: ["custom:*"],
      workingDirectory: this.workDir,
      enableSessionTelemetry: false,
      systemMessage: {
        mode: "customize",
        sections: { code_change_rules: { action: "remove" } },
        content: OPS_INSTRUCTIONS,
      },
      onPermissionRequest: permissionPolicy,
    });
    const now = Date.now();
    this.sessions.set(sessionId, { session, createdAt: now, lastUsed: now, busy: false });
    return sessionId;
  }

  list() {
    return [...this.sessions.entries()].map(([id, e]) => ({
      id,
      createdAt: new Date(e.createdAt).toISOString(),
      lastUsed: new Date(e.lastUsed).toISOString(),
      busy: e.busy,
    }));
  }

  /**
   * Send one user turn and stream harness events to `emit` until the agent is idle.
   * Resolves when the turn ends. One turn at a time per session.
   */
  async sendTurn(id: string, prompt: string, emit: (e: HarnessEvent) => void, signal?: AbortSignal) {
    const entry = this.get(id);
    if (entry.busy) throw new HttpError(409, "Session is already processing a message");
    entry.busy = true;
    entry.lastUsed = Date.now();

    const { session } = entry;
    let unsubscribe = () => {};
    try {
      await new Promise<void>((resolve, reject) => {
        unsubscribe = session.on((ev: SessionEvent) => {
          const mapped = mapEvent(ev);
          if (mapped) emit(mapped);
          if (ev.type === "session.idle") resolve();
          if (ev.type === "session.error") resolve(); // error already emitted
        });
        signal?.addEventListener("abort", () => void session.abort().catch(() => {}), { once: true });
        session.send({ prompt }).catch(reject);
      });
    } finally {
      unsubscribe();
      entry.busy = false;
      entry.lastUsed = Date.now();
    }
    emit({ type: "done" });
  }

  /** Throws 404/409 before the caller commits to a streaming response. */
  assertReady(id: string) {
    if (this.get(id).busy) throw new HttpError(409, "Session is already processing a message");
  }

  async abort(id: string) {
    await this.get(id).session.abort();
  }

  async delete(id: string) {
    const entry = this.sessions.get(id);
    if (!entry) return false;
    this.sessions.delete(id);
    await entry.session.disconnect().catch(() => {});
    return true;
  }

  private get(id: string): Entry {
    const e = this.sessions.get(id);
    if (!e) throw new HttpError(404, "Session not found");
    return e;
  }

  private async sweepIdle() {
    const cutoff = Date.now() - this.cfg.sessionIdleMinutes * 60_000;
    for (const [id, e] of this.sessions) {
      if (!e.busy && e.lastUsed < cutoff) await this.delete(id);
    }
  }
}

/**
 * Defense in depth. availableTools already hides built-ins, but if anything
 * other than our own registered tools asks for permission, refuse it.
 */
function permissionPolicy(req: PermissionRequest): PermissionRequestResult {
  if (req.kind === "custom-tool") return { kind: "approve-once" };
  return { kind: "reject", feedback: "This harness only allows its own read-only ops tools." };
}

const MAX_TOOL_RESULT_CHARS = 4000;

function mapEvent(ev: SessionEvent): HarnessEvent | undefined {
  switch (ev.type) {
    case "assistant.turn_start":
      return { type: "turn_start" };
    case "assistant.message_delta":
      return { type: "delta", text: ev.data.deltaContent };
    case "assistant.message":
      return ev.data.content ? { type: "message", content: ev.data.content } : undefined;
    case "tool.execution_start":
      return {
        type: "tool_start",
        toolCallId: ev.data.toolCallId,
        toolName: ev.data.toolName,
        arguments: ev.data.arguments,
      };
    case "tool.execution_complete":
      return {
        type: "tool_end",
        toolCallId: ev.data.toolCallId,
        success: ev.data.success,
        result: ev.data.result?.content?.slice(0, MAX_TOOL_RESULT_CHARS),
        error: ev.data.error?.message,
      };
    case "assistant.usage":
      return { type: "usage", data: ev.data };
    case "session.error":
      return { type: "error", message: ev.data.message };
    default:
      return undefined;
  }
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
