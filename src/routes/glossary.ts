import { Hono } from "hono";
import glossaryData from "../data/glossary.json";
import { errorResponse, fold, link, matches, paginate, parsePage, parseQuery, respond } from "../lib/http";

type Term = (typeof glossaryData.terms)[number];

const BASE = glossaryData.source.replace(/\/$/, "");
const terms: Term[] = glossaryData.terms;
const categories = glossaryData.categories;
const categoryIds = categories.map((c) => c.id);
const categoryLabel = new Map(categories.map((c) => [c.id, c.label]));
const bySlug = new Map(terms.map((t) => [t.slug, t]));

// Alias lookup uses the same folding as search, so "ETL pipeline" and "etl-pipeline" both resolve.
const byAlias = new Map<string, Term>();
for (const t of terms) for (const a of t.aliases) byAlias.set(fold(a), t);

const sortKey = (t: Term) => fold(t.term);
const alphabetical = [...terms].sort((a, b) => sortKey(a).localeCompare(sortKey(b), "en"));
const letterOf = (t: Term) => {
  const c = sortKey(t).charAt(0);
  return /[a-z]/.test(c) ? c : "#";
};

const compact = (c: Parameters<typeof link>[0], t: Term) => ({
  slug: t.slug,
  term: t.term,
  category: t.category,
  aliases: t.aliases,
  short: t.short,
  updated: t.updated,
  url: t.url,
  self: link(c, `/v1/glossary/${t.slug}`),
});

const termSet = {
  "@type": "DefinedTermSet",
  "@id": `${BASE}/#termset`,
  name: "rjmlaird glossary",
  url: `${BASE}/`,
};

const toDefinedTerm = (t: Term) => ({
  "@type": "DefinedTerm",
  "@id": `${t.url}#term`,
  name: t.term,
  description: t.short,
  termCode: t.slug,
  url: t.url,
  inDefinedTermSet: { "@id": termSet["@id"] },
  ...(t.aliases.length ? { alternateName: t.aliases } : {}),
  dateModified: t.updated,
});

const LD = "application/ld+json; charset=utf-8";
const meta = { version: glossaryData.version, updatedAt: glossaryData.updatedAt, source: glossaryData.source };

const app = new Hono();

// GET /v1/glossary?category=&letter=&q=&sort=&expand=definition&format=jsonld&limit=&offset=
app.get("/", (c) => {
  const { category, letter, q, sort, expand, format } = c.req.query();

  if (category && !categoryIds.includes(category)) {
    return errorResponse(c, 400, "Unknown category", { category, allowed: categoryIds });
  }
  if (letter && !/^([a-z]|#)$/i.test(letter)) {
    return errorResponse(c, 400, "letter must be a single letter A–Z, or # for terms starting with a digit");
  }
  if (sort && !["term", "updated"].includes(sort)) {
    return errorResponse(c, 400, "Unknown sort", { sort, allowed: ["term", "updated"] });
  }
  if (expand && expand !== "definition") {
    return errorResponse(c, 400, "Unknown expand", { expand, allowed: ["definition"] });
  }
  if (format && format !== "jsonld") {
    return errorResponse(c, 400, "Unknown format", { format, allowed: ["jsonld"] });
  }
  const query = parseQuery(q);
  if (query && typeof query === "object") return errorResponse(c, 400, query.error);
  const page = parsePage(c.req.query(), { defaultLimit: 50, maxLimit: 250 });
  if ("error" in page) return errorResponse(c, 400, page.error);

  let list = sort === "updated"
    ? [...terms].sort((a, b) => b.updated.localeCompare(a.updated) || sortKey(a).localeCompare(sortKey(b), "en"))
    : alphabetical;
  if (category) list = list.filter((t) => t.category === category);
  if (letter) list = list.filter((t) => letterOf(t) === letter.toLowerCase());
  if (query) list = list.filter((t) => matches(query, t.term, t.slug, t.short, ...t.aliases));

  if (format === "jsonld") {
    return respond(
      c,
      {
        "@context": "https://schema.org",
        ...termSet,
        hasDefinedTerm: list.map(toDefinedTerm),
      },
      { contentType: LD },
    );
  }

  const { items, meta: pageMeta } = paginate(list, page);
  return respond(c, {
    data: items.map((t) =>
      expand === "definition"
        ? { ...compact(c, t), definition: t.definition, related: t.related }
        : compact(c, t),
    ),
    meta: { ...meta, ...pageMeta, filters: { category: category ?? null, letter: letter ?? null, q: q ?? null, sort: sort ?? "term" } },
    links: {
      self: link(c, "/v1/glossary"),
      categories: link(c, "/v1/glossary/categories"),
      letters: link(c, "/v1/glossary/letters"),
      site: `${BASE}/`,
      jsonld: link(c, "/v1/glossary?format=jsonld"),
    },
  });
});

app.get("/categories", (c) =>
  respond(c, {
    data: categories.map((cat) => ({
      ...cat,
      self: link(c, `/v1/glossary?category=${cat.id}`),
    })),
    meta: { ...meta, count: categories.length, total: terms.length },
    links: { glossary: link(c, "/v1/glossary") },
  }),
);

app.get("/letters", (c) => {
  const counts = new Map<string, number>();
  for (const t of terms) counts.set(letterOf(t), (counts.get(letterOf(t)) ?? 0) + 1);
  const order = [..."abcdefghijklmnopqrstuvwxyz", "#"];
  return respond(c, {
    data: order
      .filter((l) => counts.has(l))
      .map((l) => ({ letter: l, count: counts.get(l)!, self: link(c, `/v1/glossary?letter=${encodeURIComponent(l)}`) })),
    meta: { ...meta, total: terms.length },
    links: { glossary: link(c, "/v1/glossary") },
  });
});

// GET /v1/glossary/{slug}: also accepts an alias (resolved, with meta.matched = "alias").
app.get("/:slug", (c) => {
  const raw = c.req.param("slug");
  const format = c.req.query("format");
  if (format && format !== "jsonld") {
    return errorResponse(c, 400, "Unknown format", { format, allowed: ["jsonld"] });
  }

  const direct = bySlug.get(raw.toLowerCase());
  const aliased = direct ? undefined : byAlias.get(fold(raw));
  const term = direct ?? aliased;

  if (!term) {
    const f = fold(raw);
    const suggestions = f
      ? alphabetical.filter((t) => fold(t.term).includes(f) || t.slug.includes(f.replace(/ /g, "-"))).slice(0, 5)
      : [];
    return errorResponse(c, 404, "Term not found", {
      slug: raw,
      suggestions: suggestions.map((t) => ({ slug: t.slug, term: t.term })),
      search: link(c, `/v1/glossary?q=${encodeURIComponent(raw)}`),
    });
  }

  if (format === "jsonld") {
    return respond(c, { "@context": "https://schema.org", ...toDefinedTerm(term), inDefinedTermSet: termSet }, { contentType: LD });
  }

  return respond(c, {
    data: {
      ...compact(c, term),
      category: { id: term.category, label: categoryLabel.get(term.category) ?? term.category },
      definition: term.definition,
      related: term.related
        .map((s) => bySlug.get(s))
        .filter((t): t is Term => Boolean(t))
        .map((t) => ({ slug: t.slug, term: t.term, short: t.short, url: t.url, self: link(c, `/v1/glossary/${t.slug}`) })),
      lastReviewed: term.updated,
      source: term.url,
    },
    meta: { ...meta, matched: aliased ? "alias" : "slug", canonical: term.slug },
    links: {
      self: link(c, `/v1/glossary/${term.slug}`),
      page: term.url,
      jsonld: link(c, `/v1/glossary/${term.slug}?format=jsonld`),
      category: link(c, `/v1/glossary?category=${term.category}`),
    },
  });
});

export default app;
