import { Hono } from "hono";
import research from "../data/research.json";
import publicBib from "../data/publications.public.bib";
import { errorResponse, link, matches, paginate, parsePage, parseQuery, respond } from "../lib/http";

type Pub = (typeof research.items)[number];

const items: Pub[] = research.items;
const byId = new Map(items.map((p) => [p.id, p]));
const types = [...new Set(items.map((p) => p.type))].sort();
const meta = { version: research.version, total: research.count, source: "https://api.rjmlaird.co.uk/v1/research" };

const compact = (c: Parameters<typeof link>[0], p: Pub) => ({ ...p, self: link(c, `/v1/research/${p.id}`) });

const app = new Hono();

// GET /v1/research?year=&type=&author=&q=&sort=year|title&limit=&offset=
app.get("/", (c) => {
  const { year, type, author, q, sort } = c.req.query();

  if (year && !/^\d{4}$/.test(year)) return errorResponse(c, 400, "year must be a four-digit year");
  if (type && !types.includes(type)) return errorResponse(c, 400, "Unknown type", { type, allowed: types });
  if (sort && !["year", "title"].includes(sort)) return errorResponse(c, 400, "Unknown sort", { sort, allowed: ["year", "title"] });
  const query = parseQuery(q);
  if (query && typeof query === "object") return errorResponse(c, 400, query.error);
  const authorQuery = parseQuery(author);
  if (authorQuery && typeof authorQuery === "object") return errorResponse(c, 400, authorQuery.error);
  const page = parsePage(c.req.query(), { defaultLimit: 50, maxLimit: 100 });
  if ("error" in page) return errorResponse(c, 400, page.error);

  let list = items;
  if (year) list = list.filter((p) => String(p.year) === year);
  if (type) list = list.filter((p) => p.type === type);
  if (authorQuery) list = list.filter((p) => matches(authorQuery, ...p.authors));
  if (query) list = list.filter((p) => matches(query, p.title, p.venue, ...p.authors));
  if (sort === "title") list = [...list].sort((a, b) => a.title.localeCompare(b.title, "en"));

  const { items: slice, meta: pageMeta } = paginate(list, page);
  const byYear: Record<string, number> = {};
  for (const p of list) byYear[String(p.year ?? "undated")] = (byYear[String(p.year ?? "undated")] ?? 0) + 1;

  return respond(c, {
    data: slice.map((p) => compact(c, p)),
    meta: {
      ...meta,
      ...pageMeta,
      filters: { year: year ?? null, type: type ?? null, author: author ?? null, q: q ?? null, sort: sort ?? "year" },
      byYear,
      types,
    },
    links: {
      self: link(c, "/v1/research"),
      bibtex: link(c, "/v1/research/publications.bib"),
      portfolio: link(c, "/v1/portfolio"),
    },
  });
});

// Sanitised BibTeX for reference managers: no local file paths, no publisher abstracts.
app.get("/publications.bib", () =>
  new Response(publicBib, {
    headers: {
      "Content-Type": "application/x-bibtex; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "CDN-Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  }),
);

app.get("/:id", (c) => {
  const id = c.req.param("id");
  const pub = byId.get(id);
  if (!pub) {
    return errorResponse(c, 404, "Publication not found", { id, list: link(c, "/v1/research") });
  }
  return respond(c, {
    data: compact(c, pub),
    meta,
    links: { self: link(c, `/v1/research/${pub.id}`), list: link(c, "/v1/research"), ...(pub.url ? { publisher: pub.url } : {}) },
  });
});

export default app;
