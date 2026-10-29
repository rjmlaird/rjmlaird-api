import { Hono } from "hono";
import { json } from "../lib/jsonResponse";

// Public portfolio data.
import initiatives from "../data/initiatives.json";
import reviews from "../data/reviews.json";
import projects from "../data/projects.json";
import caseStudies from "../data/caseStudies.json";
import publicBib from "../data/publications.public.bib";

export type PortfolioCollection =
  | "initiatives"
  | "reviews"
  | "projects"
  | "caseStudies";

const SECTION_KEYS = [
  "initiatives",
  "reviews",
  "projects",
  "caseStudies",
] as const satisfies readonly PortfolioCollection[];

const portfolioData = {
  initiatives,
  reviews,
  projects,
  caseStudies,
} satisfies Record<PortfolioCollection, unknown>;

const app = new Hono<{ Bindings: Env }>();

type Item = Record<string, unknown>;

const isCollection = (value: string): value is PortfolioCollection =>
  (SECTION_KEYS as readonly string[]).includes(value);

const asItems = (value: unknown): Item[] =>
  Array.isArray(value) ? (value as Item[]) : [];

const toBoolean = (value: string | undefined): boolean | undefined => {
  if (value === undefined) return undefined;
  return value === "true" || value === "1";
};

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

const stringArrayValue = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];

function applyFilters(
  items: Item[],
  query: Record<string, string | undefined>,
): Item[] {
  const { status, tag, featured, category } = query;
  const wantedFeatured = toBoolean(featured);

  return items.filter((item) => {
    if (status && stringValue(item.status) !== status) {
      return false;
    }

    if (tag && !stringArrayValue(item.tags).includes(tag)) {
      return false;
    }

    if (
      category &&
      !stringArrayValue(item.category).includes(category)
    ) {
      return false;
    }

    if (
      wantedFeatured !== undefined &&
      Boolean(item.featured) !== wantedFeatured
    ) {
      return false;
    }

    return true;
  });
}

function findBySlug(items: Item[], slug: string): Item | undefined {
  return items.find((item) => stringValue(item.slug) === slug);
}

function resolveCaseStudy(
  reference: unknown,
  allCaseStudies: Item[],
): Item | null {
  if (typeof reference !== "string" || reference.length === 0) {
    return null;
  }

  const normalisedReference = reference.toLowerCase();

  return (
    allCaseStudies.find(
      (caseStudy) => stringValue(caseStudy.slug) === reference,
    ) ??
    allCaseStudies.find(
      (caseStudy) =>
        stringValue(caseStudy.title)?.toLowerCase() === normalisedReference,
    ) ??
    null
  );
}

function resolveRelatedProjects(
  references: unknown,
  allProjects: Item[],
): Item[] {
  if (!Array.isArray(references)) {
    return [];
  }

  const slugs = references.filter(
    (reference): reference is string => typeof reference === "string",
  );

  return slugs
    .map((slug) => findBySlug(allProjects, slug))
    .filter((project): project is Item => Boolean(project));
}

function withExpand(item: Item, expand: string | undefined): Item {
  if (!expand) {
    return item;
  }

  const fields = expand
    .split(",")
    .map((field) => field.trim())
    .filter(Boolean);

  const expanded: Item = { ...item };

  if (fields.includes("caseStudy") && "caseStudy" in item) {
    expanded.caseStudy =
      resolveCaseStudy(
        item.caseStudy,
        asItems(caseStudies),
      ) ?? item.caseStudy;
  }

  if (fields.includes("relatedProjects") && "relatedProjects" in item) {
    expanded.relatedProjects = resolveRelatedProjects(
      item.relatedProjects,
      asItems(projects),
    );
  }

  return expanded;
}

function collectionResponse(
  section: PortfolioCollection,
  data: unknown,
) {
  return {
    section,
    data,
  };
}

// Portfolio API information.
app.get("/", (c) =>
  json({
    service: "portfolio",
    version: "1.2",
    visibility: "public-read-only",
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
      "/v1/portfolio/publications.txt (legacy; use /v1/research)",
    ],
  }),
);

app.get("/sections", (c) =>
  json({
    sections: SECTION_KEYS,
  }),
);

app.get("/list", (c) =>
  json({
    count: SECTION_KEYS.length,
    items: SECTION_KEYS.map((section) => ({
      section,
      hasData: portfolioData[section] !== undefined,
    })),
  }),
);

app.get("/full", (c) =>
  json({
    sections: portfolioData,
  }),
);

// Legacy alias. The old implementation fetched this API's own /data/publications.txt, which
// does not exist. Publications now live at /v1/research; the sanitised BibTeX is served here too.
app.get("/publications.txt", () =>
  new Response(publicBib, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      Link: '</v1/research/publications.bib>; rel="canonical"',
    },
  }),
);

// Projects.
app.get("/projects", (c) => {
  const results = applyFilters(
    asItems(projects),
    c.req.query(),
  );

  return json({
    count: results.length,
    items: results,
  });
});

app.get("/project/:slug", (c) => {
  const slug = c.req.param("slug");
  const project = findBySlug(asItems(projects), slug);

  if (!project) {
    return json(
      {
        error: "Project not found",
        slug,
      },
      404,
    );
  }

  return json(withExpand(project, c.req.query("expand")));
});

// Initiatives.
app.get("/initiatives", (c) => {
  const results = applyFilters(
    asItems(initiatives),
    c.req.query(),
  );

  return json({
    count: results.length,
    items: results,
  });
});

app.get("/initiative/:slug", (c) => {
  const slug = c.req.param("slug");
  const initiative = findBySlug(asItems(initiatives), slug);

  if (!initiative) {
    return json(
      {
        error: "Initiative not found",
        slug,
      },
      404,
    );
  }

  return json(withExpand(initiative, c.req.query("expand")));
});

// Case studies.
app.get("/case-studies", (c) => {
  const results = applyFilters(
    asItems(caseStudies),
    c.req.query(),
  );

  return json({
    count: results.length,
    items: results,
  });
});

app.get("/case-study/:slug", (c) => {
  const slug = c.req.param("slug");
  const caseStudy = findBySlug(asItems(caseStudies), slug);

  if (!caseStudy) {
    return json(
      {
        error: "Case study not found",
        slug,
      },
      404,
    );
  }

  return json(withExpand(caseStudy, c.req.query("expand")));
});

// Cross-collection search.
app.get("/search", (c) => {
  const query = c.req.query("q")?.trim();

  if (!query) {
    return json(
      {
        error: "Missing required query parameter: q",
      },
      400,
    );
  }

  const normalisedQuery = query.toLowerCase();
  const results = SECTION_KEYS.flatMap((section) => {
    const data = portfolioData[section];
    const serialised = JSON.stringify(data).toLowerCase();

    return serialised.includes(normalisedQuery)
      ? [
          {
            section,
            data,
          },
        ]
      : [];
  });

  return json({
    query,
    count: results.length,
    results,
  });
});

// Explicit section endpoint.
app.get("/section/:section", (c) => {
  const section = c.req.param("section");

  if (!isCollection(section)) {
    return json(
      {
        error: "Portfolio section not found",
        section,
        allowed: SECTION_KEYS,
      },
      404,
    );
  }

  return json(collectionResponse(section, portfolioData[section]));
});

// Generic collection endpoint.
app.get("/:collection", (c) => {
  const collection = c.req.param("collection");

  if (!isCollection(collection)) {
    return json(
      {
        error: "Portfolio collection not found",
        collection,
        allowed: SECTION_KEYS,
      },
      404,
    );
  }

  return json(
    collectionResponse(collection, portfolioData[collection]),
  );
});

export default app;
