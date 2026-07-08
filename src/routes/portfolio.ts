import { json } from "../lib/jsonResponse";

import initiatives from "../data/initiatives.json";
import reviews from "../data/reviews.json";
import teaching from "../data/teaching.json";
import publicationsText from "../data/publications.txt";

export type PortfolioCollection =
  | "initiatives"
  | "reviews"
  | "teaching"
  | "research";

const SECTION_KEYS = [
  "initiatives",
  "reviews",
  "teaching",
  "research",
] as const satisfies readonly PortfolioCollection[];

const portfolioData = {
  initiatives,
  reviews,
  teaching,
  research: publicationsText,
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
        "/v1/portfolio/publications.bib",
      ],
    });
  }

  if (path === "sections") return json({ sections: SECTION_KEYS });

  if (path === "list") {
    return json({
      count: SECTION_KEYS.length,
      items: SECTION_KEYS.map((section) => ({
        section,
        hasData: portfolioData[section] !== undefined,
      })),
    });
  }

  if (path === "full") return json({ sections: portfolioData });

  if (path === "search") {
    const q = safeTrim(query).toLowerCase();
    if (!q) return json({ error: "Missing ?q=" }, 400);

    const results = SECTION_KEYS.filter((section) =>
      JSON.stringify(portfolioData[section]).toLowerCase().includes(q)
    ).map((section) => ({ section, data: portfolioData[section] }));

    return json({ query: q, count: results.length, results });
  }

  if (path === "publications.bib" && method === "GET") {
    return new Response(publicationsText, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=3600",
      },
    });
  }

  if (path.startsWith("section/")) {
    const section = safeTrim(path.replace(/^section\//, ""));
    if (!isCollection(section)) {
      return json({ error: "Not found", section, allowed: SECTION_KEYS }, 404);
    }

    return json({ section, data: portfolioData[section] });
  }

  if (isCollection(path) && method === "GET") {
    return json({ section: path, data: portfolioData[path] });
  }

  return json({ error: "Not found", path, method }, 404);
}
