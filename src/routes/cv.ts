import type { APIRoute } from "astro";
import { json } from "../lib/jsonResponse";

import awards from "../data/awards.json";
import certifications from "../data/certifications.json";
import education from "../data/education.json";
import experience from "../data/experience.json";
import { languages } from "../data/languages";
import memberships from "../data/memberships.json";
import profile from "../data/profile.json";
import skills from "../data/skills.json";
import teaching from "../data/teaching.json";
import { tools } from "../data/tools";

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
  | "tools";

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
] as const satisfies readonly CvCollection[];

const cvData = {
  awards,
  certifications,
  credly: [],
  education,
  experience,
  languages,
  memberships,
  profile,
  skills,
  teaching,
  tools,
} satisfies Record<CvCollection, unknown>;

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isCollection(value: string): value is CvCollection {
  return (SECTION_KEYS as readonly string[]).includes(value);
}

function getRoute(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/v1\/cv\/?/, "");
  const query = url.searchParams.get("q");
  return { path, query, url };
}

export async function handleCv(request: Request, _env: Env) {
  const method = request.method.toUpperCase();
  const { path, query } = getRoute(request);

  if (!path) {
    return json({
      service: "cv",
      version: "1.0",
      sections: SECTION_KEYS,
      endpoints: [
        "/v1/cv",
        "/v1/cv/sections",
        "/v1/cv/list",
        "/v1/cv/full",
        "/v1/cv/section/:section",
        "/v1/cv/search?q=",
      ],
    });
  }

  if (path === "sections") {
    return json({ sections: SECTION_KEYS });
  }

  if (path === "list") {
    return json({
      count: SECTION_KEYS.length,
      items: SECTION_KEYS.map((section) => ({
        section,
        hasData: cvData[section] !== undefined,
      })),
    });
  }

  if (path === "full") {
    return json({ sections: cvData });
  }

  if (path === "search") {
    const q = safeTrim(query).toLowerCase();
    if (!q) return json({ error: "Missing ?q=" }, 400);

    const results = SECTION_KEYS.filter((section) =>
      JSON.stringify(cvData[section]).toLowerCase().includes(q)
    ).map((section) => ({
      section,
      data: cvData[section],
    }));

    return json({
      query: q,
      count: results.length,
      results,
    });
  }

  if (path.startsWith("section/")) {
    const section = safeTrim(path.replace(/^section\//, ""));
    if (!isCollection(section)) {
      return json(
        {
          error: "Not found",
          section,
          allowed: SECTION_KEYS,
        },
        404
      );
    }

    return json({
      section,
      data: cvData[section],
    });
  }

  if (isCollection(path) && method === "GET") {
    return json({
      section: path,
      data: cvData[path],
    });
  }

  return json(
    {
      error: "Not found",
      path,
      method,
    },
    404
  );
}

export const GET: APIRoute = async ({ request, locals }) => {
  return handleCv(request, locals as Env);
};
