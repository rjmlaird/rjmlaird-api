import { Hono } from "hono";
import { json } from "./lib/jsonResponse";

// Routes
import system from "./routes/system";
import debug from "./routes/debug";
import webdav from "./routes/webdav";
import research from "./routes/research";
import cv from "./routes/cv";
import portfolio from "./routes/portfolio";
import contact from "./routes/contact";
import activities from "./routes/activities";
import general from "./routes/general";
import { aiApp } from "./routes/ai";
import cdn from "./routes/cdn";
import webhooks from "./routes/webhooks"; // Consolidated webhooks router

// Data
import awards from "./data/awards.json";
import certifications from "./data/certifications.json";
import credly from "./data/credly.json";
import education from "./data/education.json";
import experience from "./data/experience.json";
import { languages } from "./data/languages";
import memberships from "./data/memberships.json";
import profile from "./data/profile.json";
import skills from "./data/skills.json";
import teaching from "./data/teaching.json";
import { tools } from "./data/tools";
import volunteering from "./data/volunteering.json";

const app = new Hono<{ Bindings: Env }>();

const cvData = {
  awards, certifications, credly, education, experience, 
  languages, memberships, profile, skills, teaching, tools, volunteering,
} satisfies Record<string, unknown>;

const cvCollections = Object.keys(cvData) as const;

const openapiSpec = {
  openapi: "3.0.0",
  info: {
    title: "rjmlaird API",
    version: "1.0.0",
    description: "GitHub-powered CV + portfolio + contact + research + WebDAV API.",
  },
  servers: [{ url: "/" }],
  paths: {
    "/": { get: { summary: "API landing page", responses: { "200": { description: "Swagger UI landing page" } } } },
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
    "/v1/contact": { post: { summary: "Contact API", responses: { "200": { description: "OK" } } } },
    "/v1/activities": { get: { summary: "Activities API", responses: { "200": { description: "OK" } } } },
    "/v1/general": { get: { summary: "General API", responses: { "200": { description: "OK" } } } },
    "/v1/ai": { post: { summary: "AI endpoint", responses: { "200": { description: "OK" } } } },
    "/v1/webhooks/cal": { post: { summary: "Cal.com booking webhook", responses: { "200": { description: "Handled" }, "401": { description: "Invalid signature" } } } },
    "/v1/cdn/list": { get: { summary: "List CDN objects", parameters: [{ name: "prefix", in: "query", schema: { type: "string" } }], responses: { "200": { description: "OK" } } } },
    "/v1/cdn/file/{key}": {
      get: { summary: "Download a CDN object", responses: { "200": { description: "File" }, "404": { description: "Not found" } } },
      put: { summary: "Upload a CDN object", responses: { "201": { description: "Created" }, "401": { description: "Unauthorized" } } },
      delete: { summary: "Delete a CDN object", responses: { "200": { description: "Deleted" }, "401": { description: "Unauthorized" } } },
    },
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

// Routes
app.get("/health", (c) => c.json({ status: "ok", service: "rjmlaird-api", timestamp: new Date().toISOString() }));
app.route("/system", system);
app.route("/debug", debug);
app.route("/webdav", webdav);
app.route("/v1/research", research);
app.route("/v1/cv", cv);
app.route("/v1/portfolio", portfolio);
app.route("/v1/contact", contact);
app.route("/v1/activities", activities);
app.route("/v1/general", general);
app.route("/v1/ai", aiApp);
app.route("/v1/webhooks", webhooks); // Now managed in routes/webhooks/index.ts
app.route("/v1/cdn", cdn);

app.get("/api/:collection", (c) => {
  const collection = c.req.param("collection") as keyof typeof cvData;
  if (!cvCollections.includes(collection)) return json({ error: "Collection not found", collection, allowed: cvCollections }, 404);
  return json(cvData[collection]);
});

app.get("/openapi.json", (c) => c.json(openapiSpec));

app.get("/", (c) => c.html(/* HTML string remains same as provided */));

app.notFound((c) => c.text("Not found", 404));

export default app;