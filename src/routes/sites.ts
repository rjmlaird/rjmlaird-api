import { Hono } from "hono";
import { cors } from "hono/cors";
import { KINDS, registryVersion, sites as all, STATUSES } from "../lib/registry";
import { errorResponse, respond } from "../lib/http";

export type { Site } from "../lib/registry";

// Public, read-only, generated from rjmlaird-docs/data/sites.yaml.
// Restricted hosts (dam, mcp, hooks, auth, dav) are stripped at build time and never appear here.
export const sites = new Hono();

sites.use("*", cors({ origin: "*", allowMethods: ["GET", "HEAD", "OPTIONS"] }));

// GET /v1/sites?kind=authority&status=live&footer=true&host=space.rjmlaird.co.uk
sites.get("/", (c) => {
  const { kind, status, footer, host } = c.req.query();

  if (kind && !(KINDS as readonly string[]).includes(kind)) return errorResponse(c, 400, `invalid kind: ${kind}`, { allowed: KINDS });
  if (status && !(STATUSES as readonly string[]).includes(status)) return errorResponse(c, 400, `invalid status: ${status}`, { allowed: STATUSES });

  let list = all;
  if (kind) list = list.filter((s) => s.kind === kind);
  if (host) list = list.filter((s) => s.host === host.toLowerCase());

  if (footer === "true") {
    // Footer links must resolve, so default to live sites unless a status is given.
    list = list
      .filter((s) => s.footer && (status ? s.status === status : s.status === "live"))
      .sort((a, b) => (a.footer_order ?? 0) - (b.footer_order ?? 0));
  } else if (status) {
    list = list.filter((s) => s.status === status);
  }

  return respond(c, { version: registryVersion, count: list.length, sites: list });
});

// GET /v1/sites/:id
sites.get("/:id", (c) => {
  const site = all.find((s) => s.id === c.req.param("id"));
  if (!site) return errorResponse(c, 404, "site not found");
  return respond(c, { version: registryVersion, site });
});
