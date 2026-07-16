import { Hono } from "hono";
import { json } from "../lib/jsonResponse";
import eventsAttending from "../data/eventsAttending.json";
import talks from "../data/talks.json";

export type ActivitiesCollection = "eventsAttending" | "talks";

const SECTION_KEYS = ["eventsAttending", "talks"] as const satisfies readonly ActivitiesCollection[];

const activitiesData = {
  eventsAttending,
  talks,
} satisfies Record<ActivitiesCollection, unknown>;

const app = new Hono<{ Bindings: Env }>();

const isCollection = (value: string): value is ActivitiesCollection =>
  (SECTION_KEYS as readonly string[]).includes(value);

app.get("/", (c) =>
  json({
    service: "activities",
    version: "1.0",
    sections: SECTION_KEYS,
    endpoints: [
      "/v1/activities",
      "/v1/activities/sections",
      "/v1/activities/list",
      "/v1/activities/full",
      "/v1/activities/section/:section",
      "/v1/activities/:collection",
      "/v1/activities/search?q=",
    ],
  }),
);

app.get("/sections", (c) => json({ sections: SECTION_KEYS }));

app.get("/list", (c) =>
  json({
    count: SECTION_KEYS.length,
    items: SECTION_KEYS.map((section) => ({
      section,
      hasData: activitiesData[section] !== undefined,
    })),
  }),
);

app.get("/full", (c) => json({ sections: activitiesData }));

app.get("/search", (c) => {
  const q = c.req.query("q")?.trim().toLowerCase();
  if (!q) return json({ error: "Missing ?q=" }, 400);

  const results = SECTION_KEYS.filter((section) =>
    JSON.stringify(activitiesData[section]).toLowerCase().includes(q),
  ).map((section) => ({ section, data: activitiesData[section] }));

  return json({ query: q, count: results.length, results });
});

app.get("/section/:section", (c) => {
  const section = c.req.param("section");
  if (!isCollection(section)) {
    return json({ error: "Not found", section, allowed: SECTION_KEYS }, 404);
  }

  return json({ section, data: activitiesData[section] });
});

app.get("/:collection", (c) => {
  const collection = c.req.param("collection");
  if (!isCollection(collection)) {
    return json({ error: "Not found", collection, allowed: SECTION_KEYS }, 404);
  }

  return json({ section: collection, data: activitiesData[collection] });
});

export default app;
