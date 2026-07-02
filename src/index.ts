import { Hono } from "hono";
import { json } from "./lib/jsonResponse";
import { get } from "./lib/data";

import { handleWebDAV } from "./routes/webdav";
import { handleResearch } from "./routes/research";

const app = new Hono<{ Bindings: Env }>();

/**
 * -----------------------
 * HEALTH CHECK
 * -----------------------
 */
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "rjmlaird-api",
    timestamp: new Date().toISOString(),
  });
});

/**
 * -----------------------
 * ROOT UI (API INDEX)
 * -----------------------
 */
app.get("/", (c) => {
  return c.html(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>rjmlaird API</title>
</head>
<body>
  <h1>rjmlaird API</h1>
  <p>API running</p>
</body>
</html>`);
});

/**
 * -----------------------
 * WEBDAV ROOT FIX (IMPORTANT)
 * -----------------------
 * Fixes:
 * https://api.rjmlaird.co.uk/v1/webdav → 404
 */
app.all("/v1/webdav", (c) => {
  return c.text("WebDAV endpoint active");
});

app.all("/v1/webdav/", (c) => {
  return c.text("WebDAV endpoint active");
});

/**
 * -----------------------
 * WEBDAV HANDLER
 * -----------------------
 * Zotero → WebDAV → R2
 */
app.all("/v1/webdav/*", async (c) => {
  try {
    return await handleWebDAV(c.req.raw, c.env);
  } catch (err) {
    console.error("WebDAV error:", err);
    return c.text("WebDAV internal error", 500);
  }
});

/**
 * -----------------------
 * RESEARCH API
 * -----------------------
 */
app.all("/v1/research/*", async (c) => {
  return handleResearch(c.req.raw, c.env);
});

/**
 * -----------------------
 * DEBUG ENDPOINT (VERY USEFUL)
 * -----------------------
 */
app.get("/v1/debug", (c) => {
  return c.json({
    webdav: "/v1/webdav/",
    research: "/v1/research/",
    r2Bound: !!c.env.R2,
    time: new Date().toISOString(),
  });
});

/**
 * -----------------------
 * LEGACY CV API
 * -----------------------
 */
app.get("/api/:collection", async (c) => {
  const collection = c.req.param("collection");

  try {
    const data = await get(`${collection}.json`);
    return json(data);
  } catch {
    return json(
      {
        error: "Collection not found",
        collection,
      },
      404
    );
  }
});

export default app;