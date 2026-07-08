import { Hono } from "hono";
import { json } from "./lib/jsonResponse";

import { handleWebDAV } from "./routes/webdav";
import { handleResearch } from "./routes/research";
import { handleCv, type CvCollection } from "./routes/cv";
import { handlePortfolio, type PortfolioCollection } from "./routes/portfolio";
import { handleContact, type ContactCollection } from "./routes/contact";
import { handleActivities } from "./routes/activities";
import { handleGeneral } from "./routes/general";

import awards from "./data/awards.json";
import certifications from "./data/certifications.json";
import contact from "./data/contact.json";
import credentials from "./data/credentials.json";
import credly from "./data/credly.json";
import education from "./data/education.json";
import experience from "./data/experience.json";
import initiatives from "./data/initiatives.json";
import { languages } from "./data/languages";
import memberships from "./data/memberships.json";
import personal from "./data/personal.json";
import profile from "./data/profile.json";
import reviews from "./data/reviews.json";
import services from "./data/services.json";
import skills from "./data/skills.json";
import socials from "./data/socials.json";
import teaching from "./data/teaching.json";
import { tools } from "./data/tools";
import { unCountries } from "./data/unCountries";

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
      { name: "Portfolio", description: "Articles, research, projects, initiatives, and related portfolio collections" },
      { name: "Contact", description: "Contact details and social profiles" },
      { name: "Activities", description: "Events, events attending, and talks" },
      { name: "General", description: "Organisations and UN countries" },
      { name: "Research", description: "Research API endpoints" },
      { name: "WebDAV", description: "WebDAV access" },
    ],
    paths: {
      "/health": {
        get: {
          tags: ["System"],
          summary: "Health check",
          responses: { "200": { description: "API is running" } },
        },
      },
      "/v1/debug": {
        get: {
          tags: ["Debug"],
          summary: "Debug status",
          responses: { "200": { description: "Debug information" } },
        },
      },
      "/v1/cv": {
        get: { tags: ["CV"], summary: "CV API root", responses: { "200": { description: "CV service info" } } },
      },
      "/v1/cv/sections": {
        get: { tags: ["CV"], summary: "List CV sections", responses: { "200": { description: "Supported CV sections" } } },
      },
      "/v1/cv/list": {
        get: { tags: ["CV"], summary: "List stored CV records", responses: { "200": { description: "CV records" } } },
      },
      "/v1/cv/full": {
        get: { tags: ["CV"], summary: "Return merged CV payload", responses: { "200": { description: "Merged CV data" } } },
      },
      "/v1/cv/section/{section}": {
        get: {
          tags: ["CV"],
          summary: "Get one CV section",
          parameters: [
            { name: "section", in: "path", required: true, schema: { type: "string", enum: cvCollections } },
          ],
          responses: { "200": { description: "Section record" }, "404": { description: "Not found" } },
        },
      },
      "/v1/cv/search": {
        get: {
          tags: ["CV"],
          summary: "Search CV records",
          parameters: [{ name: "q", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Search results" }, "400": { description: "Missing query" } },
        },
      },

      "/v1/portfolio": {
        get: { tags: ["Portfolio"], summary: "Portfolio API root", responses: { "200": { description: "Portfolio service info" } } },
      },
      "/v1/portfolio/sections": {
        get: { tags: ["Portfolio"], summary: "List portfolio sections", responses: { "200": { description: "Supported portfolio sections" } } },
      },
      "/v1/portfolio/list": {
        get: { tags: ["Portfolio"], summary: "List stored portfolio records", responses: { "200": { description: "Portfolio records" } } },
      },
      "/v1/portfolio/full": {
        get: { tags: ["Portfolio"], summary: "Return merged portfolio payload", responses: { "200": { description: "Merged portfolio data" } } },
      },
      "/v1/portfolio/section/{section}": {
        get: {
          tags: ["Portfolio"],
          summary: "Get one portfolio section",
          parameters: [{ name: "section", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Section record" }, "404": { description: "Not found" } },
        },
      },
      "/v1/portfolio/search": {
        get: {
          tags: ["Portfolio"],
          summary: "Search portfolio records",
          parameters: [{ name: "q", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Search results" }, "400": { description: "Missing query" } },
        },
      },

      "/v1/contact": {
        get: { tags: ["Contact"], summary: "Contact API root", responses: { "200": { description: "Contact service info" } } },
      },
      "/v1/contact/sections": {
        get: { tags: ["Contact"], summary: "List contact sections", responses: { "200": { description: "Supported contact sections" } } },
      },
      "/v1/contact/list": {
        get: { tags: ["Contact"], summary: "List stored contact records", responses: { "200": { description: "Contact records" } } },
      },
      "/v1/contact/full": {
        get: { tags: ["Contact"], summary: "Return merged contact payload", responses: { "200": { description: "Merged contact data" } } },
      },
      "/v1/contact/section/{section}": {
        get: {
          tags: ["Contact"],
          summary: "Get one contact section",
          parameters: [{ name: "section", in: "path", required: true, schema: { type: "string", enum: ["contact", "socials"] } }],
          responses: { "200": { description: "Section record" }, "404": { description: "Not found" } },
        },
      },

      "/v1/activities": {
        get: { tags: ["Activities"], summary: "Activities API root", responses: { "200": { description: "Activities service info" } } },
      },
      "/v1/activities/sections": {
        get: { tags: ["Activities"], summary: "List activities sections", responses: { "200": { description: "Supported activities sections" } } },
      },
      "/v1/activities/list": {
        get: { tags: ["Activities"], summary: "List stored activities records", responses: { "200": { description: "Activities records" } } },
      },
      "/v1/activities/full": {
        get: { tags: ["Activities"], summary: "Return merged activities payload", responses: { "200": { description: "Merged activities data" } } },
      },
      "/v1/activities/section/{section}": {
        get: {
          tags: ["Activities"],
          summary: "Get one activities section",
          parameters: [{ name: "section", in: "path", required: true, schema: { type: "string", enum: ["events", "eventsAttending", "talks"] } }],
          responses: { "200": { description: "Section record" }, "404": { description: "Not found" } },
        },
      },
      "/v1/activities/search": {
        get: {
          tags: ["Activities"],
          summary: "Search activities records",
          parameters: [{ name: "q", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Search results" }, "400": { description: "Missing query" } },
        },
      },

      "/v1/general": {
        get: { tags: ["General"], summary: "General API root", responses: { "200": { description: "General service info" } } },
      },
      "/v1/general/sections": {
        get: { tags: ["General"], summary: "List general sections", responses: { "200": { description: "Supported general sections" } } },
      },
      "/v1/general/list": {
        get: { tags: ["General"], summary: "List stored general records", responses: { "200": { description: "General records" } } },
      },
      "/v1/general/full": {
        get: { tags: ["General"], summary: "Return merged general payload", responses: { "200": { description: "Merged general data" } } },
      },
      "/v1/general/section/{section}": {
        get: {
          tags: ["General"],
          summary: "Get one general section",
          parameters: [{ name: "section", in: "path", required: true, schema: { type: "string", enum: ["organisations", "unCountries"] } }],
          responses: { "200": { description: "Section record" }, "404": { description: "Not found" } },
        },
      },
      "/v1/general/search": {
        get: {
          tags: ["General"],
          summary: "Search general records",
          parameters: [{ name: "q", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Search results" }, "400": { description: "Missing query" } },
        },
      },

      "/v1/research": {
        get: { tags: ["Research"], summary: "Research API root", responses: { "200": { description: "Research service info" } } },
      },
      "/v1/research/search": {
        get: {
          tags: ["Research"],
          summary: "Search stored papers",
          parameters: [{ name: "q", in: "query", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Search results" }, "400": { description: "Missing query" } },
        },
      },
      "/v1/research/papers": {
        get: { tags: ["Research"], summary: "List papers", responses: { "200": { description: "Paper list" } } },
      },
      "/v1/research/paper/{id}": {
        get: {
          tags: ["Research"],
          summary: "Get one paper",
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "Paper record" }, "404": { description: "Not found" } },
        },
      },
      "/v1/research/graph": {
        get: { tags: ["Research"], summary: "Paper graph", responses: { "200": { description: "Graph data" } } },
      },
      "/v1/research/timeline": {
        get: { tags: ["Research"], summary: "Paper timeline", responses: { "200": { description: "Timeline data" } } },
      },
      "/v1/research/entities": {
        get: { tags: ["Research"], summary: "Extract entities", responses: { "200": { description: "Entity data" } } },
      },
      "/v1/research/export/zotero": {
        get: { tags: ["Research"], summary: "Export to Zotero format", responses: { "200": { description: "Export payload" } } },
      },
      "/v1/research/ingest": {
        post: { tags: ["Research"], summary: "Ingest a record or sync Zotero page", responses: { "201": { description: "Ingested" }, "500": { description: "Ingest failed" } } },
      },
      "/webdav/{path}": {
        get: {
          tags: ["WebDAV"],
          summary: "WebDAV endpoint",
          parameters: [{ name: "path", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "WebDAV response" } },
        },
      },
      "/api/{collection}": {
        get: {
          tags: ["CV"],
          summary: "Fetch CV collection data",
          parameters: [{ name: "collection", in: "path", required: true, schema: { type: "string", enum: cvCollections } }],
          responses: { "200": { description: "Collection data" }, "404": { description: "Collection not found" } },
        },
      },
    },
  })
);

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
