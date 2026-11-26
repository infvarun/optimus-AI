import { z } from "zod";
import { defineTool } from "@github/copilot-sdk";
import { APPS, CHANGES, INCIDENTS, KB_ARTICLES, findApp, knownApps } from "./fixtures.js";

/**
 * ServiceNow tools. ALL STUBS backed by fixtures.ts.
 *
 * To make them real: call the ServiceNow Table API
 *   GET /api/now/table/cmdb_ci_appl, /incident, /change_request, /kb_knowledge
 * with an OAuth client-credentials token for a read-only integration user,
 * and map fields. Keep every tool read-only; creating or updating records
 * should go through a human-approved action, not these tools.
 */

const appParam = z
  .string()
  .describe("Application name or alias as the user said it, e.g. 'Clinical Supply Portal' or 'csp'");

export const cmdbLookup = defineTool("servicenow_cmdb_lookup", {
  description:
    "Look up an application in the ServiceNow CMDB: its type (custom, SaaS or COTS), vendor, business " +
    "criticality, owning support team (assignment group, leads, members, current on-call), its Dynatrace " +
    "entity id, and what it depends on. Call this first to identify the app before using other tools. " +
    "Call with no app to list all applications.",
  parameters: z.object({ app: appParam.optional() }),
  skipPermission: true,
  handler: async ({ app }) => {
    if (!app) {
      return { stub: true, applications: APPS.map((a) => ({ name: a.name, kind: a.kind, team: a.team.name })) };
    }
    const ci = findApp(app);
    if (!ci) return { stub: true, error: `No CMDB application matches '${app}'. Known: ${knownApps()}` };
    return { stub: true, ...ci };
  },
});

export const incidentSearch = defineTool("servicenow_incident_search", {
  description:
    "Search ServiceNow incidents for an application. Use to see whether an issue is already reported, " +
    "who is working it, and how similar past incidents were resolved (close notes).",
  parameters: z.object({
    app: appParam,
    activeOnly: z.boolean().default(false).describe("Only New / In Progress / On Hold"),
    query: z.string().optional().describe("Text to match in the short description or close notes"),
    limit: z.number().int().min(1).max(25).default(10),
  }),
  skipPermission: true,
  handler: async ({ app, activeOnly, query, limit }) => {
    const ci = findApp(app);
    if (!ci) return { stub: true, error: `Unknown application '${app}'. Known: ${knownApps()}` };
    const q = query?.toLowerCase();
    const active = new Set(["New", "In Progress", "On Hold"]);
    const results = INCIDENTS.filter(
      (i) =>
        i.cmdbCi === ci.name &&
        (!activeOnly || active.has(i.state)) &&
        (!q || `${i.shortDescription} ${i.closeNotes ?? ""}`.toLowerCase().includes(q)),
    )
      .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
      .slice(0, limit);
    return { stub: true, app: ci.name, count: results.length, incidents: results };
  },
});

export const changeSearch = defineTool("servicenow_change_search", {
  description:
    "Search ServiceNow change requests for an application in a time window around now. Use to check " +
    "whether a recent or in-flight change (deploy, patch, config) could explain an issue, and to read " +
    "its backout plan. Also shows upcoming scheduled changes.",
  parameters: z.object({
    app: appParam,
    hoursBack: z.number().int().min(1).max(24 * 30).default(24),
    hoursAhead: z.number().int().min(0).max(24 * 30).default(72),
  }),
  skipPermission: true,
  handler: async ({ app, hoursBack, hoursAhead }) => {
    const ci = findApp(app);
    if (!ci) return { stub: true, error: `Unknown application '${app}'. Known: ${knownApps()}` };
    const from = Date.now() - hoursBack * 3_600_000;
    const to = Date.now() + hoursAhead * 3_600_000;
    const results = CHANGES.filter(
      (c) => c.cmdbCi === ci.name && Date.parse(c.plannedEnd) >= from && Date.parse(c.plannedStart) <= to,
    );
    return { stub: true, app: ci.name, now: new Date().toISOString(), changes: results };
  },
});

export const kbSearch = defineTool("servicenow_kb_search", {
  description:
    "Search ServiceNow knowledge articles (runbooks / SOPs). Use before recommending any remediation so " +
    "advice follows the approved procedure, and cite the KB number.",
  parameters: z.object({
    query: z.string().describe("Symptom, error or task, e.g. 'db connection pool exhausted'"),
    app: appParam.optional(),
    limit: z.number().int().min(1).max(10).default(3),
  }),
  skipPermission: true,
  handler: async ({ query, app, limit }) => {
    const ci = app ? findApp(app) : undefined;
    const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
    const results = KB_ARTICLES.filter((k) => !ci || k.appliesTo.includes(ci.name))
      .map((k) => {
        const hay = `${k.title} ${k.keywords.join(" ")} ${k.summary}`.toLowerCase();
        return { k, score: terms.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0) };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ k, score }) => ({ ...k, score }));
    return { stub: true, query, results };
  },
});
