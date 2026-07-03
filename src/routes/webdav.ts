import { storage } from "../services/storage";

const BASE_PREFIX = "zotero";

/**
 * Normalize path safely
 */
function normalizePath(raw: string) {
  return decodeURIComponent(raw)
    .replace(/^\/(v1\/)?webdav\/?/, "")
    .replace(/^\/+/, "")
    .replace(/^zotero\/?/, "");
}

/**
 * Build R2 key
 */
function toKey(path: string) {
  if (!path) return null;
  return `${BASE_PREFIX}/${path}`;
}

/**
 * Extract parent path
 */
function parent(path: string) {
  const parts = path.split("/");
  parts.pop();
  return parts.join("/");
}

/**
 * =========================
 * WEBDAV HANDLER (ZOTERO SAFE CORE)
 * =========================
 */
export async function handleWebDAV(request: Request, env: any) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const key = toKey(path);

  const depth = request.headers.get("Depth") ?? "1";

  /**
   * =========================
   * OPTIONS
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
   * ROOT (must ALWAYS succeed)
   * =========================
   */
  if (!path) {
    return new Response("WebDAV root", {
      status: 200,
      headers: {
        DAV: "1,2",
        "Content-Type": "text/plain",
      },
    });
  }

  /**
   * =========================
   * LOCK (CRITICAL FOR ZOTERO)
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
          "Lock-Token": "opaquelocktoken:12345",
        },
      }
    );
  }

  /**
   * =========================
   * UNLOCK (no-op safe)
   * =========================
   */
  if (request.method === "UNLOCK") {
    return new Response(null, { status: 204 });
  }

  /**
   * =========================
   * MKCOL
   * =========================
   */
  if (request.method === "MKCOL") {
    await storage.r2.put(
      `${BASE_PREFIX}/${path}/.folder`,
      new Uint8Array([]),
      env,
      "application/octet-stream"
    );

    return new Response("Created", { status: 201 });
  }

  /**
   * =========================
   * PUT
   * =========================
   */
  if (request.method === "PUT") {
    const body = await request.arrayBuffer();

    await storage.r2.put(
      `${BASE_PREFIX}/${path}`,
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
    const obj = await storage.r2.get(`${BASE_PREFIX}/${path}`, env);
    if (!obj) return new Response("Not found", { status: 404 });

    return new Response(obj.body, {
      headers: {
        "Content-Type": obj.contentType ?? "application/octet-stream",
        ETag: obj.etag ?? "",
        DAV: "1,2",
      },
    });
  }

  /**
   * =========================
   * PROPFIND (FIXED ZOTERO DISCOVERY MODEL)
   * =========================
   */
  if (request.method === "PROPFIND") {
    const prefix = `${BASE_PREFIX}/${path}`;

    const items = await storage.r2.list(prefix, env);

    const responses = [];

    // SELF
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

    // CHILDREN
    for (const item of items.objects) {
      const clean = item.key.replace(`${BASE_PREFIX}/`, "");
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
    const obj = await storage.r2.get(`${BASE_PREFIX}/${path}`, env);
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
   * DELETE
   * =========================
   */
  if (request.method === "DELETE") {
    await storage.r2.del(`${BASE_PREFIX}/${path}`, env);
    return new Response("Deleted", { status: 200 });
  }

  return new Response("Method not supported", {
    status: 405,
    headers: {
      DAV: "1,2",
    },
  });
}