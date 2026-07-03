import { storage } from "../services/storage";

const BASE_PREFIX = "zotero/";

/**
 * =========================
 * PATH NORMALISATION
 * =========================
 */
function normalizePath(raw: string) {
  return decodeURIComponent(raw)
    .replace(/^\/(v1\/)?webdav\/?/, "")
    .replace(/^\/+/, "")
    .replace(/^zotero\/?/, ""); // supports /webdav/zotero and /webdav
}

/**
 * Build R2 key
 */
function toKey(path: string | null) {
  if (!path) return null;
  return `${BASE_PREFIX}${path}`;
}

/**
 * Ensure stable href formatting
 */
function toHref(key: string) {
  return `/webdav/${key.replace(BASE_PREFIX, "").replace(/\/\.folder$/, "")}`;
}

/**
 * =========================
 * WEBDAV HANDLER
 * =========================
 */
export async function handleWebDAV(request: Request, env: any) {
  const url = new URL(request.url);

  const path = normalizePath(url.pathname);
  const key = toKey(path);

  const isRoot = !path || path.length === 0;

  /**
   * =========================
   * OPTIONS (required for Zotero + macOS + Windows)
   * =========================
   */
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        DAV: "1,2",
        Allow:
          "OPTIONS, GET, PUT, DELETE, PROPFIND, HEAD, MKCOL, LOCK, UNLOCK",
        "MS-Author-Via": "DAV",
      },
    });
  }

  /**
   * =========================
   * LOCK / UNLOCK (Zotero requires presence)
   * =========================
   */
  if (request.method === "LOCK") {
    return new Response(
      `<?xml version="1.0" encoding="utf-8"?>
<d:prop xmlns:d="DAV:">
  <d:lockdiscovery/>
</d:prop>`,
      {
        status: 200,
        headers: {
          "Content-Type": "application/xml",
          DAV: "1,2",
        },
      }
    );
  }

  if (request.method === "UNLOCK") {
    return new Response(null, { status: 204 });
  }

  /**
   * =========================
   * ROOT (CRITICAL: must never fail)
   * /webdav OR /webdav/zotero
   * =========================
   */
  if (isRoot || path === "zotero") {
    return new Response("WebDAV root", {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
        DAV: "1,2",
      },
    });
  }

  /**
   * =========================
   * LOOKUP OBJECT
   * =========================
   */
  const obj = key ? await storage.r2.get(key, env) : null;

  /**
   * =========================
   * PROPFIND (Zotero-critical behaviour)
   * =========================
   */
  if (request.method === "PROPFIND") {
    const depth = request.headers.get("Depth") ?? "1";

    const prefix = key ? key + "/" : BASE_PREFIX;

    const items = await storage.r2.list(prefix, env);

    const responses: string[] = [];

    /**
     * SELF NODE (VERY IMPORTANT: prevents Zotero sync bug)
     */
    responses.push(`
<d:response>
  <d:href>/webdav/${path}</d:href>
  <d:propstat>
    <d:prop>
      <d:resourcetype><d:collection/></d:resourcetype>
      <d:getetag>"root"</d:getetag>
      <d:getcontentlength>0</d:getcontentlength>
    </d:prop>
    <d:status>HTTP/1.1 200 OK</d:status>
  </d:propstat>
</d:response>`);

    /**
     * CHILDREN
     */
    for (const item of items) {
      const clean = item.key.replace(BASE_PREFIX, "");
      const isFolder = item.key.endsWith("/.folder");

      responses.push(`
<d:response>
  <d:href>/webdav/${clean.replace(/\/\.folder$/, "")}</d:href>
  <d:propstat>
    <d:prop>
      <d:resourcetype>${isFolder ? "<d:collection/>" : ""}</d:resourcetype>
      <d:getcontentlength>${item.size ?? 0}</d:getcontentlength>
      <d:getetag>${item.etag ?? ""}</d:getetag>
    </d:prop>
    <d:status>HTTP/1.1 200 OK</d:status>
  </d:propstat>
</d:response>`);
    }

    return new Response(
      `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
${responses.join("\n")}
</d:multistatus>`,
      {
        status: 207,
        headers: {
          "Content-Type": "application/xml",
          DAV: "1,2",
        },
      }
    );
  }

  /**
   * =========================
   * HEAD
   * =========================
   */
  if (request.method === "HEAD") {
    if (!obj) return new Response(null, { status: 404 });

    return new Response(null, {
      status: 200,
      headers: {
        "Content-Length": String(obj.size ?? 0),
        ETag: obj.etag ?? "",
        "Content-Type": obj.contentType ?? "application/octet-stream",
      },
    });
  }

  /**
   * =========================
   * MKCOL
   * =========================
   */
  if (request.method === "MKCOL") {
    if (!key) return new Response("Bad request", { status: 400 });

    await storage.r2.put(`${key}/.folder`, new Uint8Array([]), env);

    return new Response("Created", { status: 201 });
  }

  /**
   * =========================
   * PUT
   * =========================
   */
  if (request.method === "PUT") {
    if (!key) return new Response("Bad request", { status: 400 });

    const body = await request.arrayBuffer();

    await storage.r2.put(
      key,
      body,
      env,
      request.headers.get("content-type") ?? "application/octet-stream"
    );

    return new Response("Created", { status: 201 });
  }

  /**
   * =========================
   * GET
   * =========================
   */
  if (request.method === "GET") {
    if (!obj) return new Response("Not found", { status: 404 });

    return new Response(obj.body, {
      headers: {
        "Content-Type": obj.contentType ?? "application/octet-stream",
        ETag: obj.etag ?? "",
      },
    });
  }

  /**
   * =========================
   * DELETE
   * =========================
   */
  if (request.method === "DELETE") {
    if (!key) return new Response("Bad request", { status: 400 });

    await storage.r2.del(key, env);
    return new Response("Deleted", { status: 200 });
  }

  return new Response("Method not supported", {
    status: 405,
    headers: { DAV: "1,2" },
  });
}