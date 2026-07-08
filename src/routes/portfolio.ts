import { json } from "../lib/jsonResponse";
import articles from "../data/articles.json";
import initiatives from "../data/initiatives.json";
import projects from "../data/projects.json";
import research from "../data/research.json";
import services from "../data/services.json";
import teaching from "../data/teaching.json";
import reviews from "../data/reviews.json";

export type PortfolioCollection =
  | "articles"
  | "initiatives"
  | "projects"
  | "research"
  | "services"
  | "teaching"
  | "reviews";

const SECTION_KEYS = [
  "articles",
  "initiatives",
  "projects",
  "research",
  "services",
  "teaching",
  "reviews",
] as const satisfies readonly PortfolioCollection[];

const portfolioData = {
  articles,
  initiatives,
  projects,
  research,
  services,
  teaching,
  reviews,
} satisfies Record<PortfolioCollection, unknown>;

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isCollection(value: string): value is PortfolioCollection {
  return (SECTION_KEYS as readonly string[]).includes(value);
}

function getRoute(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/v1\/portfolio\/?/, "");
  const query = url.searchParams.get("q");
  return { path, query };
}

export async function handlePortfolio(request: Request, _env: Env) {
  const method = request.method.toUpperCase();
  const { path, query } = getRoute(request);

  if (!path) {
    return json({
      service: "portfolio",
      version: "1.0",
      sections: SECTION_KEYS,
      endpoints: [
        "/v1/portfolio",
        "/v1/portfolio/sections",
        "/v1/portfolio/list",
        "/v1/portfolio/full",
        "/v1/portfolio/section/:section",
        "/v1/portfolio/search?q=",
      ],
    });
  }

  if (path === "sections") {
    return json({ sections: SECTION_KEYS });
  }

  if (path === "list") {
    return json({
      count: SECTION_KEYS.length,
      items: SECTION_KEYS.map((section) => ({
        section,
        hasData: portfolioData[section] !== undefined,
      })),
    });
  }

  if (path === "full") {
    return json({ sections: portfolioData });
  }

  if (path === "search") {
    const q = safeTrim(query).toLowerCase();
    if (!q) return json({ error: "Missing ?q=" }, 400);

    const results = SECTION_KEYS.filter((section) =>
      JSON.stringify(portfolioData[section]).toLowerCase().includes(q)
    ).map((section) => ({
      section,
      data: portfolioData[section],
    }));

    return json({
      query: q,
      count: results.length,
      results,
    });
  }

  if (path.startsWith("section/")) {
    const section = safeTrim(path.replace(/^section\//, ""));
    if (!isCollection(section)) {
      return json(
        {
          error: "Not found",
          section,
          allowed: SECTION_KEYS,
        },
        404
      );
    }

    return json({
      section,
      data: portfolioData[section],
    });
  }

  if (isCollection(path) && method === "GET") {
    return json({
      section: path,
      data: portfolioData[path],
    });
  }

  return json(
    {
      error: "Not found",
      path,
      method,
    },
    404
  );
}
