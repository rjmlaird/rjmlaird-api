// OpenAPI 3.0 description of the public API. Rendered by Swagger UI at "/" and served at /openapi.json.
// Keep in step with src/index.ts: test/routes.test.ts fails if a documented path stops responding.
import glossaryData from "./data/glossary.json";

type Param = Record<string, unknown>;
const q = (name: string, description: string, schema: Record<string, unknown> = { type: "string" }): Param => ({
  name, in: "query", description, schema,
});
const path = (name: string, description: string, schema: Record<string, unknown> = { type: "string" }): Param => ({
  name, in: "path", required: true, description, schema,
});

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (description: string, schema?: unknown) => ({
  description,
  content: { "application/json": { schema: schema ?? { type: "object" } } },
});
const errors = {
  "400": json("Invalid query parameter.", ref("Error")),
  "404": json("Not found.", ref("Error")),
};
const ok = (description = "OK", schema?: unknown) => ({ "200": json(description, schema) });
const notModified = { "304": { description: "Not modified (ETag matched)." } };

const limit = q("limit", "Page size.", { type: "integer", minimum: 1 });
const offset = q("offset", "Items to skip.", { type: "integer", minimum: 0 });
const search = q("q", "Free-text search (100 characters max).");

const get = (tag: string, summary: string, parameters: Param[] = [], responses: Record<string, unknown> = ok(), extra: Record<string, unknown> = {}) => ({
  get: { tags: [tag], summary, parameters, responses: { ...responses, ...notModified }, ...extra },
});

const categoryIds = glossaryData.categories.map((c) => c.id);

function catalogue(name: "apps" | "tools" | "labs", tag: string, statuses: string[], groups: string[]) {
  const one = name.slice(0, -1);
  return {
    [`/v1/${name}`]: get(tag, `List ${name}`, [
      q("status", "Comma-separated statuses.", { type: "string", description: statuses.join(", ") }),
      q("group", "Group id.", { type: "string", enum: groups }),
      q("tech", "Exact technology match (case-insensitive)."),
      q("live", "true = usable now (active or in progress); false = everything else.", { type: "boolean" }),
      q("sort", "Sort order (default: status, then title).", { type: "string", enum: ["status", "title", "updated"] }),
      search, limit, offset,
    ], { ...ok(`${name} catalogue`, ref("CatalogueResponse")), "400": errors["400"] }),
    [`/v1/${name}/groups`]: get(tag, `Groups in the ${name} catalogue, with counts`),
    [`/v1/${name}/{slug}`]: get(tag, `Get one ${one}`, [path("slug", `${one} id, e.g. its sourceId`)], { ...ok(), "404": errors["404"] }),
  };
}

export const openapi = {
  openapi: "3.0.3",
  info: {
    title: "Ryan Laird Portfolio API",
    version: "1.1.0",
    description:
      "Public, read-only API for Ryan Laird and the rjmlaird.co.uk estate: CV, portfolio, research, glossary, " +
      "tools, apps, labs, estate subdomains and service status. All responses are JSON unless noted. " +
      "Collections accept `limit`/`offset` and return `meta` with totals. Responses carry an ETag; send `If-None-Match` to receive 304.",
  },
  servers: [
    { url: "https://api.rjmlaird.co.uk", description: "Production" },
    { url: "http://localhost:8787", description: "Local development" },
  ],
  tags: [
    { name: "System", description: "Discovery, health, status and the subdomain entry point." },
    { name: "Biography", description: "Public biography and contact links." },
    { name: "CV", description: "Professional record and credentials." },
    { name: "Portfolio", description: "Projects, initiatives and case studies." },
    { name: "Research", description: "Publications and BibTeX." },
    { name: "Glossary", description: "Plain-English definitions (glossary.rjmlaird.co.uk)." },
    { name: "Tools", description: "Small, single-purpose utilities (tools.rjmlaird.co.uk)." },
    { name: "Apps", description: "Ongoing applications (apps.rjmlaird.co.uk)." },
    { name: "Labs", description: "Experiments and prototypes (labs.rjmlaird.co.uk)." },
    { name: "Media", description: "Videos and podcasts." },
    { name: "General", description: "Additional public reference data." },
  ],
  paths: {
    "/healthz": get("System", "Health check", [], ok("Service is available.")),
    "/openapi.json": get("System", "This document"),
    "/v1": get("System", "API discovery: every endpoint group and the estate entry points"),
    "/v1/status": get(
      "System",
      "Service status, dataset inventory and (optionally) live reachability of the estate",
      [q("probe", "true = HEAD-check each live public subdomain (3 s timeout, cached 60 s). Returns 503 if any check fails.", { type: "boolean" })],
      { ...ok("Status document.", ref("StatusResponse")), "503": json("Degraded: at least one probed subdomain is unreachable.", ref("StatusResponse")) },
    ),
    "/v1/subdomains": get("System", "Estate entry point: every public subdomain with its web and API entry points", [
      q("status", "Registry status.", { type: "string", enum: ["live", "building", "planned", "optional"] }),
      q("kind", "Site kind.", { type: "string", enum: ["hub", "authority", "service", "operational", "tool"] }),
      q("live", "true = live only; false = not yet live.", { type: "boolean" }),
    ], { ...ok("Subdomain directory.", ref("SubdomainsResponse")), "400": errors["400"] }),
    "/v1/subdomains/{key}": get("System", "One subdomain by id or host", [path("key", "e.g. glossary or glossary.rjmlaird.co.uk")], { ...ok(), "404": errors["404"] }),
    "/v1/sites": get("System", "Raw public site registry (generated from rjmlaird-docs/data/sites.yaml)", [
      q("kind", "Site kind."), q("status", "Registry status."),
      q("footer", "true = footer sites, in order (live only unless status is given).", { type: "boolean" }),
      q("host", "Exact hostname."),
    ], { ...ok(), "400": errors["400"] }),
    "/v1/sites/{id}": get("System", "One registry entry", [path("id", "Site id")], { ...ok(), "404": errors["404"] }),

    "/v1/bio": get("Biography", "Public biography"),
    "/v1/bio/{section}": get("Biography", "A biography section", [
      path("section", "Section", { type: "string", enum: ["short", "summary", "roles", "focus", "profiles", "links", "contact"] }),
    ], { ...ok(), "404": errors["404"] }),

    "/v1/cv": get("CV", "CV index with a public profile summary, per-section counts and links", [], ok("CV index.")),
    "/v1/cv/sections": get("CV", "Section names"),
    "/v1/cv/list": get("CV", "Sections and whether they hold data"),
    "/v1/cv/full": get("CV", "Every section in one response"),
    "/v1/cv/search": get("CV", "Search all sections", [{ ...search, required: true }], { ...ok(), "400": errors["400"] }),
    "/v1/cv/section/{section}": get("CV", "One CV section", [path("section", "Section name")], { ...ok(), "404": errors["404"] }),
    "/v1/cv/{collection}": get("CV", "One CV collection", [path("collection", "Collection name, e.g. education, experience, awards")], { ...ok(), "404": errors["404"] }),

    "/v1/portfolio": get("Portfolio", "Portfolio index and endpoint list"),
    "/v1/portfolio/sections": get("Portfolio", "Section names"),
    "/v1/portfolio/list": get("Portfolio", "Sections and whether they hold data"),
    "/v1/portfolio/full": get("Portfolio", "Every section in one response"),
    "/v1/portfolio/projects": get("Portfolio", "List projects", [q("status", "e.g. completed, ongoing"), q("tag", "Exact tag"), q("featured", "true | false", { type: "boolean" })]),
    "/v1/portfolio/project/{slug}": get("Portfolio", "Get a project", [path("slug", "Project slug"), q("expand", "caseStudy")], { ...ok(), "404": errors["404"] }),
    "/v1/portfolio/initiatives": get("Portfolio", "List initiatives", [q("status", "Status"), q("tag", "Exact tag"), q("featured", "true | false", { type: "boolean" })]),
    "/v1/portfolio/initiative/{slug}": get("Portfolio", "Get an initiative", [path("slug", "Initiative slug"), q("expand", "caseStudy")], { ...ok(), "404": errors["404"] }),
    "/v1/portfolio/case-studies": get("Portfolio", "List case studies", [q("status", "Status"), q("tag", "Exact tag"), q("featured", "true | false", { type: "boolean" }), q("category", "Category")]),
    "/v1/portfolio/case-study/{slug}": get("Portfolio", "Get a case study", [path("slug", "Case study slug"), q("expand", "relatedProjects")], { ...ok(), "404": errors["404"] }),
    "/v1/portfolio/search": get("Portfolio", "Search across portfolio collections", [{ ...search, required: true }], { ...ok(), "400": errors["400"] }),
    "/v1/portfolio/section/{section}": get("Portfolio", "One portfolio section", [path("section", "Section name")], { ...ok(), "404": errors["404"] }),
    "/v1/portfolio/{collection}": get("Portfolio", "One portfolio collection", [path("collection", "initiatives | reviews | projects | caseStudies")], { ...ok(), "404": errors["404"] }),
    "/v1/portfolio/publications.txt": {
      get: { tags: ["Portfolio"], deprecated: true, summary: "Legacy alias for /v1/research/publications.bib", responses: { "200": { description: "BibTeX as text/plain." } } },
    },

    "/v1/research": get("Research", "List publications", [
      q("year", "Four-digit year."),
      q("type", "BibTeX entry type, e.g. article, inproceedings."),
      q("author", "Author name contains."),
      q("sort", "Sort order (default: year, newest first).", { type: "string", enum: ["year", "title"] }),
      search, limit, offset,
    ], { ...ok("Publications.", ref("ResearchResponse")), "400": errors["400"] }),
    "/v1/research/publications.bib": {
      get: {
        tags: ["Research"],
        summary: "Sanitised BibTeX for reference managers (no local file paths or publisher abstracts)",
        responses: { "200": { description: "BibTeX.", content: { "application/x-bibtex": { schema: { type: "string" } } } } },
      },
    },
    "/v1/research/{id}": get("Research", "Get one publication", [path("id", "Publication id")], { ...ok(), "404": errors["404"] }),

    "/v1/glossary": get("Glossary", "List glossary terms", [
      q("category", "Category id.", { type: "string", enum: categoryIds }),
      q("letter", "A–Z index letter, or # for terms starting with a digit."),
      q("sort", "Sort order (default: term).", { type: "string", enum: ["term", "updated"] }),
      q("expand", "definition = include the full definition and related slugs.", { type: "string", enum: ["definition"] }),
      q("format", "jsonld = schema.org DefinedTermSet.", { type: "string", enum: ["jsonld"] }),
      search, limit, offset,
    ], { ...ok("Glossary terms.", ref("GlossaryListResponse")), "400": errors["400"] }),
    "/v1/glossary/categories": get("Glossary", "Categories with term counts"),
    "/v1/glossary/letters": get("Glossary", "A–Z index with counts"),
    "/v1/glossary/{slug}": get("Glossary", "One term by slug or alias", [
      path("slug", "Term slug or alias, e.g. albedo or SAR"),
      q("format", "jsonld = schema.org DefinedTerm.", { type: "string", enum: ["jsonld"] }),
    ], { ...ok("A term, with definition and related terms.", ref("GlossaryTermResponse")), "404": errors["404"] }),

    ...catalogue("tools", "Tools", ["active", "in-progress", "planned", "archived"], ["space", "maths-physics", "places", "sustainability", "productivity"]),
    ...catalogue("apps", "Apps", ["active", "in-progress", "planned", "archived"], ["space", "places", "home"]),
    ...catalogue("labs", "Labs", ["active", "in-progress", "planned", "archived"], ["experiments"]),
    "/v1/builds": get("Tools", "Combined apps and tools catalogue (legacy; prefer /v1/apps and /v1/tools)"),

    "/v1/media": get("Media", "Media index"),
    "/v1/media/videos": get("Media", "List videos"),
    "/v1/media/video/{slug}": get("Media", "Get a video", [path("slug", "Video slug")], { ...ok(), "404": errors["404"] }),
    "/v1/media/podcasts": get("Media", "List podcasts"),
    "/v1/media/podcast/{slug}": get("Media", "Get a podcast", [path("slug", "Podcast slug")], { ...ok(), "404": errors["404"] }),
    "/v1/media/search": get("Media", "Search media", [{ ...search, required: true }], { ...ok(), "400": errors["400"] }),

    "/v1/general": get("General", "General reference index"),
    "/v1/general/{collection}": get("General", "One collection", [path("collection", "organisations | unCountries")], { ...ok(), "404": errors["404"] }),
  },
  components: {
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: { error: { type: "string" } },
        additionalProperties: true,
      },
      PageMeta: {
        type: "object",
        properties: {
          total: { type: "integer" }, count: { type: "integer" }, limit: { type: "integer" },
          offset: { type: "integer" }, nextOffset: { type: "integer", nullable: true },
        },
      },
      GlossaryTerm: {
        type: "object",
        properties: {
          slug: { type: "string" }, term: { type: "string" }, category: { type: "string" },
          aliases: { type: "array", items: { type: "string" } }, short: { type: "string" },
          updated: { type: "string", format: "date" }, url: { type: "string", format: "uri" },
        },
      },
      GlossaryListResponse: {
        type: "object",
        properties: { data: { type: "array", items: ref("GlossaryTerm") }, meta: ref("PageMeta"), links: { type: "object" } },
      },
      GlossaryTermResponse: {
        type: "object",
        properties: { data: ref("GlossaryTerm"), meta: { type: "object", properties: { matched: { type: "string", enum: ["slug", "alias"] }, canonical: { type: "string" } } } },
      },
      Build: {
        type: "object",
        properties: {
          id: { type: "string" }, sourceId: { type: "string" }, type: { type: "string" }, title: { type: "string" },
          description: { type: "string" }, group: { type: "string" }, tech: { type: "array", items: { type: "string" } },
          status: { type: "string" }, statusLabel: { type: "string" }, updated: { type: "string", format: "date" },
          url: { type: "string", format: "uri" }, source: { type: "string", format: "uri" },
        },
      },
      CatalogueResponse: {
        type: "object",
        properties: { data: { type: "array", items: ref("Build") }, meta: ref("PageMeta"), links: { type: "object" } },
      },
      Publication: {
        type: "object",
        properties: {
          id: { type: "string" }, bibKey: { type: "string" }, type: { type: "string" }, title: { type: "string" },
          authors: { type: "array", items: { type: "string" } }, year: { type: "integer", nullable: true },
          venue: { type: "string" }, doi: { type: "string", nullable: true }, url: { type: "string", nullable: true },
        },
      },
      ResearchResponse: {
        type: "object",
        properties: { data: { type: "array", items: ref("Publication") }, meta: ref("PageMeta"), links: { type: "object" } },
      },
      Subdomain: {
        type: "object",
        properties: {
          id: { type: "string" }, label: { type: "string" }, host: { type: "string" }, url: { type: "string", format: "uri" },
          kind: { type: "string" }, status: { type: "string" }, audience: { type: "string" }, job: { type: "string" },
          entrypoints: { type: "object", properties: { web: { type: "string" }, api: { type: "string", nullable: true }, self: { type: "string" } } },
        },
      },
      SubdomainsResponse: {
        type: "object",
        properties: { data: { type: "object", properties: { subdomains: { type: "array", items: ref("Subdomain") } } }, meta: { type: "object" }, links: { type: "object" } },
      },
      StatusResponse: {
        type: "object",
        properties: { data: { type: "object", properties: { status: { type: "string", enum: ["ok", "degraded"] }, datasets: { type: "array", items: { type: "object" } } } } },
      },
    },
  },
} as const;
