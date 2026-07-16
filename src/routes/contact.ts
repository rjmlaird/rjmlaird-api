import { Hono } from "hono";
import { json } from "../lib/jsonResponse";

import socials from "../data/socials.json";

export type ContactCollection = "socials";

const SECTION_KEYS = ["socials"] as const satisfies readonly ContactCollection[];

const contactData = {
  socials,
} satisfies Record<ContactCollection, unknown>;

const app = new Hono<{ Bindings: Env }>();

const isCollection = (value: string): value is ContactCollection =>
  (SECTION_KEYS as readonly string[]).includes(value);

app.get("/", (c) =>
  json({
    service: "contact",
    version: "1.0",
    sections: SECTION_KEYS,
    endpoints: [
      "/v1/contact",
      "/v1/contact/sections",
      "/v1/contact/list",
      "/v1/contact/full",
      "/v1/contact/section/:section",
      "/v1/contact/:collection",
      "/v1/contact/search?q=",
    ],
  }),
);

app.get("/sections", (c) => json({ sections: SECTION_KEYS }));

app.get("/list", (c) =>
  json({
    count: SECTION_KEYS.length,
    items: SECTION_KEYS.map((section) => ({
      section,
      hasData: contactData[section] !== undefined,
    })),
  }),
);

app.get("/full", (c) => json({ sections: contactData }));

app.get("/search", (c) => {
  const q = c.req.query("q")?.trim().toLowerCase();
  if (!q) return json({ error: "Missing ?q=" }, 400);

  const results = SECTION_KEYS.filter((section) =>
    JSON.stringify(contactData[section]).toLowerCase().includes(q),
  ).map((section) => ({ section, data: contactData[section] }));

  return json({ query: q, count: results.length, results });
});

app.get("/section/:section", (c) => {
  const section = c.req.param("section");
  if (!isCollection(section)) {
    return json({ error: "Not found", section, allowed: SECTION_KEYS }, 404);
  }

  return json({ section, data: contactData[section] });
});

app.get("/:collection", (c) => {
  const collection = c.req.param("collection");
  if (!isCollection(collection)) {
    return json({ error: "Not found", collection, allowed: SECTION_KEYS }, 404);
  }

  return json({ section: collection, data: contactData[collection] });
});

export default app;
