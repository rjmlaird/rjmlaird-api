import { Hono } from "hono";
import { json } from "../lib/jsonResponse";
import organisations from "../data/organisations.json";
import { unCountries } from "../data/unCountries";

export type GeneralCollection = "organisations" | "unCountries";

const SECTION_KEYS = ["organisations", "unCountries"] as const satisfies readonly GeneralCollection[];

const generalData = {
  organisations,
  unCountries,
} satisfies Record<GeneralCollection, unknown>;

const app = new Hono<{ Bindings: Env }>();

const isCollection = (value: string): value is GeneralCollection =>
  (SECTION_KEYS as readonly string[]).includes(value);

app.get("/", (c) =>
  json({
    service: "general",
    version: "1.0",
    sections: SECTION_KEYS,
    endpoints: [
      "/v1/general",
      "/v1/general/sections",
      "/v1/general/list",
      "/v1/general/full",
      "/v1/general/section/:section",
      "/v1/general/:collection",
      "/v1/general/search?q=",
    ],
  }),
);

app.get("/sections", (c) => json({ sections: SECTION_KEYS }));

app.get("/list", (c) =>
  json({
    count: SECTION_KEYS.length,
    items: SECTION_KEYS.map((section) => ({
      section,
      hasData: generalData[section] !== undefined,
    })),
  }),
);

app.get("/full", (c) => json({ sections: generalData }));

app.get("/search", (c) => {
  const q = c.req.query("q")?.trim().toLowerCase();
  if (!q) return json({ error: "Missing ?q=" }, 400);

  const results = SECTION_KEYS.filter((section) =>
    JSON.stringify(generalData[section]).toLowerCase().includes(q),
  ).map((section) => ({ section, data: generalData[section] }));

  return json({ query: q, count: results.length, results });
});

app.get("/section/:section", (c) => {
  const section = c.req.param("section");
  if (!isCollection(section)) {
    return json({ error: "Not found", section, allowed: SECTION_KEYS }, 404);
  }

  return json({ section, data: generalData[section] });
});

app.get("/:collection", (c) => {
  const collection = c.req.param("collection");
  if (!isCollection(collection)) {
    return json({ error: "Not found", collection, allowed: SECTION_KEYS }, 404);
  }

  return json({ section: collection, data: generalData[collection] });
});

export default app;
