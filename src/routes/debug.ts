import { Hono } from "hono";

const debug = new Hono<{ Bindings: Env }>();

debug.get("/v1/debug", (c) =>
  c.json({
    status: "ok",
    webdav: true,
    research: true,
    cv: true,
    portfolio: true,
    contact: true,
    activities: true,
    general: true,
    ai: true,
    webhooks: true,
    cdn: true,
    timestamp: new Date().toISOString(),
  })
);

export default debug;
