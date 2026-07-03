import { json } from "../lib/jsonResponse";
import { storage } from "../services/storage";

type IngestBody = {
  source?: string;
  title?: string;
  tags?: string[];
};

const PAPERS_PREFIX = "papers";

/**
 * Normalise research path safely
 */
function getPath(request: Request): string {
  const url = new URL(request.url);

  return url.pathname
    .replace(/^\/v1\/research\/?/, "/")
    .replace(/\/+$/, "");
}

export async function handleResearch(request: Request, env: Env) {
  const path = getPath(request);
  const method = request.method;

  /**
   * ----------------------------------------
   * ROOT: GET /v1/research
   * ----------------------------------------
   */
  if ((path === "/" || path === "") && method === "GET") {
    return json({
      service: "research",
      endpoints: [
        "/papers",
        "/paper/:id",
        "/ingest",
      ],
    });
  }

  /**
   * ----------------------------------------
   * GET /papers
   * ----------------------------------------
   */
  if (path === "/papers" && method === "GET") {
    const result = await storage.r2.list(`${PAPERS_PREFIX}/`, env);

    const items = Array.isArray(result)
      ? result
      : result.objects ?? [];

    return json({
      source: "r2",
      count: items.length,
      items,
    });
  }

  /**
   * ----------------------------------------
   * GET /paper/:id
   * ----------------------------------------
   */
  if (path.startsWith("/paper/") && method === "GET") {
    const id = path.replace("/paper/", "").replace(/\/+$/, "");

    const key = `${PAPERS_PREFIX}/${id}.json`;

    const item = await storage.r2.get(key, env);

    if (!item) {
      return json(
        {
          error: "Not found",
          key,
        },
        404
      );
    }

    return json({
      key,
      size: item.size ?? null,
      contentType: item.contentType ?? null,
      body: item.body ?? null,
    });
  }

  /**
   * ----------------------------------------
   * POST /ingest
   * ----------------------------------------
   */
  if (path === "/ingest" && method === "POST") {
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
   * ----------------------------------------
   * FALLBACK
   * ----------------------------------------
   */
  return json(
    {
      error: "Not found",
      path,
    },
    404
  );
}