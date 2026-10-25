// One router factory for the three build catalogues (apps, tools, labs). They share a schema
// (see scripts/build-labs.mjs and the apps/tools exporters), so they share behaviour.
import { Hono } from "hono";
import { csv, errorResponse, hashString, link, matches, paginate, parsePage, parseQuery, respond } from "../lib/http";

export type Build = {
  id: string;
  sourceId: string;
  type: string;
  title: string;
  description: string;
  group: string;
  tech: string[];
  status: string;
  updated: string;
  repository: string;
  // Planned entries have no live URL or source folder yet.
  path?: string;
  url?: string;
  sourcePath?: string;
  source?: string;
};

export type Catalogue = {
  schemaVersion: number;
  origin: string;
  repository: string;
  sourceRef: string;
  groups: { id: string; name: string; blurb: string }[];
  statuses: Record<string, { label: string; order: number }>;
  builds: Build[];
};

// "Live" means usable today. Planned and archived items stay queryable but never lead a list.
const LIVE = new Set(["active", "in-progress"]);

export function catalogueRouter(name: "apps" | "tools" | "labs", cat: Catalogue) {
  const app = new Hono();
  const statusIds = Object.keys(cat.statuses);
  const groupIds = cat.groups.map((g) => g.id);
  const order = (s: string) => cat.statuses[s]?.order ?? 99;
  const version = hashString(JSON.stringify(cat.builds)).slice(0, 12);
  const updatedAt = cat.builds.map((b) => b.updated).sort().at(-1) ?? null;
  const byStatus = (list: Build[]) => {
    const out: Record<string, number> = {};
    for (const b of list) out[b.status] = (out[b.status] ?? 0) + 1;
    return out;
  };
  const base = {
    catalogue: name,
    origin: cat.origin,
    repository: cat.repository,
    version,
    updatedAt,
  };
  const sorted = [...cat.builds].sort(
    (a, b) => order(a.status) - order(b.status) || a.title.localeCompare(b.title, "en"),
  );
  const decorate = (c: Parameters<typeof link>[0], b: Build) => ({
    ...b,
    path: b.path ?? null,
    url: b.url ?? null,
    sourcePath: b.sourcePath ?? null,
    source: b.source ?? null,
    statusLabel: cat.statuses[b.status]?.label ?? b.status,
    self: link(c, `/v1/${name}/${b.sourceId}`),
  });

  // GET /v1/{apps|tools|labs}?status=&group=&tech=&q=&live=true&sort=status|title|updated&limit=&offset=
  app.get("/", (c) => {
    const { status, group, tech, q, live, sort } = c.req.query();

    const statuses = csv(status);
    const bad = statuses.find((s) => !statusIds.includes(s));
    if (bad) return errorResponse(c, 400, "Unknown status", { status: bad, allowed: statusIds });
    if (group && !groupIds.includes(group)) return errorResponse(c, 400, "Unknown group", { group, allowed: groupIds });
    if (live && !["true", "false"].includes(live)) return errorResponse(c, 400, "live must be true or false");
    if (sort && !["status", "title", "updated"].includes(sort)) {
      return errorResponse(c, 400, "Unknown sort", { sort, allowed: ["status", "title", "updated"] });
    }
    const query = parseQuery(q);
    if (query && typeof query === "object") return errorResponse(c, 400, query.error);
    const page = parsePage(c.req.query(), { defaultLimit: 100, maxLimit: 100 });
    if ("error" in page) return errorResponse(c, 400, page.error);

    let list = sort === "title"
      ? [...cat.builds].sort((a, b) => a.title.localeCompare(b.title, "en"))
      : sort === "updated"
        ? [...cat.builds].sort((a, b) => b.updated.localeCompare(a.updated) || a.title.localeCompare(b.title, "en"))
        : sorted;
    if (statuses.length) list = list.filter((b) => statuses.includes(b.status));
    if (live === "true") list = list.filter((b) => LIVE.has(b.status));
    if (live === "false") list = list.filter((b) => !LIVE.has(b.status));
    if (group) list = list.filter((b) => b.group === group);
    if (tech) list = list.filter((b) => b.tech.some((t) => t.toLowerCase() === tech.toLowerCase()));
    if (query) list = list.filter((b) => matches(query, b.title, b.description, b.sourceId, ...b.tech));

    const { items, meta } = paginate(list, page);
    return respond(c, {
      data: items.map((b) => decorate(c, b)),
      meta: {
        ...base,
        ...meta,
        overall: { total: cat.builds.length, live: cat.builds.filter((b) => LIVE.has(b.status)).length, byStatus: byStatus(cat.builds) },
        filters: { status: statuses, group: group ?? null, tech: tech ?? null, q: q ?? null, live: live ?? null, sort: sort ?? "status" },
      },
      links: {
        self: link(c, `/v1/${name}`),
        groups: link(c, `/v1/${name}/groups`),
        site: cat.origin + "/",
        repository: cat.repository,
      },
    });
  });

  app.get("/groups", (c) =>
    respond(c, {
      data: cat.groups.map((g) => {
        const members = cat.builds.filter((b) => b.group === g.id);
        return {
          ...g,
          count: members.length,
          live: members.filter((b) => LIVE.has(b.status)).length,
          self: link(c, `/v1/${name}?group=${g.id}`),
        };
      }),
      meta: { ...base, statuses: cat.statuses },
      links: { list: link(c, `/v1/${name}`) },
    }),
  );

  app.get("/:slug", (c) => {
    const slug = c.req.param("slug").toLowerCase();
    const build = cat.builds.find((b) => b.sourceId === slug || b.id === `${name}/${slug}`);
    if (!build) {
      return errorResponse(c, 404, `${name.slice(0, -1)} not found`, {
        slug,
        list: link(c, `/v1/${name}`),
      });
    }
    return respond(c, {
      data: decorate(c, build),
      meta: base,
      links: { self: link(c, `/v1/${name}/${build.sourceId}`), list: link(c, `/v1/${name}`), open: build.url ?? null, source: build.source ?? null },
    });
  });

  return app;
}
