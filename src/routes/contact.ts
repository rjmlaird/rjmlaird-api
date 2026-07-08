import type { APIRoute } from "astro";
import { json } from "../lib/jsonResponse";

import contact from "../data/contact.json";
import socials from "../data/socials.json";

export type ContactCollection = "contact" | "socials";

const SECTION_KEYS = ["contact", "socials"] as const satisfies readonly ContactCollection[];

const contactData = {
  contact,
  socials,
} satisfies Record<ContactCollection, unknown>;

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isCollection(value: string): value is ContactCollection {
  return (SECTION_KEYS as readonly string[]).includes(value);
}

function getRoute(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/v1\/contact\/?/, "");
  const query = url.searchParams.get("q");
  return { path, query, url };
}

export async function handleContact(request: Request, _env: Env) {
  const method = request.method.toUpperCase();
  const { path } = getRoute(request);

  if (!path) {
    return json({
      service: "contact",
      version: "1.0",
      sections: SECTION_KEYS,
      endpoints: [
        "/v1/contact",
        "/v1/contact/sections",
        "/v1/contact/list",
        "/v1/contact/full",
        "/v1/contact/section/:section",
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
        hasData: contactData[section] !== undefined,
      })),
    });
  }

  if (path === "full") {
    return json({ sections: contactData });
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
      data: contactData[section],
    });
  }

  if (isCollection(path) && method === "GET") {
    return json({
      section: path,
      data: contactData[path],
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
  return handleContact(request, locals as Env);
};
