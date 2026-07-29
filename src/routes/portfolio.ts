import { Hono } from "hono";
import { json } from "../lib/jsonResponse";

// Data imports
import initiatives from "../data/initiatives.json";
import reviews from "../data/reviews.json";
import teaching from "../data/teaching.json";
import projects from "../data/projects.json";
import caseStudies from "../data/caseStudies.json";
import publicationsText from "../data/publications.txt";

export type PortfolioCollection =
  | "initiatives"
  | "reviews"
  | "teaching"
  | "research"
  | "projects"
  | "caseStudies";

const SECTION_KEYS = [
  "initiatives",
  "reviews",
  "teaching",
  "research",
  "projects",
  "caseStudies",
] as const satisfies readonly PortfolioCollection[];

const portfolioData = {
  initiatives,
  reviews,
  teaching,
  research: publicationsText, // Kept as requested
  projects,
  caseStudies,
} satisfies Record<PortfolioCollection, unknown>;

const app = new Hono<{ Bindings: Env }>();

const isCollection = (value: string): value is PortfolioCollection =>
  (SECTION_KEYS as readonly string[]).includes(value);

// --- Shared helpers for the item-type collections (projects, initiatives, caseStudies) ---

type Item = Record<string, any>;

const toBool = (v: string | undefined) =>
  v === undefined ? undefined : v === "true" || v === "1";

/** Apply common ?status=&tag=&featured=&category= query filters to a list of items. */
function applyFilters(items: Item[], query: Record<string, string | undefined>): Item[] {
  const { status, tag, featured, category } = query;
  const wantFeatured = toBool(featured);

  return items.filter((item) => {
    if (status && item.status !== status) return false;
    if (tag && !(Array.isArray(item.tags) && item.tags.includes(tag))) return false;
    if (category && !(Array.isArray(item.category) && item.category.includes(category))) return false;
    if (wantFeatured !== undefined && Boolean(item.featured) !== wantFeatured) return false;
    return true;
  });
}

const findBySlug = (items: Item[], slug: string) => items.find((i) => i.slug === slug);

/** Resolve a project/initiative's `caseStudy` reference (slug or free-text title) to the full case study, if found. */
function resolveCaseStudy(ref: unknown, allCaseStudies: Item[]): Item | null {
  if (!ref || typeof ref !== "string") return null;
  return (
    allCaseStudies.find((cs) => cs.slug === ref) ??
    allCaseStudies.find((cs) => cs.title?.toLowerCase() === ref.toLowerCase()) ??
    null
  );
}

/** Resolve a case study's `relatedProjects` slugs to summary project objects. */
function resolveRelatedProjects(refs: unknown, allProjects: Item[]): Item[] {
  if (!Array.isArray(refs)) return [];
  return refs
    .map((slug) => allProjects.find((p) => p.slug === slug))
    .filter((p): p is Item => Boolean(p));
}

function withExpand(item: Item, expand: string | undefined) {
  if (!expand) return item;
  const fields = expand.split(",").map((f) => f.trim());
  const expanded: Item = { ...item };

  if (fields.includes("caseStudy") && "caseStudy" in item) {
    expanded.caseStudy = resolveCaseStudy(item.caseStudy, caseStudies as Item[]) ?? item.caseStudy;
  }
  if (fields.includes("relatedProjects") && "relatedProjects" in item) {
    expanded.relatedProjects = resolveRelatedProjects(item.relatedProjects, projects as Item[]);
  }
  return expanded;
}

app.get("/", (c) =>
  json({
    service: "portfolio",
    version: "1.1",
    sections: SECTION_KEYS,
    endpoints: [
      "/v1/portfolio",
      "/v1/portfolio/sections",
      "/v1/portfolio/list",
      "/v1/portfolio/full",
      "/v1/portfolio/section/:section",
      "/v1/portfolio/:collection",
      "/v1/portfolio/search?q=",
      "/v1/portfolio/projects?status=&tag=&featured=",
      "/v1/portfolio/project/:slug?expand=caseStudy",
      "/v1/portfolio/initiatives?status=&tag=&featured=",
      "/v1/portfolio/initiative/:slug?expand=caseStudy",
      "/v1/portfolio/case-studies?status=&tag=&featured=&category=",
      "/v1/portfolio/case-study/:slug?expand=relatedProjects",
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

// --- Projects ---

app.get("/projects", (c) => {
  const query = c.req.query();
  const results = applyFilters(projects as Item[], query);
  return json({ count: results.length, items: results });
});

app.get("/project/:slug", (c) => {
  const slug = c.req.param("slug");
  const project = findBySlug(projects as Item[], slug);

  if (!project) return json({ error: "Project not found", slug }, 404);
  return json(withExpand(project, c.req.query("expand")));
});

// --- Initiatives ---

app.get("/initiatives", (c) => {
  const query = c.req.query();
  const results = applyFilters(initiatives as Item[], query);
  return json({ count: results.length, items: results });
});

app.get("/initiative/:slug", (c) => {
  const slug = c.req.param("slug");
  const initiative = findBySlug(initiatives as Item[], slug);

  if (!initiative) return json({ error: "Initiative not found", slug }, 404);
  return json(withExpand(initiative, c.req.query("expand")));
});

// --- Case studies ---

app.get("/case-studies", (c) => {
  const query = c.req.query();
  const results = applyFilters(caseStudies as Item[], query);
  return json({ count: results.length, items: results });
});

app.get("/case-study/:slug", (c) => {
  const slug = c.req.param("slug");
  const caseStudy = findBySlug(caseStudies as Item[], slug);

  if (!caseStudy) return json({ error: "Case study not found", slug }, 404);
  return json(withExpand(caseStudy, c.req.query("expand")));
});

// --- Cross-collection search ---

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
