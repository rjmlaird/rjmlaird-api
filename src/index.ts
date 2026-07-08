import { Hono } from "hono";
import { json } from "./lib/jsonResponse";

import { handleWebDAV } from "./routes/webdav";
import { handleResearch } from "./routes/research";
import { handleCv, type CvCollection } from "./routes/cv";
import { handlePortfolio } from "./routes/portfolio";
import { handleContact } from "./routes/contact";
import { handleActivities } from "./routes/activities";
import { handleGeneral } from "./routes/general";

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

const app = new Hono<{ Bindings: Env }>();

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
} satisfies Record<CvCollection, unknown>;

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
] as const satisfies readonly CvCollection[];

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
    return c.json({ error: "Research internal error", message: err instanceof Error ? err.message : String(err) }, 500);
  }
};

const cvHandler = async (c: any) => {
  try {
    return await handleCv(c.req.raw, c.env);
  } catch (err) {
    console.error("CV API error:", err);
    return c.json({ error: "CV internal error", message: err instanceof Error ? err.message : String(err) }, 500);
  }
};

const portfolioHandler = async (c: any) => {
  try {
    return await handlePortfolio(c.req.raw, c.env);
  } catch (err) {
    console.error("Portfolio API error:", err);
    return c.json({ error: "Portfolio internal error", message: err instanceof Error ? err.message : String(err) }, 500);
  }
};

const contactHandler = async (c: any) => {
  try {
    return await handleContact(c.req.raw, c.env);
  } catch (err) {
    console.error("Contact API error:", err);
    return c.json({ error: "Contact internal error", message: err instanceof Error ? err.message : String(err) }, 500);
  }
};

const activitiesHandler = async (c: any) => {
  try {
    return await handleActivities(c.req.raw, c.env);
  } catch (err) {
    console.error("Activities API error:", err);
    return c.json({ error: "Activities internal error", message: err instanceof Error ? err.message : String(err) }, 500);
  }
};

const generalHandler = async (c: any) => {
  try {
    return await handleGeneral(c.req.raw, c.env);
  } catch (err) {
    console.error("General API error:", err);
    return c.json({ error: "General internal error", message: err instanceof Error ? err.message : String(err) }, 500);
  }
};

app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "rjmlaird-api",
    timestamp: new Date().toISOString(),
  })
);

app.get("/openapi.json", (c) =>
  c.json({
    openapi: "3.1.0",
    info: {
      title: "rjmlaird API",
      version: "1.0.0",
      description: "GitHub-powered CV + portfolio + contact + research + WebDAV API",
    },
    servers: [{ url: "https://api.rjmlaird.co.uk" }],
    tags: [
      { name: "System", description: "Health and API metadata" },
      { name: "Debug", description: "Debug endpoints" },
      { name: "CV", description: "Profile, experience, skills, and other CV collections" },
      { name: "Portfolio", description: "Portfolio collections" },
      { name: "Contact", description: "Contact details and social profiles" },
      { name: "Activities", description: "Events, events attending, and talks" },
      { name: "General", description: "Organisations and UN countries" },
      { name: "Research", description: "Research API endpoints" },
      { name: "WebDAV", description: "WebDAV access" },
    ],
    paths: {
      "/v1/cv/section/{section}": {
        get: {
          tags: ["CV"],
          parameters: [{ name: "section", in: "path", required: true, schema: { type: "string", enum: cvCollections } }],
        },
      },
      "/v1/portfolio/section/{section}": {
        get: {
          tags: ["Portfolio"],
          parameters: [{ name: "section", in: "path", required: true, schema: { type: "string" } }],
        },
      },
      "/v1/contact/section/{section}": {
        get: {
          tags: ["Contact"],
          parameters: [{ name: "section", in: "path", required: true, schema: { type: "string", enum: ["contact", "socials"] } }],
        },
      },
      "/v1/activities/section/{section}": {
        get: {
          tags: ["Activities"],
          parameters: [{ name: "section", in: "path", required: true, schema: { type: "string", enum: ["events", "eventsAttending", "talks"] } }],
        },
      },
      "/v1/general/section/{section}": {
        get: {
          tags: ["General"],
          parameters: [{ name: "section", in: "path", required: true, schema: { type: "string", enum: ["organisations", "unCountries"] } }],
        },
      },
    },
  })
);

app.all("/webdav/*", webdavHandler);
app.all("/v1/webdav/*", webdavHandler);
app.all("/v1/research/*", researchHandler);
app.all("/v1/research", researchHandler);
app.all("/v1/cv/*", cvHandler);
app.all("/v1/cv", cvHandler);
app.all("/v1/portfolio/*", portfolioHandler);
app.all("/v1/portfolio", portfolioHandler);
app.all("/v1/contact/*", contactHandler);
app.all("/v1/contact", contactHandler);
app.all("/v1/activities/*", activitiesHandler);
app.all("/v1/activities", activitiesHandler);
app.all("/v1/general/*", generalHandler);
app.all("/v1/general", generalHandler);

app.get("/v1/debug", (c) =>
  c.json({
    status: "ok",
    webdav: true,
    research: true,
    cv: true,
    portfolio: true,
    contact: true,
    activities: true,
    general: true,
    timestamp: new Date().toISOString(),
  })
);

app.get("/api/:collection", async (c) => {
  const collection = c.req.param("collection") as CvCollection;

  if (!cvCollections.includes(collection)) {
    return json({ error: "Collection not found", collection, allowed: cvCollections }, 404);
  }

  return json(cvData[collection]);
});

export default app;
