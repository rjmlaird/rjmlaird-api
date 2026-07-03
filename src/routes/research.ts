import { json } from "../lib/jsonResponse";
import { storage } from "../services/storage";

const PAPERS_PREFIX = "papers";
const ZOTERO_PAGE_LIMIT = 50;
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

function getRoute(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/v1\/research\/?/, "");
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

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeStringArray(values?: string[]) {
  if (!Array.isArray(values)) return [];

  const out: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    out.push(trimmed);
  }

  return Array.from(new Set(out)).slice(0, 20);
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

function normalizeZoteroTags(tags?: Array<{ tag?: string } | string>) {
  if (!Array.isArray(tags)) return [];

  const out: string[] = [];
  for (const tag of tags) {
    const value = typeof tag === "string" ? tag : tag?.tag;
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    out.push(trimmed);
  }

  return Array.from(new Set(out)).slice(0, 20);
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

  if (!userId || !apiKey) {
    throw new Error("Missing Zotero credentials");
  }

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

async function syncZoteroPageToR2(env: ResearchEnv, start = 0, limit = ZOTERO_PAGE_LIMIT) {
  const pageLimit = clamp(limit, 1, ZOTERO_PAGE_LIMIT);
  const page = await fetchZoteroPage(env, start, pageLimit);
  const written: Array<{ key: string; record: PaperRecord }> = [];

  for (const item of page) {
    const record = zoteroToPaper(item);
    if (!record) continue;
    const key = await writePaperRecord(env, record);
    written.push({ key, record });
  }

  return {
    fetched: page.length,
    written: written.length,
    start,
    limit: pageLimit,
    nextStart: page.length === pageLimit ? start + pageLimit : null,
    items: written,
  };
}

async function scanPaperRecords(env: ResearchEnv) {
  const items = await listPaperItems(env);
  const records: Array<{ item: R2Item; record: PaperRecord | null }> = [];

  for (const item of items) {
    records.push({
      item,
      record: await readPaperRecord(env, item.key),
    });
  }

  return records;
}

export async function handleResearch(request: Request, env: ResearchEnv) {
  const method = request.method.toUpperCase();
  const { path, query } = getRoute(request);
  const q = safeTrim(query).toLowerCase();

  if (!path) {
    return json({
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
    });
  }

  if (path === "search") {
    if (!q) return json({ error: "Missing ?q=" }, 400);

    const records = await scanPaperRecords(env);
    const results: Array<{ key: string; size: number; record: PaperRecord | null }> = [];

    for (const { item, record } of records) {
      const haystack = JSON.stringify({ key: item.key, record }).toLowerCase();
      if (haystack.includes(q)) {
        results.push({
          key: item.key,
          size: item.size ?? 0,
          record,
        });
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
  }

  if (path === "papers") {
    const items = await listPaperItems(env);
    const results: Array<{ key: string; size: number; record: PaperRecord | null }> = [];

    for (const item of items) {
      results.push({
        key: item.key,
        size: item.size ?? 0,
        record: await readPaperRecord(env, item.key),
      });
    }

    return json({
      count: results.length,
      scanned: items.length,
      items: results,
    });
  }

  if (path.startsWith("paper/")) {
    const id = safeTrim(path.replace("paper/", ""));
    if (!id) return json({ error: "Missing paper id" }, 400);

    const key = `${PAPERS_PREFIX}/${id}.json`;
    const record = await readPaperRecord(env, key);

    if (!record) return json({ error: "Not found", key }, 404);

    return json({
      key,
      record,
    });
  }

  if (path === "ingest" && method === "POST") {
    const body = (await readJsonBody<IngestBody>(request)) ?? {};

    if (body.source === "zotero") {
      try {
        const start = clamp(body.zotero?.start ?? 0, 0, 1_000_000);
        const limit = clamp(body.zotero?.limit ?? ZOTERO_PAGE_LIMIT, 1, ZOTERO_PAGE_LIMIT);
        const result = await syncZoteroPageToR2(env, start, limit);

        return json(
          {
            status: "synced",
            source: "zotero",
            ...result,
          },
          201
        );
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

    const key = await writePaperRecord(env, record);

    return json(
      {
        status: "ingested",
        key,
        record,
      },
      201
    );
  }

  if (path === "graph") {
    const records = await scanPaperRecords(env);

    const nodes = records.map(({ item, record }) => ({
      id: item.key,
      size: item.size ?? 0,
      title: record?.title ?? null,
    }));

    const edges = records.flatMap(({ item, record }) =>
      (record?.links ?? []).slice(0, 20).map((target) => ({
        from: item.key,
        to: target,
      }))
    ).slice(0, 500);

    return json({
      nodes: nodes.slice(0, MAX_SCAN_ITEMS),
      edges,
      scanned: records.length,
    });
  }

  if (path === "timeline") {
    const records = await scanPaperRecords(env);

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
  }

  if (path === "entities") {
    return json({
      entities: [],
      extracted: false,
    });
  }

  if (path === "export/zotero") {
    const records = await scanPaperRecords(env);

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
