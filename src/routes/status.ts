import { Hono } from "hono";
import appsData from "../data/apps-builds.json";
import toolsData from "../data/tools-builds.json";
import labsData from "../data/labs-builds.json";
import glossaryData from "../data/glossary.json";
import research from "../data/research.json";
import projects from "../data/projects.json";
import caseStudies from "../data/caseStudies.json";
import initiatives from "../data/initiatives.json";
import { BUILD_INFO } from "../lib/buildInfo";
import { API_VERSION, link, respond } from "../lib/http";
import { registryVersion, sites, type Site } from "../lib/registry";

const SERVICE = "rjmlaird-api";
const VISIBILITY = "public-read-only";
const PROBE_TIMEOUT_MS = 3000;
const PROBE_CACHE_SECONDS = 60;

const latest = (dates: string[]) => dates.sort().at(-1) ?? null;
const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);

function datasets() {
  return [
    { id: "glossary", count: glossaryData.terms.length, version: glossaryData.version, updatedAt: glossaryData.updatedAt, endpoint: "/v1/glossary" },
    { id: "research", count: research.count, version: research.version, updatedAt: null, endpoint: "/v1/research" },
    { id: "apps", count: appsData.builds.length, version: null, updatedAt: latest(appsData.builds.map((b) => b.updated)), endpoint: "/v1/apps" },
    { id: "tools", count: toolsData.builds.length, version: null, updatedAt: latest(toolsData.builds.map((b) => b.updated)), endpoint: "/v1/tools" },
    { id: "labs", count: labsData.builds.length, version: null, updatedAt: latest(labsData.builds.map((b) => b.updated)), endpoint: "/v1/labs" },
    { id: "portfolio", count: count(projects) + count(caseStudies) + count(initiatives), version: null, updatedAt: null, endpoint: "/v1/portfolio" },
    { id: "subdomains", count: sites.length, version: registryVersion, updatedAt: null, endpoint: "/v1/subdomains" },
  ];
}

export type ProbeResult = { id: string; host: string; ok: boolean; status: number | null; ms: number | null; error?: string };

/** HEAD-checks each live public site. Any HTTP status below 400 counts as up. Exported for tests. */
export async function probeSites(
  list: Site[],
  doFetch: typeof fetch = fetch,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<ProbeResult[]> {
  return Promise.all(
    list.map(async (s): Promise<ProbeResult> => {
      const started = Date.now();
      try {
        const res = await doFetch(s.url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
        return { id: s.id, host: s.host, ok: res.status < 400, status: res.status, ms: Date.now() - started };
      } catch (e) {
        return { id: s.id, host: s.host, ok: false, status: null, ms: null, error: (e as Error).name === "TimeoutError" ? "timeout" : "unreachable" };
      }
    }),
  );
}

// Probe results are cached briefly at the edge so a monitor polling this endpoint cannot fan out
// into a request storm against the other sites.
async function cachedProbe(): Promise<{ results: ProbeResult[]; checkedAt: string; cached: boolean }> {
  const live = sites.filter((s) => s.status === "live" && s.id !== "api");
  const cache = typeof caches !== "undefined" ? (caches as unknown as { default?: Cache }).default : undefined;
  const key = new Request("https://cache.rjmlaird.co.uk/status-probe/" + registryVersion);

  if (cache) {
    const hit = await cache.match(key);
    if (hit) return { ...((await hit.json()) as { results: ProbeResult[]; checkedAt: string }), cached: true };
  }
  const fresh = { results: await probeSites(live), checkedAt: new Date().toISOString() };
  if (cache) {
    await cache.put(
      key,
      new Response(JSON.stringify(fresh), { headers: { "Cache-Control": `max-age=${PROBE_CACHE_SECONDS}`, "Content-Type": "application/json" } }),
    );
  }
  return { ...fresh, cached: false };
}

const app = new Hono();

// GET /v1/status[?probe=true]
app.get("/", async (c) => {
  const probe = c.req.query("probe");
  if (probe !== undefined && !["true", "false"].includes(probe)) {
    return respond(c, { error: "probe must be true or false" }, { status: 400 });
  }

  const byStatus: Record<string, number> = {};
  for (const s of sites) byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;

  let status: "ok" | "degraded" = "ok";
  let probed: Awaited<ReturnType<typeof cachedProbe>> | null = null;
  if (probe === "true") {
    probed = await cachedProbe();
    if (probed.results.some((r) => !r.ok)) status = "degraded";
  }

  return respond(
    c,
    {
      data: {
        status,
        service: SERVICE,
        apiVersion: API_VERSION,
        visibility: VISIBILITY,
        build: BUILD_INFO,
        datasets: datasets(),
        estate: { total: sites.length, live: byStatus.live ?? 0, byStatus },
        ...(probed ? { probe: { checkedAt: probed.checkedAt, cached: probed.cached, results: probed.results } } : {}),
      },
      meta: { probed: Boolean(probed), probeTimeoutMs: PROBE_TIMEOUT_MS },
      links: {
        self: link(c, "/v1/status"),
        probe: link(c, "/v1/status?probe=true"),
        health: link(c, "/healthz"),
        subdomains: link(c, "/v1/subdomains"),
        statusPage: sites.find((s) => s.id === "status")?.url ?? null,
      },
    },
    // A monitor can alert on the status code alone; the lightweight default never fails.
    { status: status === "degraded" ? 503 : 200 },
  );
});

export default app;
