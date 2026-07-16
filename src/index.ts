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
import { site } from "./routes/site";

// CV Data imports
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

// Portfolio Data imports
import initiatives from "./data/initiatives.json";
import reviews from "./data/reviews.json";
import projects from "./data/projects.json";
import publicationsText from "./data/publications.txt";

const app = new Hono<{ Bindings: Env }>();

// 1. Logging Middleware
app.use("*", logger());

// 2. Centralized CV Data Registry
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

// 3. Centralized Portfolio Data Registry
const portfolioData = {
  initiatives,
  reviews,
  teaching,
  research: publicationsText,
  projects,
} as const;

// 4. Mount Application Routes
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

// 5. API Collection Endpoints
app.get("/api/cv/:collection", (c) => {
  const collectionKey = c.req.param("collection") as keyof typeof cvData;
  if (collectionKey in cvData) return json(cvData[collectionKey]);
  return json({ error: "CV collection not found", available: Object.keys(cvData) }, 404);
});

app.get("/api/portfolio/:collection", (c) => {
  const collectionKey = c.req.param("collection") as keyof typeof portfolioData;
  if (collectionKey in portfolioData) return json(portfolioData[collectionKey]);
  return json({ error: "Portfolio collection not found", available: Object.keys(portfolioData) }, 404);
});

// 6. Mount Site Router
app.route("/", site);

// 7. Catch-all
app.notFound((c) => {
  return c.text(`Route not found: ${c.req.path}`, 404);
});

export default app;