import { Hono } from "hono";
import { json } from "../lib/jsonResponse";

// Data imports
import initiatives from "../data/initiatives.json";
import reviews from "../data/reviews.json";
import teaching from "../data/teaching.json";
import projects from "../data/projects.json";
import publicationsText from "../data/publications.txt";

export type PortfolioCollection = 
  | "initiatives" 
  | "reviews" 
  | "teaching" 
  | "research" 
  | "projects";

const SECTION_KEYS = [
  "initiatives",
  "reviews",
  "teaching",
  "research",
  "projects",
] as const satisfies readonly PortfolioCollection[];

const portfolioData = {
  initiatives,
  reviews,
  teaching,
  research: publicationsText, // Kept as requested
  projects,
} satisfies Record<PortfolioCollection, unknown>;

const app = new Hono<{ Bindings: Env }>();

const isCollection = (value: string): value is PortfolioCollection =>
  (SECTION_KEYS as readonly string[]).includes(value);

app.get("/", (c) =>
  json({
    service: "portfolio",
    version: "1.0",
    sections: SECTION_KEYS,
    endpoints: [
      "/v1/portfolio",
      "/v1/portfolio/sections",
      "/v1/portfolio/list",
      "/v1/portfolio/full",
      "/v1/portfolio/section/:section",
      "/v1/portfolio/:collection",
      "/v1/portfolio/project/:slug",
      "/v1/portfolio/search?q=",
    ],
  }),
);

app.get("/sections", (c) => json({ sections: SECTION_KEYS }));

app.get("/list", (c) =>
  json({
    count: SECTION_KEYS.length,
    items: SECTION_KEYS.map((section) => ({
      section,
      hasData: portfolioData[section] !== undefined,
    })),
  }),
);

app.get("/full", (c) => json({ sections: portfolioData }));

// Specific project lookup by slug
app.get("/project/:slug", (c) => {
  const slug = c.req.param("slug");
  const project = (projects as any[]).find((p) => p.slug === slug);

  if (!project) return json({ error: "Project not found", slug }, 404);
  return json(project);
});

app.get("/search", (c) => {
  const q = c.req.query("q")?.trim().toLowerCase();
  if (!q) return json({ error: "Missing ?q=" }, 400);

  const results = SECTION_KEYS.filter((section) =>
    JSON.stringify(portfolioData[section]).toLowerCase().includes(q),
  ).map((section) => ({ section, data: portfolioData[section] }));

  return json({ query: q, count: results.length, results });
});

app.get("/section/:section", (c) => {
  const section = c.req.param("section");
  if (!isCollection(section)) {
    return json({ error: "Not found", section, allowed: SECTION_KEYS }, 404);
  }

  return json({ section, data: portfolioData[section] });
});

app.get("/:collection", (c) => {
  const collection = c.req.param("collection");
  if (!isCollection(collection)) {
    return json({ error: "Not found", collection, allowed: SECTION_KEYS }, 404);
  }

  return json({ section: collection, data: portfolioData[collection] });
});

export default app;