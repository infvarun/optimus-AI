import { test } from "node:test";
import assert from "node:assert/strict";
import { cmdbLookup, incidentSearch, changeSearch, kbSearch } from "../src/tools/servicenow.js";
import { problems, serviceHealth, logSearch } from "../src/tools/dynatrace.js";
import { opsTools } from "../src/tools/index.js";

// Tool handlers are plain async functions; the stubs ignore the invocation arg.
const call = (t: any, args: any) => t.handler(args, {} as any);

test("all tools are registered with unique names", () => {
  const names = opsTools.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.length, 7);
});

test("cmdb lookup resolves aliases and returns team, leads and Dynatrace entity", async () => {
  const r = await call(cmdbLookup, { app: "csp" });
  assert.equal(r.name, "Clinical Supply Portal");
  assert.equal(r.kind, "custom");
  assert.ok(r.team.leads.length >= 1);
  assert.equal(r.dynatraceEntityId, "SERVICE-CSP0001");
  const all = await call(cmdbLookup, {});
  assert.deepEqual(new Set(all.applications.map((a: any) => a.kind)), new Set(["custom", "cots", "saas"]));
  assert.match((await call(cmdbLookup, { app: "nope" })).error, /No CMDB application/);
});

test("incident search filters active incidents for the app", async () => {
  const r = await call(incidentSearch, { app: "Clinical Supply Portal", activeOnly: true, limit: 10 });
  assert.deepEqual(r.incidents.map((i: any) => i.number), ["INC0104521"]);
  const past = await call(incidentSearch, { app: "csp", activeOnly: false, query: "pool", limit: 10 });
  assert.equal(past.incidents[0].number, "INC0103990");
});

test("change search finds the recent deploy and not far-future changes", async () => {
  const r = await call(changeSearch, { app: "csp", hoursBack: 24, hoursAhead: 72 });
  assert.deepEqual(r.changes.map((c: any) => c.number), ["CHG0045817"]);
  const lims = await call(changeSearch, { app: "lims", hoursBack: 1, hoursAhead: 1 });
  assert.equal(lims.changes.length, 0);
});

test("kb search ranks the pool article first", async () => {
  const r = await call(kbSearch, { query: "db connection pool exhausted 503", limit: 3 });
  assert.equal(r.results[0].number, "KB0011201");
});

test("dynatrace problems, health and logs resolve through the CMDB", async () => {
  const p = await call(problems, { app: "csp", status: "OPEN", hoursBack: 24 });
  assert.equal(p.totalCount, 2);
  const h = await call(serviceHealth, { app: "csp" });
  assert.ok(h.failureRatePct > h.baseline.failureRatePct);
  const l = await call(logSearch, { app: "csp", minLevel: "ERROR", minutesBack: 60, limit: 50 });
  assert.ok(l.records.every((x: any) => x.loglevel === "ERROR"));
  assert.match((await call(problems, { app: "nope", status: "OPEN", hoursBack: 1 })).error, /Unknown application/);
});
