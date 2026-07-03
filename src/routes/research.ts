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

type R2Item = {
  key: string;
  size?: number;
  etag?: string;
  uploaded?: string;
  metadata?: {
    title?: string;
    createdAt?: string;
    links?: string[];
    source?: string;
    tags?: string[];
  };
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

function getMeta(item: R2Item) {
  return item.metadata ?? {};
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

async function listPapers(env: Env) {
  const raw = await storage.r2.list(`${PAPERS_PREFIX}/`, env);
  return normalizeR2List(raw);
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

    const items = await listPapers(env);
    const q = query.toLowerCase();

    const results = items.filter((item) =>
      JSON.stringify(item).toLowerCase().includes(q)
    );

    return json({
      query,
      count: results.length,
      results,
    });
  }

  if (path === "papers") {
    const items = await listPapers(env);
    return json({
      count: items.length,
      items,
    });
  }

  if (path.startsWith("paper/")) {
    const id = path.replace("paper/", "").trim();
    if (!id) return json({ error: "Missing paper id" }, 400);

    const key = `${PAPERS_PREFIX}/${id}.json`;
    const item = await storage.r2.get(key, env);

    if (!item) return json({ error: "Not found", key }, 404);

    return json({
      key,
      size: item.size ?? 0,
      contentType: item.contentType ?? "application/json",
      body: null,
    });
  }

  if (path === "ingest" && method === "POST") {
    const body = (await readJsonBody<IngestBody>(request)) ?? {};
    const id = body.id?.trim() || crypto.randomUUID();
    const createdAt = body.createdAt ?? new Date().toISOString();

    const record = {
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
    const items = await listPapers(env);

    return json({
      nodes: items.map((i) => {
        const meta = getMeta(i);
        return {
          id: i.key,
          size: i.size ?? 0,
          title: meta.title ?? null,
        };
      }),
      edges: items.flatMap((i) => {
        const meta = getMeta(i);
        return (meta.links ?? []).map((target: string) => ({
          from: i.key,
          to: target,
        }));
      }),
    });
  }

  if (path === "timeline") {
    const items = await listPapers(env);

    return json({
      events: items
        .map((i) => {
          const meta = getMeta(i);
          return {
            id: i.key,
            timestamp: meta.createdAt ?? null,
          };
        })
        .filter((e) => e.timestamp),
    });
  }

  if (path === "entities") {
    return json({
      entities: [],
      extracted: false,
    });
  }

  if (path === "export/zotero") {
    const items = await listPapers(env);

    return json({
      version: "0.1",
      items: items.map((i) => {
        const meta = getMeta(i);
        return {
          key: i.key,
          title: meta.title ?? i.key,
          createdAt: meta.createdAt ?? null,
        };
      }),
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
