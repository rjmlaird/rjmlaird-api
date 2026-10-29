import { Hono } from "hono";
import { json } from "../lib/jsonResponse";
import { link, respond } from "../lib/http";

import awards from "../data/awards.json";
import certifications from "../data/certifications.json";
import credly from "../data/credly.json";
import education from "../data/education.json";
import experience from "../data/experience.json";
import { languages } from "../data/languages";
import memberships from "../data/memberships.json";
import organisations from "../data/organisations.json";
import profile from "../data/profile.json";
import skills from "../data/skills.json";
import teaching from "../data/teaching.json";
import { tools } from "../data/tools";
import volunteering from "../data/volunteering.json";

export type CvCollection =
  | "awards"
  | "certifications"
  | "credly"
  | "education"
  | "experience"
  | "languages"
  | "memberships"
  | "organisations"
  | "profile"
  | "skills"
  | "teaching"
  | "tools"
  | "volunteering";

const SECTION_KEYS = [
  "awards",
  "certifications",
  "credly",
  "education",
  "experience",
  "languages",
  "memberships",
  "organisations",
  "profile",
  "skills",
  "teaching",
  "tools",
  "volunteering",
] as const satisfies readonly CvCollection[];

const cvData = {
  awards,
  certifications,
  credly,
  education,
  experience,
  languages,
  memberships,
  organisations,
  profile,
  skills,
  teaching,
  tools,
  volunteering,
} satisfies Record<CvCollection, unknown>;


const app = new Hono<{ Bindings: Env }>();

const isCollection = (value: string): value is CvCollection =>
  (SECTION_KEYS as readonly string[]).includes(value);

const countOf = (value: unknown): number => {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") {
    const values = Object.values(value as Record<string, unknown>);
    // Wrapper objects such as { awards: [...] } count their single array.
    if (values.length === 1 && Array.isArray(values[0])) return values[0].length;
    return values.length;
  }
  return 0;
};

const pick = (source: unknown, keys: string[]) => {
  const src = (source ?? {}) as Record<string, unknown>;
  return Object.fromEntries(keys.filter((k) => src[k] !== undefined).map((k) => [k, src[k]]));
};

// GET /v1/cv: index plus a public summary. The summary only repeats fields already public at /v1/cv/profile.
app.get("/", (c) =>
  respond(c, {
    service: "cv",
    version: "1.1",
    sections: SECTION_KEYS,
    endpoints: [
      "/v1/cv",
      "/v1/cv/sections",
      "/v1/cv/list",
      "/v1/cv/full",
      "/v1/cv/section/:section",
      "/v1/cv/:collection",
      "/v1/cv/search?q=",
    ],
    profile: pick(profile, ["name", "displayName", "headline", "shortBio", "location"]),
    counts: Object.fromEntries(SECTION_KEYS.map((k) => [k, countOf(cvData[k])])),
    links: {
      self: link(c, "/v1/cv"),
      profile: link(c, "/v1/cv/profile"),
      cv: "https://cv.rjmlaird.co.uk/",
      bio: link(c, "/v1/bio"),
      research: link(c, "/v1/research"),
      openapi: link(c, "/openapi.json"),
    },
  }),
);

app.get("/sections", () => json({ sections: SECTION_KEYS }));

app.get("/list", () =>
  json({
    count: SECTION_KEYS.length,
    items: SECTION_KEYS.map((section) => ({
      section,
      hasData: cvData[section] !== undefined,
    })),
  }),
);

app.get("/full", () => json({ sections: cvData }));

app.get("/search", (c) => {
  const q = c.req.query("q")?.trim().toLowerCase();

  if (!q) {
    return json({ error: "Missing ?q=" }, 400);
  }

  const results = SECTION_KEYS
    .filter((section) =>
      JSON.stringify(cvData[section]).toLowerCase().includes(q),
    )
    .map((section) => ({
      section,
      data: cvData[section],
    }));

  return json({
    query: q,
    count: results.length,
    results,
  });
});

app.get("/section/:section", (c) => {
  const section = c.req.param("section");

  if (!isCollection(section)) {
    return json(
      {
        error: "Not found",
        section,
        allowed: SECTION_KEYS,
      },
      404,
    );
  }

  return json({
    section,
    data: cvData[section],
  });
});

app.get("/:collection", (c) => {
  const collection = c.req.param("collection");

  if (!isCollection(collection)) {
    return json(
      {
        error: "Not found",
        collection,
        allowed: SECTION_KEYS,
      },
      404,
    );
  }

  return json({
    section: collection,
    data: cvData[collection],
  });
});

export default app;
