import { Hono } from "hono";
import { cors } from "hono/cors";

type Env = {
  // add bindings here as needed
};

const system = new Hono<{ Bindings: Env }>();

const OPENAPI_DESCRIPTION =
  "GitHub-powered CV + portfolio + contact + research + WebDAV API";

const cvCollections = [
  "awards",
  "certifications",
  "credly",
  "education",
  "experience",
  "languages",
  "memberships",
  "profile",
  "skills",
  "teaching",
  "tools",
  "volunteering",
] as const;

const portfolioCollections = [
  "projects",
  "writing",
  "talks",
  "labs",
  "tools",
] as const;

const contactSections = ["contact", "socials"] as const;
const activitySections = ["events", "eventsAttending", "talks"] as const;
const generalSections = ["organisations", "unCountries"] as const;

system.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Accept"],
  })
);

system.get("/", (c) =>
  c.json({
    name: "rjmlaird API",
    description: OPENAPI_DESCRIPTION,
    routes: [
      "GET /",
      "GET /health",
      "GET /openapi.json",
      "GET /api/{collection}",
      "GET /v1/research",
      "GET /v1/cv",
      "GET /v1/portfolio",
      "POST /v1/contact",
      "GET /v1/activities",
      "GET /v1/general",
      "POST /v1/ai",
      "POST /v1/webhooks/cal",
      "GET /v1/cdn/list",
      "GET /v1/cdn/file/{key}",
      "PUT /v1/cdn/file/{key}",
      "DELETE /v1/cdn/file/{key}",
      "OPTIONS /webdav",
      "GET /webdav",
      "PUT /webdav",
      "DELETE /webdav",
    ],
  })
);

system.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "rjmlaird-api",
    timestamp: new Date().toISOString(),
  })
);

system.get("/openapi.json", (c) =>
  c.json({
    openapi: "3.1.0",
    info: {
      title: "rjmlaird API",
      version: "1.0.0",
      description: OPENAPI_DESCRIPTION,
    },
    servers: [{ url: "https://api.rjmlaird.co.uk" }],
    tags: [
      { name: "System", description: "Health and API metadata" },
      { name: "Debug", description: "Debug endpoints" },
      { name: "CV", description: "Profile, experience, skills, and other CV collections" },
      { name: "Portfolio", description: "Portfolio collections" },
      { name: "Contact", description: "Contact details and social profiles" },
      { name: "Activities", description: "Events, event attendance, and talks" },
      { name: "General", description: "Organisations and UN countries" },
      { name: "Research", description: "Research API endpoints" },
      { name: "WebDAV", description: "WebDAV access" },
      { name: "AI", description: "Grounded AI assistant" },
      { name: "Webhooks", description: "Inbound webhooks (Cal.com -> HubSpot sync)" },
      { name: "CDN", description: "Object storage: upload, download, list, delete" },
    ],
    paths: {
      "/": {
        get: {
          tags: ["System"],
          summary: "API landing page",
          responses: { "200": { description: "Landing page" } },
        },
      },
      "/health": {
        get: {
          tags: ["System"],
          summary: "Health check",
          responses: { "200": { description: "Service is healthy" } },
        },
      },
      "/openapi.json": {
        get: {
          tags: ["System"],
          summary: "OpenAPI document",
          responses: { "200": { description: "OpenAPI JSON" } },
        },
      },
      "/api/{collection}": {
        get: {
          tags: ["CV"],
          summary: "Get CV collection",
          parameters: [
            {
              name: "collection",
              in: "path",
              required: true,
              schema: { type: "string", enum: cvCollections },
            },
          ],
          responses: { "200": { description: "Collection data" } },
        },
      },
      "/v1/research": {
        get: {
          tags: ["Research"],
          summary: "Research API",
          responses: { "200": { description: "OK" } },
        },
      },
      "/v1/cv": {
        get: {
          tags: ["CV"],
          summary: "CV API",
          responses: { "200": { description: "OK" } },
        },
      },
      "/v1/portfolio": {
        get: {
          tags: ["Portfolio"],
          summary: "Portfolio API",
          responses: { "200": { description: "OK" } },
        },
      },
      "/v1/contact": {
        post: {
          tags: ["Contact"],
          summary: "Contact API",
          responses: { "200": { description: "Accepted" } },
        },
      },
      "/v1/activities": {
        get: {
          tags: ["Activities"],
          summary: "Activities API",
          responses: { "200": { description: "OK" } },
        },
      },
      "/v1/general": {
        get: {
          tags: ["General"],
          summary: "General API",
          responses: { "200": { description: "OK" } },
        },
      },
      "/v1/ai": {
        post: {
          tags: ["AI"],
          summary: "AI endpoint",
          responses: { "200": { description: "OK" } },
        },
      },
      "/webdav": {
        options: {
          tags: ["WebDAV"],
          summary: "WebDAV options",
          responses: { "204": { description: "No Content" } },
        },
        get: {
          tags: ["WebDAV"],
          summary: "WebDAV get",
          responses: { "200": { description: "OK" } },
        },
        put: {
          tags: ["WebDAV"],
          summary: "WebDAV put",
          responses: { "204": { description: "Updated" } },
        },
        delete: {
          tags: ["WebDAV"],
          summary: "WebDAV delete",
          responses: { "204": { description: "Deleted" } },
        },
      },
    },
  })
);

system.get("/api/:collection", (c) => {
  const collection = c.req.param("collection");
  if (!cvCollections.includes(collection as (typeof cvCollections)[number])) {
    return c.json({ error: "Unknown collection" }, 404);
  }
  return c.json({ collection, items: [] });
});

system.get("/v1/research", (c) =>
  c.json({ status: "ok", endpoint: "research" })
);

system.get("/v1/cv", (c) =>
  c.json({ status: "ok", endpoint: "cv" })
);

system.get("/v1/portfolio", (c) =>
  c.json({ status: "ok", endpoint: "portfolio", collections: portfolioCollections })
);

system.post("/v1/contact", async (c) => {
  const body = await c.req.json().catch(() => null);
  return c.json({ status: "accepted", body }, 202);
});

system.get("/v1/activities", (c) =>
  c.json({ status: "ok", endpoint: "activities", sections: activitySections })
);

system.get("/v1/general", (c) =>
  c.json({ status: "ok", endpoint: "general", sections: generalSections })
);

system.post("/v1/ai", async (c) => {
  const body = await c.req.json().catch(() => null);
  return c.json(
    {
      status: "ok",
      endpoint: "ai",
      received: body,
      message: "Grounded AI endpoint placeholder",
    },
    200
  );
});

system.options("/webdav", (c) =>
  c.newResponse(null, 204, {
    Allow: "OPTIONS, GET, PUT, DELETE",
    "DAV": "1,2",
  })
);

system.get("/webdav", (c) =>
  c.json({
    status: "ok",
    method: "GET",
    endpoint: "webdav",
  })
);

system.put("/webdav", async (c) =>
  c.json({
    status: "ok",
    method: "PUT",
    endpoint: "webdav",
    body: await c.req.text(),
  })
);

system.delete("/webdav", (c) =>
  c.json({
    status: "ok",
    method: "DELETE",
    endpoint: "webdav",
  })
);

export default system;
