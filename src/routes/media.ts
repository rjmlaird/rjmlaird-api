import { Hono } from "hono";
import { json } from "../lib/jsonResponse";

// Data imports
import videos from "../data/videos.json";
import podcasts from "../data/podcasts.json";

export type MediaCollection = "videos" | "podcasts";

const SECTION_KEYS = [
  "videos",
  "podcasts",
] as const satisfies readonly MediaCollection[];

const mediaData = {
  videos,
  podcasts,
} satisfies Record<MediaCollection, unknown>;

const app = new Hono<{ Bindings: Env }>();

const isCollection = (value: string): value is MediaCollection =>
  (SECTION_KEYS as readonly string[]).includes(value);

// --- Shared helpers ---

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

app.get("/", (c) =>
  json({
    service: "media",
    version: "1.0",
    sections: SECTION_KEYS,
    endpoints: [
      "/v1/media",
      "/v1/media/sections",
      "/v1/media/list",
      "/v1/media/full",
      "/v1/media/section/:section",
      "/v1/media/:collection",
      "/v1/media/search?q=",
      "/v1/media/videos?status=&tag=&featured=&category=",
      "/v1/media/video/:slug",
      "/v1/media/podcasts?status=&tag=&featured=&category=",
      "/v1/media/podcast/:slug",
    ],
  }),
);

app.get("/sections", (c) => json({ sections: SECTION_KEYS }));

app.get("/list", (c) =>
  json({
    count: SECTION_KEYS.length,
    items: SECTION_KEYS.map((section) => ({
      section,
      hasData: mediaData[section] !== undefined,
    })),
  }),
);

app.get("/full", (c) => json({ sections: mediaData }));

// --- Videos ---

app.get("/videos", (c) => {
  const query = c.req.query();
  const results = applyFilters(videos as Item[], query);
  return json({ count: results.length, items: results });
});

app.get("/video/:slug", (c) => {
  const slug = c.req.param("slug");
  const video = findBySlug(videos as Item[], slug);

  if (!video) return json({ error: "Video not found", slug }, 404);
  return json(video);
});

// --- Podcasts ---

app.get("/podcasts", (c) => {
  const query = c.req.query();
  const results = applyFilters(podcasts as Item[], query);
  return json({ count: results.length, items: results });
});

app.get("/podcast/:slug", (c) => {
  const slug = c.req.param("slug");
  const podcast = findBySlug(podcasts as Item[], slug);

  if (!podcast) return json({ error: "Podcast not found", slug }, 404);
  return json(podcast);
});

// --- Cross-collection search ---

app.get("/search", (c) => {
  const q = c.req.query("q")?.trim().toLowerCase();
  if (!q) return json({ error: "Missing ?q=" }, 400);

  const results = SECTION_KEYS.filter((section) =>
    JSON.stringify(mediaData[section]).toLowerCase().includes(q),
  ).map((section) => ({ section, data: mediaData[section] }));

  return json({ query: q, count: results.length, results });
});

app.get("/section/:section", (c) => {
  const section = c.req.param("section");
  if (!isCollection(section)) {
    return json({ error: "Not found", section, allowed: SECTION_KEYS }, 404);
  }

  return json({ section, data: mediaData[section] });
});

app.get("/:collection", (c) => {
  const collection = c.req.param("collection");
  if (!isCollection(collection)) {
    return json({ error: "Not found", collection, allowed: SECTION_KEYS }, 404);
  }

  return json({ section: collection, data: mediaData[collection] });
});

export default app;