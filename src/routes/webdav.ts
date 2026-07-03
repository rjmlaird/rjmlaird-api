import { storage } from "../services/storage";

export async function handleWebDAV(request: Request, env: any) {
  const url = new URL(request.url);

  /**
   * ======================================================
   * PATH PARSING (CRITICAL FIX)
   * ======================================================
   */
  const rawPath = url.pathname
    .replace(/^\/v1\/webdav\/?/, "")
    .replace(/^\/+/, "");

  const parts = decodeURIComponent(rawPath).split("/");

  const [root, ...rest] = parts;

  /**
   * ======================================================
   * ZOTERO MOUNT CHECK
   * ======================================================
   */
  if (root !== "zotero") {
    return new Response("Not found", { status: 404 });
  }

  const key = rest.join("/");

  /**
   * ======================================================
   * ROOT (Zotero checks this constantly)
   * /v1/webdav/zotero
   * ======================================================
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

  /**
   * ======================================================
   * PROPFIND
   * ======================================================
   */
  if (request.method === "PROPFIND") {
    const obj = await storage.zotero.get(key, env);

    if (!obj) {
      return new Response(
        `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/${rawPath}</d:href>
    <d:status>HTTP/1.1 404 Not Found</d:status>
  </d:response>
</d:multistatus>`,
        {
          status: 404,
          headers: {
            "Content-Type": "application/xml",
          },
        }
      );
    }

    return new Response(
      `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/${rawPath}</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype/>
        <d:getcontentlength>${obj.size ?? 0}</d:getcontentlength>
        <d:getetag>${obj.etag ?? ""}</d:getetag>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`,
      {
        status: 207,
        headers: {
          "Content-Type": "application/xml",
          "DAV": "1,2",
        },
      }
    );
  }

  /**
   * ======================================================
   * HEAD
   * ======================================================
   */
  if (request.method === "HEAD") {
    const obj = await storage.zotero.get(key, env);

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
   * ======================================================
   * MKCOL (folders)
   * ======================================================
   */
  if (request.method === "MKCOL") {
    await storage.zotero.put(
      `${key}/.folder`,
      new Uint8Array([]),
      env,
      "application/octet-stream"
    );

    return new Response("Created", { status: 201 });
  }

  /**
   * ======================================================
   * PUT (upload)
   * ======================================================
   */
  if (request.method === "PUT") {
    const body = await request.arrayBuffer();

    await storage.zotero.put(
      key,
      body,
      env,
      request.headers.get("content-type") ?? "application/octet-stream"
    );

    return new Response("Created", { status: 201 });
  }

  /**
   * ======================================================
   * GET (download)
   * ======================================================
   */
  if (request.method === "GET") {
    const obj = await storage.zotero.get(key, env);

    if (!obj) {
      return new Response(`Not found: ${key}`, { status: 404 });
    }

    return new Response(obj.body, {
      headers: {
        "Content-Type": obj.contentType ?? "application/octet-stream",
        "ETag": obj.etag ?? "",
        "DAV": "1,2",
      },
    });
  }

  /**
   * ======================================================
   * DELETE
   * ======================================================
   */
  if (request.method === "DELETE") {
    await storage.zotero.del(key, env);
    return new Response("Deleted");
  }

  return new Response("Method not supported", {
    status: 405,
    headers: {
      "DAV": "1,2",
    },
  });
}