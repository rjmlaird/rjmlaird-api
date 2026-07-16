import { Hono } from "hono";

export const site = new Hono();

// Define the collections used for OpenAPI enum validation
const cvCollections = [
  "awards", "certifications", "credly", "education", "experience",
  "languages", "memberships", "profile", "skills", "teaching",
  "tools", "volunteering",
] as const;

// The OpenAPI Specification Object
const openapiSpec = {
  openapi: "3.0.0",
  info: {
    title: "rjmlaird API",
    version: "1.0.0",
    description: "GitHub-powered CV + portfolio + contact + research + WebDAV API.",
  },
  servers: [{ url: "/" }],
  paths: {
    "/health": {
      get: { summary: "Health check", responses: { "200": { description: "Healthy" } } },
    },
    "/openapi.json": {
      get: { summary: "OpenAPI document", responses: { "200": { description: "OpenAPI JSON document" } } },
    },
    "/api/{collection}": {
      get: {
        summary: "Get CV collection",
        parameters: [
          { name: "collection", in: "path", required: true, schema: { type: "string", enum: cvCollections } },
        ],
        responses: { "200": { description: "Collection data" }, "404": { description: "Collection not found" } },
      },
    },
    "/v1/research": { get: { summary: "Research API", responses: { "200": { description: "OK" } } } },
    "/v1/cv": { get: { summary: "CV API", responses: { "200": { description: "OK" } } } },
    "/v1/portfolio": { get: { summary: "Portfolio API", responses: { "200": { description: "OK" } } } },
    "/v1/contact": { post: { summary: "Contact API", responses: { "200": { description: "OK" } } } },
    "/v1/activities": { get: { summary: "Activities API", responses: { "200": { description: "OK" } } } },
    "/v1/general": { get: { summary: "General API", responses: { "200": { description: "OK" } } } },
    "/v1/ai": { post: { summary: "AI endpoint", responses: { "200": { description: "OK" } } } },
    "/webdav": {
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

// Route: Serve the Spec
site.get("/openapi.json", (c) => c.json(openapiSpec));

// Route: Health Check
site.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "rjmlaird-api",
    timestamp: new Date().toISOString(),
  })
);

// Route: Landing Page (Swagger UI)
site.get("/", (c) => {
  return c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>rjmlaird API</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        layout: "BaseLayout",
      });
    </script>
  </body>
</html>`);
});