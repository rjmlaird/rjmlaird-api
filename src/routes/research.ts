import { jsonResponse } from "../lib/jsonResponse";
import { getObject, listObjects } from "../services/storage";

/**
 * Research API router
 * Future sources:
 * - Zotero uploads (WebDAV → R2)
 * - Zenodo deposits
 * - Mendeley imports
 */
export async function handleResearch(request: Request, env: any) {
  const url = new URL(request.url);
  const path = url.pathname.replace("/v1/research", "");

  // ----------------------------------------
  // GET /v1/research/papers
  // ----------------------------------------
  if (path === "/papers" && request.method === "GET") {
    const items = await listObjects(env, "papers/");

    return jsonResponse({
      source: "r2",
      count: items.length,
      items
    });
  }

  // ----------------------------------------
  // GET /v1/research/paper/:id
  // ----------------------------------------
  if (path.startsWith("/paper/") && request.method === "GET") {
    const key = path.replace("/paper/", "");
    const item = await getObject(env, `papers/${key}`);

    if (!item) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    return jsonResponse({
      key,
      size: item.size,
      contentType: item.contentType
    });
  }

  // ----------------------------------------
  // POST /v1/research/ingest
  // (used later for enrichment pipeline)
  // ----------------------------------------
  if (path === "/ingest" && request.method === "POST") {
    const body = await request.json();

    // minimal ingestion layer (expand later)
    const record = {
      id: crypto.randomUUID(),
      source: body.source || "unknown",
      title: body.title || null,
      tags: body.tags || [],
      createdAt: new Date().toISOString()
    };

    // optional: you could persist metadata separately later
    return jsonResponse({
      status: "ingested",
      record
    });
  }

  return jsonResponse({ error: "Not found" }, 404);
}