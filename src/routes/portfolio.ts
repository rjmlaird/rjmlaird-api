import { Hono } from "hono";
import { json } from "../lib/jsonResponse";

import initiatives from "../data/initiatives.json";
import reviews from "../data/reviews.json";
import teaching from "../data/teaching.json";
import publicationsText from "../data/publications.txt";

export type PortfolioCollection = "initiatives" | "reviews" | "teaching" | "research";

const SECTION_KEYS = ["initiatives", "reviews", "teaching", "research"] as const satisfies readonly PortfolioCollection[];

const portfolioData = {
  initiatives,
  reviews,
  teaching,
  research: publicationsText,
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
      "/v1/portfolio/search?q=",
      "/v1/portfolio/publications.bib",
    ],
  }),
);

app.get("/publications.bib", (c) =>
  new Response(publicationsText, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
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
