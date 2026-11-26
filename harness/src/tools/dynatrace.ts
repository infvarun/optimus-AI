import { z } from "zod";
import { defineTool } from "@github/copilot-sdk";
import { DT_LOGS, DT_METRICS, DT_PROBLEMS, findApp, knownApps } from "./fixtures.js";

/**
 * Dynatrace tools. ALL STUBS backed by fixtures.ts.
 *
 * To make them real, use the Dynatrace Environment API v2 with an API token
 * scoped read-only (problems.read, metrics.read, logs.read, entities.read):
 *   GET /api/v2/problems?entitySelector=entityId("<id>")&from=now-2h
 *   GET /api/v2/metrics/query?metricSelector=builtin:service.response.time:percentile(90),...
 *   GET /api/v2/logs/search?query=...&from=now-60m
 * Resolve the app to its entity id through the CMDB first (never let the
 * model pass arbitrary entity selectors straight through).
 */

const appParam = z.string().describe("Application name or alias, e.g. 'Clinical Supply Portal' or 'csp'");

function resolve(app: string) {
  const ci = findApp(app);
  if (!ci) return { error: `Unknown application '${app}'. Known: ${knownApps()}` } as const;
  if (!ci.dynatraceEntityId) return { error: `'${ci.name}' is not monitored in Dynatrace.` } as const;
  return { ci, entityId: ci.dynatraceEntityId } as const;
}

export const problems = defineTool("dynatrace_problems", {
  description:
    "List Dynatrace problems (Davis AI detected issues) affecting an application: title, severity, " +
    "status, start time and root-cause entity. Start here when someone reports an outage or slowness.",
  parameters: z.object({
    app: appParam,
    status: z.enum(["OPEN", "CLOSED", "ALL"]).default("OPEN"),
    hoursBack: z.number().int().min(1).max(24 * 7).default(24),
  }),
  skipPermission: true,
  handler: async ({ app, status, hoursBack }) => {
    const r = resolve(app);
    if ("error" in r) return { stub: true, error: r.error };
    const from = Date.now() - hoursBack * 3_600_000;
    const results = DT_PROBLEMS.filter(
      (pb) =>
        pb.affectedEntityIds.includes(r.entityId) &&
        (status === "ALL" || pb.status === status) &&
        Date.parse(pb.startTime) >= from,
    );
    return { stub: true, app: r.ci.name, entityId: r.entityId, totalCount: results.length, problems: results };
  },
});

export const serviceHealth = defineTool("dynatrace_service_health", {
  description:
    "Get current Dynatrace service metrics for an application (p90 response time, failure rate, " +
    "throughput) compared with the same hour last week, plus the last deployment event.",
  parameters: z.object({ app: appParam }),
  skipPermission: true,
  handler: async ({ app }) => {
    const r = resolve(app);
    if ("error" in r) return { stub: true, error: r.error };
    const m = DT_METRICS[r.entityId];
    if (!m) return { stub: true, error: `No metrics for ${r.entityId}` };
    return { stub: true, app: r.ci.name, measuredAt: new Date().toISOString(), ...m };
  },
});

export const logSearch = defineTool("dynatrace_log_search", {
  description:
    "Search Dynatrace logs for an application. Returns at most `limit` records, newest first. " +
    "Use to confirm an error signature or find when it started.",
  parameters: z.object({
    app: appParam,
    query: z.string().optional().describe("Case-insensitive text to match, e.g. an error code or trace id"),
    minLevel: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).default("INFO"),
    minutesBack: z.number().int().min(1).max(1440).default(60),
    limit: z.number().int().min(1).max(200).default(50),
  }),
  skipPermission: true,
  handler: async ({ app, query, minLevel, minutesBack, limit }) => {
    const r = resolve(app);
    if ("error" in r) return { stub: true, error: r.error };
    const order = ["DEBUG", "INFO", "WARN", "ERROR"];
    const cutoff = Date.now() - minutesBack * 60_000;
    const q = query?.toLowerCase();
    const records = DT_LOGS.filter(
      (l) =>
        l.entityId === r.entityId &&
        order.indexOf(l.loglevel) >= order.indexOf(minLevel) &&
        Date.parse(l.timestamp) >= cutoff &&
        (!q || l.content.toLowerCase().includes(q)),
    )
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
    return { stub: true, app: r.ci.name, count: records.length, records };
  },
});
