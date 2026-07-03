import { json } from "../lib/jsonResponse";
import { storage } from "../services/storage";

const PAPERS_PREFIX = "papers";

/**
 * ======================================================
 * TYPES
 * ======================================================
 */
type IngestBody = {
  source?: string;
  title?: string;
  tags?: string[];
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
  };
};

/**
 * ======================================================
 * SAFE R2 LIST NORMALISER
 * ======================================================
 */
function normalizeR2List(result: unknown): R2Item[] {
  if (!result) return [];
  if (Array.isArray(result)) return result as R2Item[];

  if (typeof result === "object" && result !== null) {
    const r = result as any;

    if (Array.isArray(r.objects)) return r.objects;
    if (Array.isArray(r.keys)) return r.keys;
  }

  return [];
}

/**
 * ======================================================
 * ROUTE PARSER
 * ======================================================
 */
function getRoute(request: Request) {
  const url = new URL(request.url);

  const path = url.pathname.replace(/^\/v1\/research\/?/, "");
  const query = url.searchParams.get("q");

  return { path, query };
}

/**
 * ======================================================
 * SAFE METADATA ACCESSOR (FIXES TS18048)
 * ======================================================
 */
function getMeta(item: R2Item) {
  return item.metadata ?? {};
}

/**
 * ======================================================
 * HANDLER
 * ======================================================
 */
export async function handleResearch(request: Request, env: Env) {
  const method = request.method;
  const { path, query } = getRoute(request);

  /**
   * ======================================================
   * ROOT
   * ======================================================
   */
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

  /**
   * ======================================================
   * SEARCH
   * ======================================================
   */
  if (path === "search") {
    if (!query) {
      return json({ error: "Missing ?q=" }, 400);
    }

    const raw = await storage.r2.list(`${PAPERS_PREFIX}/`, env);
    const items = normalizeR2List(raw);

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

  /**
   * ======================================================
   * LIST PAPERS
   * ======================================================
   */
  if (path === "papers") {
    const raw = await storage.r2.list(`${PAPERS_PREFIX}/`, env);
    const items = normalizeR2List(raw);

    return json({
      count: items.length,
      items,
    });
  }

  /**
   * ======================================================
   * SINGLE PAPER
   * ======================================================
   */
  if (path.startsWith("paper/")) {
    const id = path.replace("paper/", "");
    const key = `${PAPERS_PREFIX}/${id}.json`;

    const item = await storage.r2.get(key, env);

    if (!item) {
      return json({ error: "Not found", key }, 404);
    }

    return json({
      key,
      size: item.size ?? 0,
      contentType: item.contentType ?? "application/json",
      body: item.body ?? null,
    });
  }

  /**
   * ======================================================
   * INGEST
   * ======================================================
   */
  if (path === "ingest" && method === "POST") {
    const body = (await request.json()) as IngestBody;

    const id = crypto.randomUUID();

    const record = {
      id,
      source: body.source ?? "unknown",
      title: body.title ?? null,
      tags: body.tags ?? [],
      createdAt: new Date().toISOString(),
    };

    const key = `${PAPERS_PREFIX}/${id}.json`;

    await storage.r2.put(
      key,
      new TextEncoder().encode(JSON.stringify(record)),
      env,
      "application/json"
    );

    return json({
      status: "ingested",
      key,
      record,
    });
  }

  /**
   * ======================================================
   * GRAPH
   * ======================================================
   */
  if (path === "graph") {
    const raw = await storage.r2.list(`${PAPERS_PREFIX}/`, env);
    const items = normalizeR2List(raw);

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

  /**
   * ======================================================
   * TIMELINE
   * ======================================================
   */
  if (path === "timeline") {
    const raw = await storage.r2.list(`${PAPERS_PREFIX}/`, env);
    const items = normalizeR2List(raw);

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

  /**
   * ======================================================
   * ENTITIES (placeholder)
   * ======================================================
   */
  if (path === "entities") {
    return json({
      entities: [],
      extracted: false,
    });
  }

  /**
   * ======================================================
   * ZOTERO EXPORT
   * ======================================================
   */
  if (path === "export/zotero") {
    const raw = await storage.r2.list(`${PAPERS_PREFIX}/`, env);
    const items = normalizeR2List(raw);

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

  /**
   * ======================================================
   * FALLBACK
   * ======================================================
   */
  return json(
    {
      error: "Not found",
      path,
      method,
    },
    404
  );
}