import { json } from "../lib/jsonResponse";
import { storage } from "../services/storage";

const PAPERS_PREFIX = "papers";

type IngestBody = {
  source?: string;
  title?: string;
  tags?: string[];
  id?: string;
  createdAt?: string;
  links?: string[];
};

type PaperRecord = {
  id: string;
  source: string;
  title: string | null;
  tags: string[];
  createdAt: string;
  links: string[];
};

type R2Item = {
  key: string;
  size?: number;
  etag?: string;
  uploaded?: string;
  metadata?: Record<string, unknown>;
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

async function listPaperItems(env: Env) {
  const raw = await storage.r2.list(`${PAPERS_PREFIX}/`, env);
  return normalizeR2List(raw);
}

async function readPaperRecord(env: Env, key: string): Promise<PaperRecord | null> {
  const obj = await storage.r2.get(key, env);
  if (!obj?.body) return null;

  const text = await new Response(obj.body).text();
  if (!text.trim()) return null;

  try {
    return JSON.parse(text) as PaperRecord;
  } catch {
    return null;
  }
}

function paperToGraphNode(item: R2Item, record: PaperRecord | null) {
  return {
    id: item.key,
    size: item.size ?? 0,
    title: record?.title ?? null,
  };
}

function paperToTimelineEvent(item: R2Item, record: PaperRecord | null) {
  return {
    id: item.key,
    timestamp: record?.createdAt ?? null,
  };
}

function paperToExportItem(item: R2Item, record: PaperRecord | null) {
  return {
    key: item.key,
    title: record?.title ?? item.key,
    createdAt: record?.createdAt ?? null,
  };
}

export async function handleResearch(request: Request, env: Env) {
  const method = request.method.toUpperCase();
  const { path, query } = getRoute(request);

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
    if (!query) return json({ error: "Missing ?q=" }, 400);

    const items = await listPaperItems(env);
    const q = query.toLowerCase();

    const results = [];
    for (const item of items) {
      const record = await readPaperRecord(env, item.key);
      const haystack = JSON.stringify({ item, record }).toLowerCase();
      if (haystack.includes(q)) {
        results.push({
          key: item.key,
          size: item.size ?? 0,
          record,
        });
      }
    }

    return json({
      query,
      count: results.length,
      results,
    });
  }

  if (path === "papers") {
    const items = await listPaperItems(env);
    const results = [];

    for (const item of items) {
      const record = await readPaperRecord(env, item.key);
      results.push({
        key: item.key,
        size: item.size ?? 0,
        record,
      });
    }

    return json({
      count: results.length,
      items: results,
    });
  }

  if (path.startsWith("paper/")) {
    const id = path.replace("paper/", "").trim();
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
    const id = body.id?.trim() || crypto.randomUUID();
    const createdAt = body.createdAt ?? new Date().toISOString();

    const record: PaperRecord = {
      id,
      source: body.source ?? "unknown",
      title: body.title ?? null,
      tags: Array.isArray(body.tags) ? body.tags : [],
      createdAt,
      links: Array.isArray(body.links) ? body.links : [],
    };

    const key = `${PAPERS_PREFIX}/${id}.json`;
    const bytes = new TextEncoder().encode(JSON.stringify(record));

    await storage.r2.put(key, bytes, env, "application/json");

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
    const items = await listPaperItems(env);
    const records = await Promise.all(
      items.map(async (item) => [item, await readPaperRecord(env, item.key)] as const)
    );

    return json({
      nodes: records.map(([item, record]) => paperToGraphNode(item, record)),
      edges: records.flatMap(([item, record]) =>
        (record?.links ?? []).map((target) => ({
          from: item.key,
          to: target,
        }))
      ),
    });
  }

  if (path === "timeline") {
    const items = await listPaperItems(env);
    const records = await Promise.all(
      items.map(async (item) => [item, await readPaperRecord(env, item.key)] as const)
    );

    return json({
      events: records
        .map(([item, record]) => paperToTimelineEvent(item, record))
        .filter((event) => event.timestamp),
    });
  }

  if (path === "entities") {
    return json({
      entities: [],
      extracted: false,
    });
  }

  if (path === "export/zotero") {
    const items = await listPaperItems(env);
    const records = await Promise.all(
      items.map(async (item) => [item, await readPaperRecord(env, item.key)] as const)
    );

    return json({
      version: "0.1",
      items: records.map(([item, record]) => paperToExportItem(item, record)),
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
