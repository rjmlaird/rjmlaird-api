import { Hono } from "hono";
import { json } from "./lib/jsonResponse";
import { get } from "./lib/data";

import { handleWebDAV } from "./routes/webdav";
import { handleResearch } from "./routes/research";

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "rjmlaird-api",
    timestamp: new Date().toISOString(),
  });
});

app.get("/openapi.json", (c) => {
  return c.json({
    openapi: "3.1.0",
    info: {
      title: "rjmlaird API",
      version: "1.0.0",
      description: "GitHub-powered CV + research + WebDAV API",
    },
    servers: [
      {
        url: "https://api.rjmlaird.co.uk",
      },
    ],
    tags: [
      {
        name: "System",
        description: "Health and API metadata",
      },
      {
        name: "Debug",
        description: "Debug endpoints",
      },
      {
        name: "CV",
        description: "Profile, organisations, projects, skills, and other CV collections",
      },
      {
        name: "Research",
        description: "Research API endpoints",
      },
      {
        name: "WebDAV",
        description: "WebDAV access",
      },
    ],
    paths: {
      "/health": {
        get: {
          tags: ["System"],
          summary: "Health check",
          responses: {
            "200": {
              description: "API is running",
            },
          },
        },
      },
      "/v1/debug": {
        get: {
          tags: ["Debug"],
          summary: "Debug status",
          responses: {
            "200": {
              description: "Debug information",
            },
          },
        },
      },
      "/v1/research": {
        get: {
          tags: ["Research"],
          summary: "Research API root",
          responses: {
            "200": {
              description: "Research service info",
            },
          },
        },
      },
      "/v1/research/search": {
        get: {
          tags: ["Research"],
          summary: "Search stored papers",
          parameters: [
            {
              name: "q",
              in: "query",
              required: true,
              schema: { type: "string" },
              description: "Search term.",
            },
          ],
          responses: {
            "200": { description: "Search results" },
            "400": { description: "Missing query" },
          },
        },
      },
      "/v1/research/papers": {
        get: {
          tags: ["Research"],
          summary: "List papers",
          responses: {
            "200": { description: "Paper list" },
          },
        },
      },
      "/v1/research/paper/{id}": {
        get: {
          tags: ["Research"],
          summary: "Get one paper",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "Paper identifier.",
            },
          ],
          responses: {
            "200": { description: "Paper record" },
            "404": { description: "Not found" },
          },
        },
      },
      "/v1/research/graph": {
        get: {
          tags: ["Research"],
          summary: "Paper graph",
          responses: {
            "200": { description: "Graph data" },
          },
        },
      },
      "/v1/research/timeline": {
        get: {
          tags: ["Research"],
          summary: "Paper timeline",
          responses: {
            "200": { description: "Timeline data" },
          },
        },
      },
      "/v1/research/entities": {
        get: {
          tags: ["Research"],
          summary: "Extract entities",
          responses: {
            "200": { description: "Entity data" },
          },
        },
      },
      "/v1/research/export/zotero": {
        get: {
          tags: ["Research"],
          summary: "Export to Zotero format",
          responses: {
            "200": { description: "Export payload" },
          },
        },
      },
      "/v1/research/ingest": {
        post: {
          tags: ["Research"],
          summary: "Ingest a record or sync Zotero page",
          responses: {
            "201": { description: "Ingested" },
            "500": { description: "Ingest failed" },
          },
        },
      },
      "/webdav/{path}": {
        get: {
          tags: ["WebDAV"],
          summary: "WebDAV endpoint",
          parameters: [
            {
              name: "path",
              in: "path",
              required: true,
              schema: { type: "string" },
              description: "WebDAV path.",
            },
          ],
          responses: {
            "200": { description: "WebDAV response" },
          },
        },
      },
      "/api/{collection}": {
        get: {
          tags: ["CV"],
          summary: "Fetch CV collection data",
          description:
            "Returns one of the CV collections such as organisations, profile, projects, skills, memberships, reviews, or experience.",
          parameters: [
            {
              name: "collection",
              in: "path",
              required: true,
              schema: {
                type: "string",
                enum: [
                  "organisations",
                  "profile",
                  "projects",
                  "skills",
                  "memberships",
                  "reviews",
                  "experience",
                  "education",
                ],
              },
              description: "The CV collection name.",
            },
          ],
          responses: {
            "200": { description: "Collection data" },
            "404": { description: "Collection not found" },
          },
        },
      },
    },
  });
});

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

app.all("/webdav/*", webdavHandler);
app.all("/v1/webdav/*", webdavHandler);

app.all("/v1/research/*", researchHandler);
app.all("/v1/research", researchHandler);

app.get("/v1/debug", (c) => {
  return c.json({
    status: "ok",
    webdav: true,
    research: true,
    r2Bound: Boolean(c.env.R2),
    timestamp: new Date().toISOString(),
  });
});

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
