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
import webhooks from "./routes/webhooks";

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

// Corrected: Explicit array literal fixes TS1355
const cvCollections = [
  "awards", "certifications", "credly", "education", "experience", 
  "languages", "memberships", "profile", "skills", "teaching", "tools", "volunteering"
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
    // ... (Remaining OpenAPI paths)
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
app.route("/v1/webhooks", webhooks);
app.route("/v1/cdn", cdn);

app.get("/api/:collection", (c) => {
  const collection = c.req.param("collection");
  
  // Type-safe inclusion check
  if (!(cvCollections as readonly string[]).includes(collection)) {
    // Corrected: Ensure json() is called with the data and status
    return json({ error: "Collection not found", collection, allowed: cvCollections }, 404);
  }
  
  return json(cvData[collection as keyof typeof cvData]);
});

app.get("/openapi.json", (c) => c.json(openapiSpec));

app.get("/", (c) => c.html("<h1>rjmlaird API</h1>"));

app.notFound((c) => c.text("Not found", 404));

export default app;