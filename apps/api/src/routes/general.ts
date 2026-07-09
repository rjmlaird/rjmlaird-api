// src/routes/general.ts
import { json } from "../lib/jsonResponse";
import organisations from "../data/organisations.json";
import { unCountries } from "../data/unCountries";

export type GeneralCollection = "organisations" | "unCountries";

const SECTION_KEYS = ["organisations", "unCountries"] as const satisfies readonly GeneralCollection[];

const generalData = {
  organisations,
  unCountries,
} satisfies Record<GeneralCollection, unknown>;

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isCollection(value: string): value is GeneralCollection {
  return (SECTION_KEYS as readonly string[]).includes(value);
}

function getRoute(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/v1\/general\/?/, "");
  const query = url.searchParams.get("q");
  return { path, query };
}

export async function handleGeneral(request: Request, _env: Env) {
  const method = request.method.toUpperCase();
  const { path, query } = getRoute(request);

  if (!path) {
    return json({
      service: "general",
      version: "1.0",
      sections: SECTION_KEYS,
      endpoints: [
        "/v1/general",
        "/v1/general/sections",
        "/v1/general/list",
        "/v1/general/full",
        "/v1/general/section/:section",
        "/v1/general/search?q=",
      ],
    });
  }

  if (path === "sections") return json({ sections: SECTION_KEYS });

  if (path === "list") {
    return json({
      count: SECTION_KEYS.length,
      items: SECTION_KEYS.map((section) => ({
        section,
        hasData: generalData[section] !== undefined,
      })),
    });
  }

  if (path === "full") return json({ sections: generalData });

  if (path === "search") {
    const q = safeTrim(query).toLowerCase();
    if (!q) return json({ error: "Missing ?q=" }, 400);

    const results = SECTION_KEYS.filter((section) =>
      JSON.stringify(generalData[section]).toLowerCase().includes(q)
    ).map((section) => ({ section, data: generalData[section] }));

    return json({ query: q, count: results.length, results });
  }

  if (path.startsWith("section/")) {
    const section = safeTrim(path.replace(/^section\//, ""));
    if (!isCollection(section)) {
      return json({ error: "Not found", section, allowed: SECTION_KEYS }, 404);
    }

    return json({ section, data: generalData[section] });
  }

  if (isCollection(path) && method === "GET") {
    return json({ section: path, data: generalData[path] });
  }

  return json({ error: "Not found", path, method }, 404);
}
