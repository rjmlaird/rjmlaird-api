import { Hono } from "hono";
import { logger } from "hono/logger";
import { json } from "./lib/jsonResponse";

// Route imports
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
import { site } from "./routes/site"; // Use curly braces for named exports

// Data imports
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

// 1. Logging Middleware for observability
app.use("*", logger());

// 2. Centralized Data Registry
const cvData = {
  awards,
  certifications,
  credly,
  education,
  experience,
  languages,
  memberships,
  profile,
  skills,
  teaching,
  tools,
  volunteering,
} as const;

// 3. Mount Application Routes
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

// 4. API Collection Endpoint
app.get("/api/:collection", (c) => {
  const collectionKey = c.req.param("collection") as keyof typeof cvData;

  if (collectionKey in cvData) {
    return json(cvData[collectionKey]);
  }

  return json(
    { 
      error: "Collection not found", 
      received: collectionKey,
      available: Object.keys(cvData) 
    }, 
    404
  );
});

// 5. Mount Site Router (Handles / and /openapi.json)
app.route("/", site);

// 6. Final Catch-all (Debugging)
app.notFound((c) => {
  return c.text(`Route not found: ${c.req.path}`, 404);
});

export default app;