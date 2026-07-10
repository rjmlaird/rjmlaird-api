import { Hono } from "hono";
import { json } from "../lib/jsonResponse";
import { storage } from "../services/storage";

const PAPERS_PREFIX = "papers";
const ZOTERO_PAGE_LIMIT = 50;
const ZOTERO_SYNC_MAX_PAGES = 10;
const MAX_SCAN_ITEMS = 200;
const MAX_RESULTS = 100;
const MAX_BODY_TEXT = 200_000;

type IngestBody = {
  source?: string;
  title?: string;
  tags?: string[];
  id?: string;
  createdAt?: string;
  links?: string[];
  zotero?: {
    start?: number;
    limit?: number;
  };
};

type PaperRecord = {
  id: string;
  source: string;
  title: string | null;
  tags: string[];
  createdAt: string;
  links: string[];
};

type ZoteroItem = {
  key?: string;
  data?: {
    key?: string;
    itemType?: string;
    title?: string;
    date?: string;
    tags?: Array<{ tag?: string } | string>;
    collections?: string[];
    links?: {
      alternate?: { href?: string };
    };
  };
};

type R2Item = {
  key: string;
  size?: number;
  etag?: string;
  uploaded?: string;
  metadata?: Record<string, unknown>;
};

type ResearchEnv = Env & {
  ZOTERO_USER_ID?: string;
  ZOTERO_API_KEY?: string;
};

const research = new Hono<{ Bindings: ResearchEnv }>();

const routeRoot = "/v1/research";

function normalizeR2List(result: unknown): R2Item[] {
  if (!result) return [];
  if (Array.isArray(result)) return result as R2Item[];

  if (typeof result === "object" && result !== null) {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.objects)) return r.objects as R2Item[];
    if (Array.isArray(r.keys)) return r.keys as R2Item[];
  }

  return [];
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeStringArray(values?: string[]) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean)
    )
  ).slice(0, 20);
}

function normalizeZoteroTags(tags?: Array<{ tag?: string } | string>) {
  if (!Array.isArray(tags)) return [];
  return Array.from(
    new Set(
      tags
        .map((tag) => (typeof tag === "string" ? tag : tag?.tag))
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter(Boolean)
    )
  ).slice(0, 20);
}

function getRoute(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(new RegExp(`^${routeRoot}/?`), "");
  const query = url.searchParams.get("q");
  return { path, query };
}

async function readJsonBody<T>(request: Request): Promise<T | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return null;

  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

async function listPaperItems(env: ResearchEnv, limit = MAX_SCAN_ITEMS) {
  const raw = await storage.r2.list(`${PAPERS_PREFIX}/`, env);
  const items = normalizeR2List(raw);
  return items.slice(0, clamp(limit, 1, MAX_SCAN_ITEMS));
}

async function readPaperRecord(env: ResearchEnv, key: string): Promise<PaperRecord | null> {
  const obj = await storage.r2.get(key, env);
  if (!obj?.body) return null;

  const text = await new Response(obj.body).text();
  if (!text || text.length > MAX_BODY_TEXT) return null;

  try {
    return JSON.parse(text) as PaperRecord;
  } catch {
    return null;
  }
}

async function writePaperRecord(env: ResearchEnv, record: PaperRecord) {
  const key = `${PAPERS_PREFIX}/${record.id}.json`;
  const bytes = new TextEncoder().encode(JSON.stringify(record));
  await storage.r2.put(key, bytes, env, "application/json");
  return key;
}

function zoteroToPaper(item: ZoteroItem): PaperRecord | null {
  const data = item.data;
  const zoteroKey = safeTrim(data?.key ?? item.key);
  if (!zoteroKey) return null;

  const altLink = safeTrim(data?.links?.alternate?.href);

  return {
    id: zoteroKey,
    source: "zotero",
    title: safeTrim(data?.title) || null,
    tags: normalizeZoteroTags(data?.tags),
    createdAt: safeTrim(data?.date) || new Date().toISOString(),
    links: altLink ? [altLink] : [],
  };
}

async function fetchZoteroPage(env: ResearchEnv, start: number, limit: number) {
  const userId = env.ZOTERO_USER_ID;
  const apiKey = env.ZOTERO_API_KEY;

  if (!userId || !apiKey) throw new Error("Missing Zotero credentials");

  const url = new URL(`https://api.zotero.org/users/${userId}/items`);
  url.searchParams.set("start", String(clamp(start, 0, 1_000_000)));
  url.searchParams.set("limit", String(clamp(limit, 1, ZOTERO_PAGE_LIMIT)));

  const res = await fetch(url.toString(), {
    headers: {
      "Zotero-API-Key": apiKey,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zotero API error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? (data as ZoteroItem[]) : [];
}

async function syncZoteroBatchToR2(env: ResearchEnv, start = 0, limit = ZOTERO_PAGE_LIMIT) {
  const pageLimit = clamp(limit, 1, ZOTERO_PAGE_LIMIT);
  let currentStart = clamp(start, 0, 1_000_000);
  let pages = 0;
  let fetched = 0;
  let written = 0;
  const items: Array<{ key: string; record: PaperRecord }> = [];

  while (pages < ZOTERO_SYNC_MAX_PAGES) {
    const page = await fetchZoteroPage(env, currentStart, pageLimit);
    pages += 1;
    fetched += page.length;

    for (const item of page) {
      const record = zoteroToPaper(item);
      if (!record) continue;

      const key = await writePaperRecord(env, record);
      written += 1;
      items.push({ key, record });
    }

    if (page.length < pageLimit) {
      return { fetched, written, start, limit: pageLimit, pages, nextStart: null, items };
    }

    currentStart += pageLimit;
  }

  return { fetched, written, start, limit: pageLimit, pages, nextStart: currentStart, items };
}

async function scanPaperRecords(env: ResearchEnv) {
  const items = await listPaperItems(env);
  const records: Array<{ item: R2Item; record: PaperRecord | null }> = [];

  for (const item of items) {
    records.push({ item, record: await readPaperRecord(env, item.key) });
  }

  return records;
}

research.get("/", (c) =>
  json({
    service: "research",
    version: "1.0",
    endpoints: [
      "/search?q=",
      "/papers",
      "/paper/:id",
      "/graph",
      "/timeline",
      "/entities",
      "/export/zotero",
      "/ingest",
    ],
  })
);

research.get("/search", async (c) => {
  const q = safeTrim(c.req.query("q")).toLowerCase();
  if (!q) return json({ error: "Missing ?q=" }, 400);

  const records = await scanPaperRecords(c.env);
  const results: Array<{ key: string; size: number; record: PaperRecord | null }> = [];

  for (const { item, record } of records) {
    const haystack = JSON.stringify({ key: item.key, record }).toLowerCase();
    if (haystack.includes(q)) {
      results.push({ key: item.key, size: item.size ?? 0, record });
    }
    if (results.length >= MAX_RESULTS) break;
  }

  return json({
    query: q,
    count: results.length,
    limit: MAX_RESULTS,
    scanned: records.length,
    results,
  });
});

research.get("/papers", async (c) => {
  const items = await listPaperItems(c.env);
  const results: Array<{ key: string; size: number; record: PaperRecord | null }> = [];

  for (const item of items) {
    results.push({ key: item.key, size: item.size ?? 0, record: await readPaperRecord(c.env, item.key) });
  }

  return json({ count: results.length, scanned: items.length, items: results });
});

research.get("/paper/:id", async (c) => {
  const id = safeTrim(c.req.param("id"));
  if (!id) return json({ error: "Missing paper id" }, 400);

  const key = `${PAPERS_PREFIX}/${id}.json`;
  const record = await readPaperRecord(c.env, key);

  if (!record) return json({ error: "Not found", key }, 404);

  return json({ key, record });
});

research.post("/ingest", async (c) => {
  const body = (await readJsonBody<IngestBody>(c.req.raw)) ?? {};

  if (body.source === "zotero") {
    try {
      const start = clamp(body.zotero?.start ?? 0, 0, 1_000_000);
      const limit = clamp(body.zotero?.limit ?? ZOTERO_PAGE_LIMIT, 1, ZOTERO_PAGE_LIMIT);
      const result = await syncZoteroBatchToR2(c.env, start, limit);

      return json({ status: "synced", source: "zotero", ...result }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Zotero sync error";
      return json({ error: "Zotero sync failed", message }, 500);
    }
  }

  const id = safeTrim(body.id) || crypto.randomUUID();
  const createdAt = safeTrim(body.createdAt) || new Date().toISOString();

  const record: PaperRecord = {
    id,
    source: safeTrim(body.source) || "unknown",
    title: safeTrim(body.title) || null,
    tags: normalizeStringArray(body.tags),
    createdAt,
    links: normalizeStringArray(body.links),
  };

  const key = await writePaperRecord(c.env, record);

  return json({ status: "ingested", key, record }, 201);
});

research.get("/graph", async (c) => {
  const records = await scanPaperRecords(c.env);

  const nodes = records.map(({ item, record }) => ({
    id: item.key,
    size: item.size ?? 0,
    title: record?.title ?? null,
  }));

  const edges = records
    .flatMap(({ item, record }) =>
      (record?.links ?? []).slice(0, 20).map((target) => ({
        from: item.key,
        to: target,
      }))
    )
    .slice(0, 500);

  return json({ nodes: nodes.slice(0, MAX_SCAN_ITEMS), edges, scanned: records.length });
});

research.get("/timeline", async (c) => {
  const records = await scanPaperRecords(c.env);

  return json({
    events: records
      .map(({ item, record }) => ({
        id: item.key,
        timestamp: record?.createdAt ?? null,
      }))
      .filter((event): event is { id: string; timestamp: string } => Boolean(event.timestamp))
      .slice(0, MAX_SCAN_ITEMS),
    scanned: records.length,
  });
});

research.get("/entities", () => json({ entities: [], extracted: false }));

research.get("/export/zotero", async (c) => {
  const records = await scanPaperRecords(c.env);

  return json({
    version: "0.1",
    items: records
      .map(({ item, record }) => ({
        key: item.key,
        title: record?.title ?? item.key,
        createdAt: record?.createdAt ?? null,
      }))
      .slice(0, MAX_SCAN_ITEMS),
    scanned: records.length,
  });
});

research.all("*", (c) =>
  json(
    {
      error: "Not found",
      path: new URL(c.req.url).pathname,
      method: c.req.method.toUpperCase(),
    },
    404
  )
);

export default research;
