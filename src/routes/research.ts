import { json } from "../lib/jsonResponse";
import { storage } from "../services/storage";

export async function handleResearch(request: Request, env: Env) {
  const url = new URL(request.url);
  const path = url.pathname.replace("/v1/research", "");

  /**
   * GET /papers
   */
  if (path === "/papers" && request.method === "GET") {
    const items = await storage.r2.list("papers/", env);

    return json({
      source: "r2",
      count: items?.length ?? 0,
      items: items ?? [],
    });
  }

  /**
   * GET /paper/:id
   */
  if (path.startsWith("/paper/") && request.method === "GET") {
    const key = path.replace("/paper/", "");

    const item = await storage.r2.get(`papers/${key}`, env);

    if (!item) {
      return json({ error: "Not found" }, 404);
    }

    return json({
      key,
      size: item.size,
      contentType: item.contentType,
    });
  }

  /**
   * POST /ingest
   */
  if (path === "/ingest" && request.method === "POST") {
    const body = (await request.json()) as {
      source?: string;
      title?: string;
      tags?: string[];
    };

    const record = {
      id: crypto.randomUUID(),
      source: body.source ?? "unknown",
      title: body.title ?? null,
      tags: body.tags ?? [],
      createdAt: new Date().toISOString(),
    };

    await storage.r2.put(
      `papers/${record.id}.json`,
      new TextEncoder().encode(JSON.stringify(record)),
      env,
      "application/json"
    );

    return json({
      status: "ingested",
      record,
    });
  }

  return json({ error: "Not found" }, 404);
}