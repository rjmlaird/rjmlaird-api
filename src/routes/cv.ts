import { Hono } from "hono";
import { json } from "../lib/jsonResponse";

import awards from "../data/awards.json";
import certifications from "../data/certifications.json";
import credly from "../data/credly.json";
import education from "../data/education.json";
import experience from "../data/experience.json";
import { languages } from "../data/languages";
import memberships from "../data/memberships.json";
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
  profile,
  skills,
  teaching,
  tools,
  volunteering,
} satisfies Record<CvCollection, unknown>;

const app = new Hono<{ Bindings: Env }>();

const isCollection = (value: string): value is CvCollection =>
  (SECTION_KEYS as readonly string[]).includes(value);

app.get("/", (c) =>
  json({
    service: "cv",
    version: "1.0",
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
  }),
);

app.get("/sections", (c) => json({ sections: SECTION_KEYS }));

app.get("/list", (c) =>
  json({
    count: SECTION_KEYS.length,
    items: SECTION_KEYS.map((section) => ({
      section,
      hasData: cvData[section] !== undefined,
    })),
  }),
);

app.get("/full", (c) => json({ sections: cvData }));

app.get("/search", (c) => {
  const q = c.req.query("q")?.trim().toLowerCase();
  if (!q) return json({ error: "Missing ?q=" }, 400);

  const results = SECTION_KEYS.filter((section) =>
    JSON.stringify(cvData[section]).toLowerCase().includes(q),
  ).map((section) => ({ section, data: cvData[section] }));

  return json({ query: q, count: results.length, results });
});

app.get("/section/:section", (c) => {
  const section = c.req.param("section");
  if (!isCollection(section)) {
    return json({ error: "Not found", section, allowed: SECTION_KEYS }, 404);
  }

  return json({ section, data: cvData[section] });
});

app.get("/:collection", (c) => {
  const collection = c.req.param("collection");
  if (!isCollection(collection)) {
    return json({ error: "Not found", collection, allowed: SECTION_KEYS }, 404);
  }

  return json({ section: collection, data: cvData[collection] });
});

export default app;
