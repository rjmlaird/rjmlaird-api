import { Hono } from "hono";
import { json } from "../lib/jsonResponse";

/**
 * Mounted at /v1/cdn. CLI/API only — there is no public upload form, and
 * PUT/DELETE require a bearer token:
 *   wrangler secret put CDN_UPLOAD_TOKEN
 *
 * Usage:
 *   curl -T ./photo.jpg -H "Authorization: Bearer $TOKEN" \
 *     https://api.rjmlaird.co.uk/v1/cdn/file/photos/photo.jpg
 *
 *   curl https://api.rjmlaird.co.uk/v1/cdn/file/photos/photo.jpg -o photo.jpg
 *
 * GET is public/read-only, since CDN objects are meant to be linked to.
 */
const app = new Hono<{ Bindings: Env }>();

function requireAuth(c: { req: { header: (name: string) => string | undefined }; env: Env }) {
  const header = c.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return token.length > 0 && token === c.env.CDN_UPLOAD_TOKEN;
}

app.get("/", (c) =>
  json({
    service: "cdn",
    version: "1.0",
    endpoints: [
      "GET /v1/cdn/list?prefix=",
      "GET /v1/cdn/file/*",
      "PUT /v1/cdn/file/* (auth required)",
      "DELETE /v1/cdn/file/* (auth required)",
    ],
  })
);

app.get("/list", async (c) => {
  const prefix = c.req.query("prefix") ?? undefined;
  const result = await c.env.CDN.list({ prefix, limit: 1000 });

  return json({
    prefix: prefix ?? null,
    count: result.objects.length,
    truncated: result.truncated,
    objects: result.objects.map((o) => ({
      key: o.key,
      size: o.size,
      etag: o.etag,
      uploaded: o.uploaded?.toISOString(),
      contentType: o.httpMetadata?.contentType ?? null,
    })),
  });
});

app.get("/file/*", async (c) => {
  const key = c.req.path.replace(/^\/file\//, "");
  if (!key) return json({ error: "Missing key" }, 400);

  const obj = await c.env.CDN.get(key);
  if (!obj) return json({ error: "Not found", key }, 404);

  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
      ETag: obj.httpEtag,
    },
  });
});

app.put("/file/*", async (c) => {
  if (!requireAuth(c)) return json({ error: "Unauthorized" }, 401);

  const key = c.req.path.replace(/^\/file\//, "");
  if (!key) return json({ error: "Missing key" }, 400);

  const contentType = c.req.header("content-type") ?? "application/octet-stream";
  await c.env.CDN.put(key, c.req.raw.body, {
    httpMetadata: { contentType },
  });

  return json({ ok: true, key, contentType }, 201);
});

app.delete("/file/*", async (c) => {
  if (!requireAuth(c)) return json({ error: "Unauthorized" }, 401);

  const key = c.req.path.replace(/^\/file\//, "");
  if (!key) return json({ error: "Missing key" }, 400);

  await c.env.CDN.delete(key);
  return json({ ok: true, key, deleted: true });
});

export default app;
