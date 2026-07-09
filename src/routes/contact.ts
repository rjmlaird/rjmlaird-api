import { json } from "../lib/jsonResponse";

import socials from "../data/socials.json";

export type ContactCollection = "socials";

const SECTION_KEYS = ["socials"] as const satisfies readonly ContactCollection[];

const contactData = {
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
  return { path, query };
}

export async function handleContact(request: Request, _env: Env) {
  const method = request.method.toUpperCase();
  const { path, query } = getRoute(request);

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
        "/v1/contact/search?q=",
      ],
    });
  }

  if (path === "sections") return json({ sections: SECTION_KEYS });

  if (path === "list") {
    return json({
      count: SECTION_KEYS.length,
      items: SECTION_KEYS.map((section) => ({
        section,
        hasData: contactData[section] !== undefined,
      })),
    });
  }

  if (path === "full") return json({ sections: contactData });

  if (path === "search") {
    const q = safeTrim(query).toLowerCase();
    if (!q) return json({ error: "Missing ?q=" }, 400);

    const results = SECTION_KEYS.filter((section) =>
      JSON.stringify(contactData[section]).toLowerCase().includes(q)
    ).map((section) => ({ section, data: contactData[section] }));

    return json({ query: q, count: results.length, results });
  }

  if (path.startsWith("section/")) {
    const section = safeTrim(path.replace(/^section\//, ""));
    if (!isCollection(section)) {
      return json({ error: "Not found", section, allowed: SECTION_KEYS }, 404);
    }

    return json({ section, data: contactData[section] });
  }

  if (isCollection(path) && method === "GET") {
    return json({ section: path, data: contactData[path] });
  }

  return json({ error: "Not found", path, method }, 404);
}
