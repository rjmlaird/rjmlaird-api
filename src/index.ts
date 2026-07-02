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
  return c.html(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>rjmlaird API</title>
  <style>
    body {
      margin: 0;
      font-family: system-ui, sans-serif;
      background: #0b0f17;
      color: #e5e7eb;
    }

    .wrap {
      max-width: 960px;
      margin: auto;
      padding: 48px 20px;
    }

    h1 { margin-bottom: 6px; }
    p { color: #9ca3af; margin-top: 0; }

    .card {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 12px;
      padding: 16px;
      margin-top: 16px;
    }

    .endpoint {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-family: monospace;
      border-bottom: 1px solid #1f2937;
    }

    .endpoint:last-child {
      border-bottom: none;
    }

    .method {
      color: #38bdf8;
      font-weight: bold;
      margin-right: 8px;
    }

    a {
      color: #38bdf8;
      text-decoration: none;
    }
  </style>
</head>

<body>
  <div class="wrap">
    <h1>rjmlaird API</h1>
    <p>GitHub-powered CV + research + storage API (Cloudflare Workers)</p>

    <div class="card">
      <strong>Core Collections</strong>

      <div class="endpoint"><span><span class="method">GET</span>/api/profile</span></div>
      <div class="endpoint"><span><span class="method">GET</span>/api/experience</span></div>
      <div class="endpoint"><span><span class="method">GET</span>/api/projects</span></div>
      <div class="endpoint"><span><span class="method">GET</span>/api/memberships</span></div>
      <div class="endpoint"><span><span class="method">GET</span>/api/reviews</span></div>
      <div class="endpoint"><span><span class="method">GET</span>/api/skills</span></div>
    </div>

    <div class="card">
      <strong>Dynamic API</strong>

      <div class="endpoint">
        <span><span class="method">GET</span>/api/:collection</span>
      </div>

      <p style="margin-top:10px; color:#9ca3af;">
        Example: <code>/api/projects</code>, <code>/api/experience</code>
      </p>
    </div>

    <div class="card">
      <strong>Research System (NEW)</strong>

      <div class="endpoint"><span><span class="method">GET</span>/v1/research/papers</span></div>
      <div class="endpoint"><span><span class="method">POST</span>/v1/research/ingest</span></div>
    </div>

    <div class="card">
      <strong>Storage Layer (NEW)</strong>

      <div class="endpoint"><span><span class="method">GET</span>/v1/webdav/*</span></div>
      <div class="endpoint"><span><span class="method">PUT</span>/v1/webdav/*</span></div>
      <div class="endpoint"><span><span class="method">DELETE</span>/v1/webdav/*</span></div>
    </div>

    <div class="card">
      <strong>System</strong>

      <div class="endpoint"><span><span class="method">GET</span>/health</span></div>
      <div class="endpoint"><span><span class="method">GET</span>/openapi.json</span></div>
    </div>

  </div>
</body>
</html>
  `);
});

/**
 * -----------------------
 * WEBDAV (ZOTERO STORAGE LAYER)
 * -----------------------
 * Zotero → WebDAV → R2
 */
app.all("/v1/webdav/*", async (c) => {
  return handleWebDAV(c.req.raw, c.env);
});

/**
 * -----------------------
 * RESEARCH API (INTELLIGENCE LAYER)
 * -----------------------
 */
app.all("/v1/research/*", async (c) => {
  return handleResearch(c.req.raw, c.env);
});

/**
 * -----------------------
 * DYNAMIC COLLECTION API (LEGACY CV SYSTEM)
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

/**
 * -----------------------
 * EXPORT
 * -----------------------
 */
export default app;