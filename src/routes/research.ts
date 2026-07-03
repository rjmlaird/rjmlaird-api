import { json } from "../lib/jsonResponse";
import { storage } from "../services/storage";

type IngestBody = {
  source?: string;
  title?: string;
  tags?: string[];
};

const PAPERS_PREFIX = "papers";

export async function handleResearch(request: Request, env: Env) {
  const url = new URL(request.url);
  const path = url.pathname.replace("/v1/research", "");

  /**
   * ----------------------------------------
   * GET /papers
   * ----------------------------------------
   */
  if (path === "/papers" && request.method === "GET") {
    const items = await storage.r2.list(`${PAPERS_PREFIX}/`, env);

    return json({
      source: "r2",
      count: items?.length ?? 0,
      items: items ?? [],
    });
  }

  /**
   * ----------------------------------------
   * GET /paper/:id
   * ----------------------------------------
   */
  if (path.startsWith("/paper/") && request.method === "GET") {
    const id = path.replace("/paper/", "");

    // IMPORTANT: match ingestion format (.json)
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
      size: item.size,
      contentType: item.contentType,
    });
  }

  /**
   * ----------------------------------------
   * POST /ingest
   * ----------------------------------------
   */
  if (path === "/ingest" && request.method === "POST") {
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