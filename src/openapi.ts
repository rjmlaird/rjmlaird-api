const qp = (name: string, description: string, schema: Record<string, unknown> = { type: "string" }) => ({ name, in: "query", description, schema });
const slug = { name: "slug", in: "path", required: true, schema: { type: "string" } };
const ok = { "200": { description: "OK" } };
const ok404 = { ...ok, "404": { description: "Not found" } };

const listParams = [
  qp("status", "e.g. completed, ongoing"),
  qp("type", "e.g. featured, video, research"),
  qp("tag", "Exact tag match (case-insensitive)"),
  qp("sector", "Exact sector match"),
  qp("client", "Exact client match"),
  qp("featured", "true | false", { type: "boolean" }),
  qp("q", "Free-text search (max 100 chars)"),
  qp("limit", "Page size, 1-100", { type: "integer" }),
  qp("offset", "Items to skip", { type: "integer" }),
];

export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "rjmlaird Portfolio API",
    version: "2.0.0",
    description: "Public, read-only JSON API for Ryan Laird's portfolio: projects, case studies, initiatives, testimonials, teaching and research.",
  },
  servers: [{ url: "/" }],
  paths: {
    "/v1/portfolio": { get: { summary: "Summary, counts and endpoint index", responses: ok } },
    "/v1/portfolio/projects": { get: { summary: "List projects", parameters: listParams, responses: ok } },
    "/v1/portfolio/projects/{slug}": {
      get: { summary: "Get a project", parameters: [slug, qp("expand", "Comma-separated: caseStudy, relatedCaseStudies")], responses: ok404 },
    },
    "/v1/portfolio/case-studies": { get: { summary: "List case studies", parameters: [...listParams, qp("category", "Category")], responses: ok } },
    "/v1/portfolio/case-studies/{slug}": {
      get: { summary: "Get a case study", parameters: [slug, qp("expand", "Comma-separated: relatedProjects")], responses: ok404 },
    },
    "/v1/portfolio/initiatives": { get: { summary: "List initiatives", parameters: listParams, responses: ok } },
    "/v1/portfolio/initiatives/{slug}": {
      get: { summary: "Get an initiative", parameters: [slug, qp("expand", "Comma-separated: caseStudies")], responses: ok404 },
    },
    "/v1/portfolio/reviews": { get: { summary: "List testimonials", responses: ok } },
    "/v1/portfolio/research": { get: { summary: "List publications (parsed from BibTeX)", parameters: [qp("q", "Search title/authors")], responses: ok } },
    "/v1/portfolio/teaching": { get: { summary: "Teaching history", responses: ok } },
    "/v1/portfolio/search": { get: { summary: "Search across projects, initiatives, case studies and research", parameters: [{ ...qp("q", "Search term"), required: true }], responses: ok } },
    "/health": { get: { summary: "Health check", responses: ok } },
  },
} as const;
