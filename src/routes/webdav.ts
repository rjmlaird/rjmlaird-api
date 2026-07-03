import { storage } from "../services/storage";

const BASE_PREFIX = "zotero/";

function buildKey(rawPath: string) {
  const clean = decodeURIComponent(rawPath)
    .replace(/^\/(v1\/)?webdav\/?/, "")
    .replace(/^\/+/, "");

  return clean ? `${BASE_PREFIX}${clean}` : null;
}

/**
 * =========================
 * WEB DAV HANDLER (ZOTERO SAFE)
 * =========================
 */
export async function handleWebDAV(request: Request, env: any) {
  const url = new URL(request.url);

  const key = buildKey(url.pathname);

  /**
   * =========================
   * OPTIONS (required by Zotero discovery)
   * =========================
   */
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "DAV": "1,2",
        "Allow": "OPTIONS, GET, PUT, DELETE, PROPFIND, HEAD",
        "MS-Author-Via": "DAV",
      },
    });
  }

  /**
   * =========================
   * ROOT / COLLECTION ROOT
   * =========================
   */
  if (!key) {
    return new Response("WebDAV root", {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
        "DAV": "1,2",
      },
    });
  }

  const obj = await storage.r2.get(key, env);

  /**
   * =========================
   * PROPFIND (Zotero discovery core)
   * =========================
   */
  if (request.method === "PROPFIND") {
    if (!obj) {
      return new Response(xml404(url.pathname), {
        status: 404,
        headers: { "Content-Type": "application/xml" },
      });
    }

    return new Response(xml207(url.pathname, obj), {
      status: 207,
      headers: {
        "Content-Type": "application/xml",
        "DAV": "1,2",
      },
    });
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
        "ETag": obj.etag ?? "",
        "Content-Type": obj.contentType ?? "application/octet-stream",
      },
    });
  }

  /**
   * =========================
   * GET
   * =========================
   */
  if (request.method === "GET") {
    if (!obj) return new Response(`Not found`, { status: 404 });

    return new Response(obj.body, {
      headers: {
        "Content-Type": obj.contentType ?? "application/octet-stream",
        "ETag": obj.etag ?? "",
        "DAV": "1,2",
      },
    });
  }

  /**
   * =========================
   * PUT
   * =========================
   */
  if (request.method === "PUT") {
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
   * DELETE
   * =========================
   */
  if (request.method === "DELETE") {
    await storage.r2.del(key, env);
    return new Response("Deleted", { status: 200 });
  }

  return new Response("Method not supported", {
    status: 405,
    headers: {
      "DAV": "1,2",
    },
  });
}

/**
 * =========================
 * XML HELPERS
 * =========================
 */
function xml404(path: string) {
  return `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>${path}</d:href>
    <d:status>HTTP/1.1 404 Not Found</d:status>
  </d:response>
</d:multistatus>`;
}

function xml207(path: string, obj: any) {
  return `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>${path}</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype/>
        <d:getcontentlength>${obj.size ?? 0}</d:getcontentlength>
        <d:getetag>${obj.etag ?? ""}</d:getetag>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;
}