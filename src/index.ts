import { Hono } from "hono";
import { json } from "./lib/jsonResponse";
import { get } from "./lib/data";

import { handleWebDAV } from "./routes/webdav";
import { handleResearch } from "./routes/research";

const app = new Hono<{ Bindings: Env }>();

/**
 * =======================
 * HEALTH CHECK
 * =======================
 */
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "rjmlaird-api",
    timestamp: new Date().toISOString(),
  });
});

/**
 * =======================
 * ROOT API LANDING PAGE
 * =======================
 */
app.get("/", (c) => {
  return c.html(`<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>rjmlaird API</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 4px; }
  </style>
</head>
<body>
  <h1>rjmlaird API</h1>
  <p>Status: <strong>running</strong></p>
  <p>Endpoints:</p>
  <ul>
    <li><code>/health</code></li>
    <li><code>/webdav/*</code> (Zotero compatible)</li>
    <li><code>/v1/webdav/*</code> (legacy API path)</li>
    <li><code>/v1/research/*</code></li>
    <li><code>/v1/debug</code></li>
  </ul>
</body>
</html>`);
});

/**
 * =======================
 * WEBDAV (PRIMARY ZOTERO ENTRYPOINT)
 * =======================
 */
app.all("/webdav/*", async (c) => {
  try {
    return await handleWebDAV(c.req.raw, c.env);
  } catch (err) {
    console.error("WebDAV error (/webdav):", err);
    return c.text("WebDAV internal error", 500);
  }
});

/**
 * =======================
 * WEBDAV (LEGACY / INTERNAL API)
 * =======================
 */
app.all("/v1/webdav/*", async (c) => {
  try {
    return await handleWebDAV(c.req.raw, c.env);
  } catch (err) {
    console.error("WebDAV error (/v1/webdav):", err);
    return c.text("WebDAV internal error", 500);
  }
});

/**
 * =======================
 * RESEARCH API
 * =======================
 */
app.all("/v1/research/*", async (c) => {
  try {
    return await handleResearch(c.req.raw, c.env);
  } catch (err) {
    console.error("Research API error:", err);
    return c.text("Research internal error", 500);
  }
});

/**
 * =======================
 * DEBUG ENDPOINT
 * =======================
 */
app.get("/v1/debug", (c) => {
  return c.json({
    status: "ok",
    webdav: true,
    research: true,
    r2Bound: Boolean(c.env.R2),
    timestamp: new Date().toISOString(),
  });
});

/**
 * =======================
 * LEGACY CONTENT API
 * =======================
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