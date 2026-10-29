import { describe, expect, it, vi } from "vitest";
import app from "../src/index";
import { openapi } from "../src/openapi";
import { probeSites } from "../src/routes/status";
import { sites } from "../src/lib/registry";

const get = (path: string, headers: Record<string, string> = {}) =>
  app.request(`https://api.rjmlaird.co.uk${path}`, { headers });
const body = async (path: string) => (await get(path)).json() as Promise<any>;

describe("discovery", () => {
  it("lists every required endpoint group in /v1", async () => {
    const j = await body("/v1");
    for (const k of ["cv", "portfolio", "research", "glossary", "tools", "apps", "labs", "status", "subdomains"]) {
      expect(j.endpoints[k], k).toBe(`/v1/${k}`);
    }
    expect(j.estate.directory).toContain("/v1/subdomains");
  });

  it("every documented path without parameters responds 200", async () => {
    const concrete = (p: string) =>
      p
        .replace("{slug}", "albedo")
        .replace("{id}", "main")
        .replace("{key}", "glossary")
        .replace("{section}", "profile")
        .replace("{collection}", "education");
    const failures: string[] = [];
    for (const raw of Object.keys(openapi.paths)) {
      let p = concrete(raw);
      // Per-resource examples that differ from the generic placeholders above.
      if (raw.startsWith("/v1/tools/{") || raw.startsWith("/v1/apps/{") || raw.startsWith("/v1/labs/{")) {
        p = p.replace("albedo", raw.includes("tools") ? "julian-date" : raw.includes("apps") ? "astrodash" : "n-body");
      }
      if (raw === "/v1/bio/{section}") p = "/v1/bio/summary";
      if (raw === "/v1/research/{id}") p = "/v1/research/marcu_bake_2018";
      if (raw === "/v1/cv/section/{section}") p = "/v1/cv/section/profile";
      if (raw === "/v1/cv/{collection}") p = "/v1/cv/education";
      if (raw === "/v1/portfolio/{collection}") p = "/v1/portfolio/projects";
      if (raw === "/v1/general/{collection}") p = "/v1/general/organisations";
      if (raw === "/v1/portfolio/section/{section}") p = "/v1/portfolio/section/projects";
      if (raw === "/v1/cv/search" || raw === "/v1/portfolio/search" || raw === "/v1/media/search") p += "?q=space";
      if (raw.startsWith("/v1/portfolio/project/") || raw.startsWith("/v1/portfolio/initiative/") || raw.startsWith("/v1/portfolio/case-study/") ||
          raw.startsWith("/v1/media/video/") || raw.startsWith("/v1/media/podcast/")) continue; // slugs depend on content; covered by their own routes
      if (raw === "/v1/status") p = "/v1/status";
      const res = await get(p);
      if (res.status !== 200) failures.push(`${raw} -> ${res.status}`);
    }
    expect(failures).toEqual([]);
  });
});

describe("glossary", () => {
  it("lists terms with pagination meta", async () => {
    const j = await body("/v1/glossary?limit=5");
    expect(j.data).toHaveLength(5);
    expect(j.meta.total).toBeGreaterThan(200);
    expect(j.meta.nextOffset).toBe(5);
    expect(j.data[0]).toMatchObject({ slug: expect.any(String), category: expect.any(String), url: expect.stringContaining("glossary.rjmlaird.co.uk") });
  });

  it("filters by category", async () => {
    const j = await body("/v1/glossary?category=climate-science&limit=250");
    expect(j.data.length).toBe(j.meta.total);
    expect(j.data.every((t: any) => t.category === "climate-science")).toBe(true);
  });

  it("rejects an unknown category with the allowed list", async () => {
    const res = await get("/v1/glossary?category=nope");
    expect(res.status).toBe(400);
    expect((await res.json() as any).allowed).toContain("space");
  });

  it("validates limit, letter and sort", async () => {
    expect((await get("/v1/glossary?limit=0")).status).toBe(400);
    expect((await get("/v1/glossary?limit=abc")).status).toBe(400);
    expect((await get("/v1/glossary?limit=9999")).status).toBe(400);
    expect((await get("/v1/glossary?letter=ab")).status).toBe(400);
    expect((await get("/v1/glossary?sort=random")).status).toBe(400);
  });

  it("searches terms, aliases and short descriptions", async () => {
    const j = await body("/v1/glossary?q=sar");
    expect(j.data.some((t: any) => t.slug === "synthetic-aperture-radar")).toBe(true);
  });

  it("filters by letter and the letters index adds up", async () => {
    const a = await body("/v1/glossary?letter=a&limit=250");
    expect(a.data.every((t: any) => t.term.toLowerCase().replace(/[^a-z0-9]/g, "")[0] === "a")).toBe(true);
    const letters = await body("/v1/glossary/letters");
    expect(letters.data.reduce((n: number, l: any) => n + l.count, 0)).toBe(letters.meta.total);
  });

  it("returns one term with definition, related terms and review date", async () => {
    const j = await body("/v1/glossary/albedo");
    expect(j.data.slug).toBe("albedo");
    expect(j.data.definition.length).toBeGreaterThan(20);
    expect(j.data.lastReviewed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(j.data.category).toMatchObject({ id: expect.any(String), label: expect.any(String) });
    expect(j.meta.matched).toBe("slug");
  });

  it("resolves aliases to the canonical term", async () => {
    const j = await body("/v1/glossary/SAR");
    expect(j.data.slug).toBe("synthetic-aperture-radar");
    expect(j.meta).toMatchObject({ matched: "alias", canonical: "synthetic-aperture-radar" });
  });

  it("404s unknown terms with suggestions", async () => {
    const res = await get("/v1/glossary/radar");
    expect(res.status).toBe(404);
    expect((await res.json() as any).suggestions.length).toBeGreaterThan(0);
  });

  it("emits schema.org DefinedTerm and DefinedTermSet", async () => {
    const term = await get("/v1/glossary/albedo?format=jsonld");
    expect(term.headers.get("content-type")).toContain("application/ld+json");
    expect(await term.json()).toMatchObject({ "@type": "DefinedTerm", termCode: "albedo" });
    const set = await (await get("/v1/glossary?format=jsonld&category=climate-science")).json() as any;
    expect(set["@type"]).toBe("DefinedTermSet");
    expect(set.hasDefinedTerm.length).toBeGreaterThan(0);
  });

  it("every term has a slug, definition, category and review date; related links resolve", async () => {
    const j = await body("/v1/glossary?limit=250&expand=definition");
    const slugs = new Set(j.data.map((t: any) => t.slug));
    for (const t of j.data) {
      expect(t.definition, t.slug).toBeTruthy();
      expect(t.updated, t.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      for (const r of t.related) expect(slugs.has(r), `${t.slug} -> ${r}`).toBe(true);
    }
  });

  it("supports ETag revalidation", async () => {
    const first = await get("/v1/glossary/albedo");
    const etag = first.headers.get("etag")!;
    expect(etag).toBeTruthy();
    const second = await get("/v1/glossary/albedo", { "If-None-Match": etag });
    expect(second.status).toBe(304);
  });
});

describe("research", () => {
  it("lists publications newest first with undated last", async () => {
    const j = await body("/v1/research?limit=100");
    expect(j.meta.total).toBe(14);
    const years = j.data.map((p: any) => p.year);
    const dated = years.filter((y: number | null) => y !== null);
    expect(dated).toEqual([...dated].sort((a: number, b: number) => b - a));
    expect(years.at(-1)).toBeNull();
  });

  it("filters by year, type and author, and validates input", async () => {
    expect((await body("/v1/research?year=2018")).data.every((p: any) => p.year === 2018)).toBe(true);
    expect((await body("/v1/research?type=article")).data.every((p: any) => p.type === "article")).toBe(true);
    expect((await body("/v1/research?author=snodgrass")).data.length).toBeGreaterThan(0);
    expect((await get("/v1/research?year=18")).status).toBe(400);
    expect((await get("/v1/research?type=nope")).status).toBe(400);
  });

  it("gets one publication by URL-safe id", async () => {
    const j = await body("/v1/research/snodgrass_p-2010_2010");
    expect(j.data.bibKey).toBe("snodgrass_p/2010_2010");
    expect((await get("/v1/research/missing")).status).toBe(404);
  });

  it("serves a sanitised bibliography: no local paths, no abstracts, no abstract text in JSON", async () => {
    const bib = await (await get("/v1/research/publications.bib")).text();
    expect(bib).toContain("@article{snodgrass_collision_2010");
    expect(bib).not.toMatch(/\bfile\s*=|\babstract\s*=|files\/|\/Users\/|copyright\s*=/i);
    const legacy = await (await get("/v1/portfolio/publications.txt")).text();
    expect(legacy).toBe(bib);
    expect(JSON.stringify(await body("/v1/research?limit=100"))).not.toMatch(/abstract":\s*"/);
  });
});

describe("tools, apps, labs", () => {
  it.each(["tools", "apps", "labs"])("%s lists live items before planned ones", async (name) => {
    const j = await body(`/v1/${name}`);
    const order: Record<string, number> = { active: 1, "in-progress": 2, planned: 3, archived: 4 };
    const ranks = j.data.map((b: any) => order[b.status]);
    expect(ranks).toEqual([...ranks].sort((a: number, b: number) => a - b));
    expect(j.meta.overall.total).toBeGreaterThan(0);
    expect(j.links.site).toContain(`${name}.rjmlaird.co.uk`);
  });

  it("filters by status, group, tech, live and q", async () => {
    const tools = await body("/v1/tools?live=true");
    expect(tools.data.every((b: any) => ["active", "in-progress"].includes(b.status))).toBe(true);
    expect((await body("/v1/tools?status=planned,archived")).data.every((b: any) => ["planned", "archived"].includes(b.status))).toBe(true);
    expect((await body("/v1/tools?group=space")).data.every((b: any) => b.group === "space")).toBe(true);
    expect((await body("/v1/tools?tech=hono")).data.length).toBeGreaterThan(0);
    expect((await body("/v1/tools?q=julian")).data.some((b: any) => b.sourceId === "julian-date")).toBe(true);
  });

  it("rejects invalid filters and 404s unknown items", async () => {
    expect((await get("/v1/tools?status=nope")).status).toBe(400);
    expect((await get("/v1/tools?group=nope")).status).toBe(400);
    expect((await get("/v1/labs?live=maybe")).status).toBe(400);
    expect((await get("/v1/apps/missing")).status).toBe(404);
  });

  it("returns an item by sourceId; planned items have null URLs rather than missing fields", async () => {
    const one = await body("/v1/tools/julian-date");
    expect(one.data.url).toContain("tools.rjmlaird.co.uk");
    const planned = (await body("/v1/tools?status=planned")).data[0];
    expect(planned.url === null || typeof planned.url === "string").toBe(true);
    expect("url" in planned).toBe(true);
  });

it("labs are normalised from the source experiments", async () => {
    const labs = (await body("/v1/labs")).data;
    expect(labs.length).toBe(20);
    expect(labs.find((l: any) => l.sourceId === "astro").tech).not.toContain("Streamliy");
  });

  it("groups report counts", async () => {
    const g = await body("/v1/tools/groups");
    expect(g.data.reduce((n: number, x: any) => n + x.count, 0)).toBeGreaterThan(0);
  });
});

describe("cv", () => {
  it("keeps the original index fields and adds a summary", async () => {
    const j = await body("/v1/cv");
    expect(j.service).toBe("cv");
    expect(j.sections).toContain("education");
    expect(j.endpoints).toContain("/v1/cv/sections");
    expect(j.counts.education).toBeGreaterThan(0);
    expect(j.profile).toBeTruthy();
    expect(JSON.stringify(j.profile)).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i); // no email addresses in the summary
    expect(j.links.cv).toBe("https://cv.rjmlaird.co.uk/");
  });
});

describe("subdomains entry point", () => {
  it("lists the estate with web and API entry points", async () => {
    const j = await body("/v1/subdomains");
    expect(j.data.apex.host).toBe("rjmlaird.co.uk");
    const byId = Object.fromEntries(j.data.subdomains.map((s: any) => [s.id, s]));
    for (const id of ["main", "cv", "booking", "glossary", "labs", "apps", "tools", "brand", "api", "status"]) {
      expect(byId[id], id).toBeTruthy();
    }
    expect(byId.glossary.entrypoints.api).toBe("https://api.rjmlaird.co.uk/v1/glossary");
    expect(byId.cv.entrypoints.api).toContain("/v1/cv");
    expect(byId.brand.entrypoints.api).toBeNull();
    expect(j.data.byStatus.live).toContain("glossary");
  });

  it("never exposes restricted hosts", async () => {
    const all = JSON.stringify(await body("/v1/subdomains"));
    for (const h of ["dam.", "mcp.", "hooks.", "auth.", "dav.", "upload."]) expect(all).not.toContain(`"${h}rjmlaird`);
  });

  it("filters, validates and resolves by id or host", async () => {
    expect((await body("/v1/subdomains?live=true")).data.subdomains.every((s: any) => s.status === "live")).toBe(true);
    expect((await get("/v1/subdomains?status=nope")).status).toBe(400);
    expect((await body("/v1/subdomains/glossary.rjmlaird.co.uk")).data.id).toBe("glossary");
    expect((await body("/v1/subdomains/glossary")).data.host).toBe("glossary.rjmlaird.co.uk");
    expect((await get("/v1/subdomains/dam")).status).toBe(404);
  });

  it("keeps /v1/sites working (it was never mounted before)", async () => {
    const j = await body("/v1/sites?status=live");
    expect(j.sites.length).toBeGreaterThan(5);
    expect((await get("/v1/sites?kind=nope")).status).toBe(400);
    expect((await get("/v1/sites/main")).status).toBe(200);
  });
});

describe("status", () => {
  it("reports build, datasets and estate counts without outbound requests", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const res = await get("/v1/status");
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.data.status).toBe("ok");
    expect(j.data.build.version).toBeTruthy();
    expect(j.data.datasets.map((d: any) => d.id)).toEqual(expect.arrayContaining(["glossary", "research", "apps", "tools", "labs"]));
    expect(j.data.estate.live).toBeGreaterThan(5);
    expect(j.data.probe).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("rejects an invalid probe flag", async () => {
    expect((await get("/v1/status?probe=yes")).status).toBe(400);
  });

  it("probeSites marks 4xx/5xx, timeouts and network errors as down", async () => {
    const live = sites.filter((s) => s.status === "live").slice(0, 3);
    const fake = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(Object.assign(new Error("t"), { name: "TimeoutError" }));
    const r = await probeSites(live, fake as unknown as typeof fetch);
    expect(r.map((x) => x.ok)).toEqual([true, false, false]);
    expect(r[1].status).toBe(503);
    expect(r[2].error).toBe("timeout");
  });

  it("returns 503 with status degraded when a probed site is down", async () => {
    const fake = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    const res = await get("/v1/status?probe=true");
    expect(res.status).toBe(503);
    expect((await res.json() as any).data.status).toBe("degraded");
    fake.mockRestore();
  });
});

describe("read-only surface", () => {
  it("rejects writes", async () => {
    for (const p of ["/v1/glossary", "/v1/status", "/v1/subdomains", "/v1/research"]) {
      const res = await app.request(`https://api.rjmlaird.co.uk${p}`, { method: "POST" });
      expect(res.status, p).toBe(405);
    }
  });
});