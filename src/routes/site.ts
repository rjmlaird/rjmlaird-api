import { Hono } from "hono";

export const site = new Hono();

const cvCollections = [
  "awards", "certifications", "credly", "education", "experience",
  "languages", "memberships", "profile", "skills", "teaching",
  "tools", "volunteering",
] as const;

const openapiSpec = {
  openapi: "3.0.0",
  info: {
    title: "rjmlaird API",
    version: "1.0.0",
    description: "GitHub-powered CV + portfolio + contact + research + WebDAV API.",
  },
  servers: [{ url: "/" }],
  paths: {
    "/health": { get: { summary: "Health check", responses: { "200": { description: "Healthy" } } } },
    "/openapi.json": { get: { summary: "OpenAPI document", responses: { "200": { description: "OpenAPI JSON document" } } } },
    "/api/{collection}": {
      get: {
        summary: "Get CV collection",
        parameters: [{ name: "collection", in: "path", required: true, schema: { type: "string", enum: cvCollections } }],
        responses: { "200": { description: "Collection data" }, "404": { description: "Collection not found" } },
      },
    },
    "/v1/research": { get: { summary: "Research API", responses: { "200": { description: "OK" } } } },
    "/v1/cv": { get: { summary: "CV API", responses: { "200": { description: "OK" } } } },
    "/v1/portfolio": { get: { summary: "Portfolio API", responses: { "200": { description: "OK" } } } },
    "/v1/portfolio/projects": {
      get: {
        summary: "List projects",
        parameters: [
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "tag", in: "query", schema: { type: "string" } },
          { name: "featured", in: "query", schema: { type: "boolean" } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/portfolio/project/{slug}": {
      get: {
        summary: "Get a single project by slug",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
          { name: "expand", in: "query", schema: { type: "string" }, description: "Comma-separated: caseStudy" },
        ],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/v1/portfolio/initiatives": {
      get: {
        summary: "List initiatives",
        parameters: [
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "tag", in: "query", schema: { type: "string" } },
          { name: "featured", in: "query", schema: { type: "boolean" } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/portfolio/initiative/{slug}": {
      get: {
        summary: "Get a single initiative by slug",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
          { name: "expand", in: "query", schema: { type: "string" }, description: "Comma-separated: caseStudy" },
        ],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/v1/portfolio/case-studies": {
      get: {
        summary: "List case studies",
        parameters: [
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "tag", in: "query", schema: { type: "string" } },
          { name: "category", in: "query", schema: { type: "string" } },
          { name: "featured", in: "query", schema: { type: "boolean" } },
        ],
        responses: { "200": { description: "OK" } },
      },
    },
    "/v1/portfolio/case-study/{slug}": {
      get: {
        summary: "Get a single case study by slug",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
          { name: "expand", in: "query", schema: { type: "string" }, description: "Comma-separated: relatedProjects" },
        ],
        responses: { "200": { description: "OK" }, "404": { description: "Not found" } },
      },
    },
    "/v1/contact": { post: { summary: "Contact API", responses: { "200": { description: "OK" } } } },
    "/v1/activities": { get: { summary: "Activities API", responses: { "200": { description: "OK" } } } },
    "/v1/general": { get: { summary: "General API", responses: { "200": { description: "OK" } } } },
    "/v1/ai": { post: { summary: "AI endpoint", responses: { "200": { description: "OK" } } } },
    "/v1/webdav": {
      options: { summary: "WebDAV options", responses: { "204": { description: "No Content" } } },
      get: { summary: "WebDAV get", responses: { "200": { description: "OK" }, "404": { description: "Not found" } } },
      put: { summary: "WebDAV put", responses: { "200": { description: "Updated" }, "201": { description: "Created" } } },
      delete: { summary: "WebDAV delete", responses: { "204": { description: "Deleted" } } },
      propfind: { summary: "WebDAV propfind", responses: { "207": { description: "Multi-Status" } } },
      mkcol: { summary: "WebDAV mkcol", responses: { "201": { description: "Collection created" } } },
      lock: { summary: "WebDAV lock", responses: { "200": { description: "Locked" }, "423": { description: "Locked" } } },
      unlock: { summary: "WebDAV unlock", responses: { "204": { description: "Unlocked" } } },
    },
  },
};

site.get("/openapi.json", (c) => c.json(openapiSpec));

site.get("/health", (c) => c.json({ status: "ok", service: "rjmlaird-api", timestamp: new Date().toISOString() }));

site.get("/", (c) => {
  return c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>rjmlaird API</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css" />
    <style>
      :root {
        --ink:#0B0F1A; --card:#141B29; --lift:#1A2236; --w:#EDEAE3; 
        --m:#7C8AA4; --sky:#38BDF8; --bd:rgba(255,255,255,.07); --B:'Inter',sans-serif;
      }
      body { margin: 0; font-family: var(--B); background: var(--ink); color: var(--w); }
      .wrap { max-width: 960px; margin: auto; padding: 48px 20px; }
      
      /* Theme Integration */
      .swagger-ui { background: transparent !important; color: var(--w) !important; }
      .swagger-ui .info .title, .swagger-ui .opblock-summary-path, .swagger-ui label { color: var(--w) !important; }
      .swagger-ui .opblock { background: var(--card) !important; border: 1px solid var(--bd) !important; }
      .swagger-ui .opblock-summary-method { background: var(--sky) !important; color: var(--ink) !important; font-weight: bold; }
      .swagger-ui .btn.execute { background: var(--sky) !important; color: var(--ink) !important; }
      .swagger-ui .btn { background: var(--lift) !important; color: var(--w) !important; border: 1px solid var(--bd) !important; }
      .swagger-ui .markdown p, .swagger-ui .renderedMarkdown { color: var(--m) !important; }
    </style>
  </head>
  <body>
    <div class="wrap"><div id="swagger-ui"></div></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
      });
    </script>
  </body>
</html>`);
});