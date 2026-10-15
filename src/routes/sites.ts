import { Hono } from "hono";
import { cors } from "hono/cors";
import registry from "../data/sites.json";

export type Site = {
  id: string;
  label: string;
  host: string;
  url: string;
  kind: "hub" | "authority" | "service" | "operational" | "tool";
  status: "live" | "building" | "planned" | "optional";
  audience: string;
  job: string;
  cta: string | null;
  footer: boolean;
  footer_order: number | null;
};

const all = registry.sites as Site[];
const KINDS = new Set(["hub", "authority", "service", "operational", "tool"]);
const STATUSES = new Set(["live", "building", "planned", "optional"]);

// Public, read-only, generated from rjmlaird-docs/data/sites.yaml.
// Restricted hosts (dam, mcp) are stripped at build time and never appear here.
export const sites = new Hono();

sites.use("*", cors({ origin: "*", allowMethods: ["GET", "HEAD", "OPTIONS"] }));

function respond(c: any, body: unknown, key: string) {
  const etag = `W/"${registry.version}-${key}"`;
  c.header("ETag", etag);
  c.header("Cache-Control", "public, max-age=300, s-maxage=3600");
  if (c.req.header("If-None-Match") === etag) return c.body(null, 304);
  return c.json(body);
}

// GET /v1/sites?kind=authority&status=live&footer=true&host=space.rjmlaird.co.uk
sites.get("/", (c) => {
  const { kind, status, footer, host } = c.req.query();

  if (kind && !KINDS.has(kind)) return c.json({ error: `invalid kind: ${kind}` }, 400);
  if (status && !STATUSES.has(status)) return c.json({ error: `invalid status: ${status}` }, 400);

  let list = all;
  if (kind) list = list.filter((s) => s.kind === kind);
  if (host) list = list.filter((s) => s.host === host.toLowerCase());

  if (footer === "true") {
    // footer links must resolve, so default to live sites unless a status is given
    list = list
      .filter((s) => s.footer && (status ? s.status === status : s.status === "live"))
      .sort((a, b) => (a.footer_order ?? 0) - (b.footer_order ?? 0));
  } else if (status) {
    list = list.filter((s) => s.status === status);
  }

  const key = `${kind ?? ""}|${status ?? ""}|${footer ?? ""}|${host ?? ""}`;
  return respond(c, { version: registry.version, count: list.length, sites: list }, key);
});

// GET /v1/sites/:id
sites.get("/:id", (c) => {
  const site = all.find((s) => s.id === c.req.param("id"));
  if (!site) return c.json({ error: "site not found" }, 404);
  return respond(c, { version: registry.version, site }, `id:${site.id}`);
});
