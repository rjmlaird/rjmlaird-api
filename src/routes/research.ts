import { json } from "../lib/jsonResponse";
import { storage } from "../services/storage";

type IngestBody = {
  source?: string;
  title?: string;
  tags?: string[];
};

const PAPERS_PREFIX = "papers";

/**
 * ----------------------------------------
 * SAFE R2 LIST NORMALISER
 * ----------------------------------------
 */
function normalizeR2List(result: unknown): any[] {
  if (!result) return [];

  if (Array.isArray(result)) return result;

  if (
    typeof result === "object" &&
    result !== null &&
    Array.isArray((result as any).objects)
  ) {
    return (result as any).objects;
  }

  if (
    typeof result === "object" &&
    result !== null &&
    Array.isArray((result as any).keys)
  ) {
    return (result as any).keys;
  }

  return [];
}

/**
 * ----------------------------------------
 * HANDLER
 * ----------------------------------------
 * IMPORTANT:
 * Hono already strips `/v1/research`
 * We only work with the wildcard param.
 */
export async function handleResearch(c: any, env: Env) {
  const path = "/" + (c.req.param("*") || "");
  const method = c.req.method;

  /**
   * ================================
   * ROOT
   * ================================
   */
  if ((path === "/" || path === "") && method === "GET") {
    return json({
      service: "research",
      endpoints: ["/papers", "/paper/:id", "/ingest"],
    });
  }

  /**
   * ================================
   * LIST PAPERS
   * ================================
   */
  if (path === "/papers" && method === "GET") {
    const raw = await storage.r2.list(`${PAPERS_PREFIX}/`, env);
    const items = normalizeR2List(raw);

    return json({
      source: "r2",
      count: items.length,
      items,
    });
  }

  /**
   * ================================
   * GET PAPER
   * ================================
   */
  if (path.startsWith("/paper/") && method === "GET") {
    const id = path.replace("/paper/", "").replace(/\/+$/, "");
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
   * ================================
   * INGEST
   * ================================
   */
  if (path === "/ingest" && method === "POST") {
    const body = (await c.req.json()) as IngestBody;

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
   * ================================
   * FALLBACK
   * ================================
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