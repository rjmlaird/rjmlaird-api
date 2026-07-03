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
  metadata?: Record<string, any>;
};

/**
 * ======================================================
 * SAFE R2 NORMALISER
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

  return { path, query, url };
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
      endpoints: {
        search: "/search?q=",
        papers: "/papers",
        paper: "/paper/:id",
        graph: "/graph",
        timeline: "/timeline",
        entities: "/entities",
        export: "/export/zotero",
        ingest: "/ingest",
      },
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

    const results = items.filter((item) => {
      const blob = JSON.stringify(item).toLowerCase();
      return blob.includes(q);
    });

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
   * INGEST (IMPORTANT: adds real timestamp for timeline)
   * ======================================================
   */
  if (path === "ingest" && method === "POST") {
    const body = (await request.json()) as IngestBody;

    const id = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    const record = {
      id,
      source: body.source ?? "unknown",
      title: body.title ?? null,
      tags: body.tags ?? [],
      createdAt: timestamp,
    };

    const key = `${PAPERS_PREFIX}/${id}.json`;

    await storage.r2.put(
      key,
      new TextEncoder().encode(JSON.stringify(record)),
      env,
      "application/json"
    );

    return json({ status: "ingested", key, record });
  }

  /**
   * ======================================================
   * GRAPH (now meaningful)
   * ======================================================
   */
  if (path === "graph") {
    const raw = await storage.r2.list(`${PAPERS_PREFIX}/`, env);
    const items = normalizeR2List(raw);

    return json({
      nodes: items.map((i) => ({
        id: i.key,
        size: i.size ?? 0,
        title: i.metadata?.title ?? null,
      })),
      edges: items
        .filter((i) => i.metadata?.links)
        .flatMap((i) =>
          (i.metadata.links || []).map((target: string) => ({
            from: i.key,
            to: target,
          }))
        ),
    });
  }

  /**
   * ======================================================
   * TIMELINE (now real)
   * ======================================================
   */
  if (path === "timeline") {
    const raw = await storage.r2.list(`${PAPERS_PREFIX}/`, env);
    const items = normalizeR2List(raw);

    return json({
      events: items
        .map((i) => ({
          id: i.key,
          timestamp: i.metadata?.createdAt ?? null,
        }))
        .filter((e) => e.timestamp),
    });
  }

  /**
   * ======================================================
   * ENTITIES (placeholder, structured future hook)
   * ======================================================
   */
  if (path === "entities") {
    return json({
      entities: [],
      extracted: false,
      note: "entity layer not yet enabled",
    });
  }

  /**
   * ======================================================
   * ZOTERO EXPORT (stable mapping)
   * ======================================================
   */
  if (path === "export/zotero") {
    const raw = await storage.r2.list(`${PAPERS_PREFIX}/`, env);
    const items = normalizeR2List(raw);

    return json({
      version: "0.1",
      items: items.map((i) => ({
        key: i.key,
        title: i.metadata?.title ?? i.key,
        createdAt: i.metadata?.createdAt ?? null,
      })),
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