import { json } from "../lib/jsonResponse";

import achievements from "../data/achievements.json";
import awards from "../data/awards.json";
import certifications from "../data/certifications.json";
import contact from "../data/contact.json";
import credentials from "../data/credentials.json";
import credly from "../data/credly.json";
import education from "../data/education.json";
import events from "../data/events.json";
import eventsAttending from "../data/eventsAttending.json";
import experience from "../data/experience.json";
import initiatives from "../data/initiatives.json";
import { languages } from "../data/languages";
import memberships from "../data/memberships.json";
import organisations from "../data/organisations.json";
import personal from "../data/personal.json";
import profile from "../data/profile.json";
import projects from "../data/projects.json";
import reviews from "../data/reviews.json";
import services from "../data/services.json";
import skills from "../data/skills.json";
import socials from "../data/socials.json";
import talks from "../data/talks.json";
import teaching from "../data/teaching.json";
import { tools } from "../data/tools";
import { unCountries } from "../data/unCountries";

export type CvCollection =
  | "achievements"
  | "awards"
  | "certifications"
  | "contact"
  | "credentials"
  | "credly"
  | "education"
  | "events"
  | "eventsAttending"
  | "experience"
  | "initiatives"
  | "languages"
  | "memberships"
  | "organisations"
  | "personal"
  | "profile"
  | "projects"
  | "reviews"
  | "services"
  | "skills"
  | "socials"
  | "talks"
  | "teaching"
  | "tools"
  | "unCountries";

const SECTION_KEYS: CvCollection[] = [
  "achievements",
  "awards",
  "certifications",
  "contact",
  "credentials",
  "credly",
  "education",
  "events",
  "eventsAttending",
  "experience",
  "initiatives",
  "languages",
  "memberships",
  "organisations",
  "personal",
  "profile",
  "projects",
  "reviews",
  "services",
  "skills",
  "socials",
  "talks",
  "teaching",
  "tools",
  "unCountries",
];

const cvData: Record<CvCollection, unknown> = {
  achievements,
  awards,
  certifications,
  contact,
  credentials,
  credly,
  education,
  events,
  eventsAttending,
  experience,
  initiatives,
  languages,
  memberships,
  organisations,
  personal,
  profile,
  projects,
  reviews,
  services,
  skills,
  socials,
  talks,
  teaching,
  tools,
  unCountries,
};

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isCollection(value: string): value is CvCollection {
  return (SECTION_KEYS as string[]).includes(value);
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
    return json({
      sections: SECTION_KEYS,
    });
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
    return json({
      sections: cvData,
    });
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

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/v1/cv")) {
      return handleCv(request, env);
    }

    return json(
      {
        error: "Not found",
        path: url.pathname,
      },
      404
    );
  },
};
