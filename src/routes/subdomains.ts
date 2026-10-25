// The estate entry point: every public rjmlaird.co.uk subdomain, with the API surface that belongs to it.
// /v1/sites is the plain registry projection; /v1/subdomains adds grouping and per-host entry points.
import { Hono } from "hono";
import { APEX, findSite, KINDS, registryVersion, SITE_API, sites, STATUSES, type Site } from "../lib/registry";
import { errorResponse, link, respond } from "../lib/http";

const app = new Hono();

const entry = (c: Parameters<typeof link>[0], s: Site) => {
  const api = SITE_API[s.id] ?? null;
  return {
    ...s,
    entrypoints: {
      web: s.url,
      api: api ? link(c, api) : null,
      self: link(c, `/v1/subdomains/${s.id}`),
    },
  };
};

// GET /v1/subdomains?status=&kind=&live=true
app.get("/", (c) => {
  const { status, kind, live } = c.req.query();
  if (status && !(STATUSES as readonly string[]).includes(status)) {
    return errorResponse(c, 400, "Unknown status", { status, allowed: STATUSES });
  }
  if (kind && !(KINDS as readonly string[]).includes(kind)) {
    return errorResponse(c, 400, "Unknown kind", { kind, allowed: KINDS });
  }
  if (live && !["true", "false"].includes(live)) return errorResponse(c, 400, "live must be true or false");

  let list = sites;
  if (status) list = list.filter((s) => s.status === status);
  if (kind) list = list.filter((s) => s.kind === kind);
  if (live === "true") list = list.filter((s) => s.status === "live");
  if (live === "false") list = list.filter((s) => s.status !== "live");

  const group = <K extends string>(keys: readonly K[], pick: (s: Site) => K) =>
    Object.fromEntries(keys.map((k) => [k, list.filter((s) => pick(s) === k).map((s) => s.id)]));

  return respond(c, {
    data: {
      apex: { host: APEX, url: `https://${APEX}/`, entrypoints: { api: link(c, "/v1/bio") } },
      count: list.length,
      subdomains: list.map((s) => entry(c, s)),
      byStatus: group(STATUSES, (s) => s.status),
      byKind: group(KINDS, (s) => s.kind),
    },
    meta: { version: registryVersion, total: sites.length, count: list.length, visibility: "public" },
    links: {
      self: link(c, "/v1/subdomains"),
      registry: link(c, "/v1/sites"),
      status: link(c, "/v1/status?probe=true"),
      openapi: link(c, "/openapi.json"),
    },
  });
});

// GET /v1/subdomains/{id | host}: e.g. glossary, glossary.rjmlaird.co.uk
app.get("/:key", (c) => {
  const key = c.req.param("key");
  const site = findSite(key);
  if (!site) {
    return errorResponse(c, 404, "Subdomain not found", { key, allowed: sites.map((s) => s.id) });
  }
  return respond(c, {
    data: entry(c, site),
    meta: { version: registryVersion },
    links: { self: link(c, `/v1/subdomains/${site.id}`), list: link(c, "/v1/subdomains") },
  });
});

export default app;
