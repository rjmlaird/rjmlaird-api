import { Hono } from "hono";
import { json } from "../lib/jsonResponse";

import bio from "../data/bio.json";
import socials from "../data/socials.json";

export type BioSection =
  | "short"
  | "summary"
  | "roles"
  | "focus"
  | "profiles"
  | "links"
  | "contact";

const SECTION_KEYS = [
  "short",
  "summary",
  "roles",
  "focus",
  "profiles",
  "links",
  "contact",
] as const satisfies readonly BioSection[];

type SocialSource = (typeof socials.profiles)[number];

type Profile = {
  id: string;
  label: string;
  url: string;
  type?: string;
};

const socialById = new Map<string, SocialSource>(
  socials.profiles.map((social) => [social.key, social]),
);

const profiles: Profile[] = bio.profileIds
  .map((id) => socialById.get(id))
  .filter((social): social is SocialSource => social !== undefined)
  .map(({ key, name, url, type }) => ({
    id: key,
    label: name,
    url,
    ...(type ? { type } : {}),
  }));

const meta = {
  version: "1",
  updatedAt: bio.updatedAt,
};

const sections = {
  short: {
    displayName: bio.displayName,
    shortBio: bio.shortBio,
  },
  summary: {
    summary: bio.summary,
  },
  roles: {
    roles: bio.roles,
    related: {
      experience: "/v1/cv/experience",
    },
  },
  focus: {
    focus: bio.focus,
  },
  profiles: {
    profiles,
    related: {
      socials: "/v1/socials",
    },
  },
  links: {
    links: bio.links,
  },
  contact: {
    ...bio.contact,
    related: {
      contact: "/v1/contact",
    },
  },
} satisfies Record<BioSection, unknown>;

const isSection = (value: string): value is BioSection =>
  (SECTION_KEYS as readonly string[]).includes(value);

const app = new Hono<{ Bindings: Env }>();

app.get("/", () =>
  json({
    data: {
      id: bio.id,
      name: bio.name,
      displayName: bio.displayName,
      headline: bio.headline,
      shortBio: bio.shortBio,
      summary: bio.summary,
      location: bio.location,
      roles: bio.roles,
      focus: bio.focus,
      links: bio.links,
      related: bio.related,
    },
    meta,
  }),
);

app.get("/:section", (c) => {
  const section = c.req.param("section");

  if (!isSection(section)) {
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
    data: sections[section],
    meta,
  });
});

export default app;
