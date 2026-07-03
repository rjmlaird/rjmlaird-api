import { Hono } from "hono";
import { json } from "./lib/jsonResponse";
import { get } from "./lib/data";

import { handleWebDAV } from "./routes/webdav";
import { handleResearch } from "./routes/research";

const app = new Hono<{ Bindings: Env }>();

/**
 * ======================================================
 * HEALTH CHECK
 * ======================================================
 */
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "rjmlaird-api",
    timestamp: new Date().toISOString(),
  });
});

/**
 * ======================================================
 * WEB HANDLERS
 * ======================================================
 */
const webdavHandler = async (c: any) => {
  try {
    return await handleWebDAV(c.req.raw, c.env);
  } catch (err) {
    console.error("WebDAV error:", err);
    return c.text("WebDAV internal error", 500);
  }
};

const researchHandler = async (c: any) => {
  try {
    return await handleResearch(c.req.raw, c.env);
  } catch (err) {
    console.error("Research API error:", err);
    return c.json(
      {
        error: "Research internal error",
        message: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
};

/**
 * ======================================================
 * WEBDAV ROUTES
 * ======================================================
 */
app.all("/webdav/*", webdavHandler);
app.all("/v1/webdav/*", webdavHandler);

/**
 * ======================================================
 * RESEARCH ROUTES
 * ======================================================
 * IMPORTANT: single source of truth routing
 */
app.all("/v1/research/*", researchHandler);
app.all("/v1/research", researchHandler);

/**
 * ======================================================
 * DEBUG
 * ======================================================
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
 * ======================================================
 * LEGACY API
 * ======================================================
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