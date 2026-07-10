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

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isCollection(value: string): value is ActivitiesCollection {
  return (SECTION_KEYS as readonly string[]).includes(value);
}

function getRoute(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/v1\/activities\/?/, "");
  const query = url.searchParams.get("q");
  return { path, query };
}

app.get("*", async (c) => {
  const request = c.req.raw;
  const { path, query } = getRoute(request);

  if (!path) {
    return json({
      service: "activities",
      version: "1.0",
      sections: SECTION_KEYS,
      endpoints: [
        "/v1/activities",
        "/v1/activities/sections",
        "/v1/activities/list",
        "/v1/activities/full",
        "/v1/activities/section/:section",
        "/v1/activities/search?q=",
      ],
    });
  }

  if (path === "sections") return json({ sections: SECTION_KEYS });

  if (path === "list") {
    return json({
      count: SECTION_KEYS.length,
      items: SECTION_KEYS.map((section) => ({
        section,
        hasData: activitiesData[section] !== undefined,
      })),
    });
  }

  if (path === "full") return json({ sections: activitiesData });

  if (path === "search") {
    const q = safeTrim(query).toLowerCase();
    if (!q) return json({ error: "Missing ?q=" }, 400);

    const results = SECTION_KEYS.filter((section) =>
      JSON.stringify(activitiesData[section]).toLowerCase().includes(q)
    ).map((section) => ({ section, data: activitiesData[section] }));

    return json({ query: q, count: results.length, results });
  }

  if (path.startsWith("section/")) {
    const section = safeTrim(path.replace(/^section\//, ""));
    if (!isCollection(section)) {
      return json({ error: "Not found", section, allowed: SECTION_KEYS }, 404);
    }

    return json({ section, data: activitiesData[section] });
  }

  if (isCollection(path)) {
    return json({ section: path, data: activitiesData[path] });
  }

  return json({ error: "Not found", path, method: request.method }, 404);
});

export default app;
