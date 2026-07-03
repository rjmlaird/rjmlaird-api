export async function handleWebDAV(request: Request, env: any) {
  const url = new URL(request.url);

  // Normalise path once
  let key = url.pathname.replace(/^\/v1\/webdav\/?/, "");
  key = decodeURIComponent(key).replace(/^\/+/, "");

  // Root request (Zotero checks this constantly)
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
   * =========================
   * PROPFIND (CRITICAL FOR ZOTERO)
   * =========================
   * Zotero uses this to discover files/folders
   */
  if (request.method === "PROPFIND") {
    const obj = await env.R2.get(`zotero/${key}`);

    if (!obj) {
      return new Response(
        `<?xml version="1.0" encoding="utf-8"?>
        <d:multistatus xmlns:d="DAV:">
          <d:response>
            <d:href>/${key}</d:href>
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
          <d:href>/${key}</d:href>
          <d:propstat>
            <d:prop>
              <d:resourcetype/>
              <d:getcontentlength>${obj.size}</d:getcontentlength>
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
   * =========================
   * HEAD (SYNC CHECK)
   * =========================
   */
  if (request.method === "HEAD") {
    const obj = await env.R2.get(`zotero/${key}`);

    if (!obj) {
      return new Response(null, { status: 404 });
    }

    return new Response(null, {
      status: 200,
      headers: {
        "Content-Length": String(obj.size ?? 0),
        "ETag": obj.etag ?? "",
        "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
      },
    });
  }

  /**
   * =========================
   * MKCOL (folder creation)
   * =========================
   * Zotero expects folder semantics even though R2 is flat
   */
  if (request.method === "MKCOL") {
    // We simulate folders as zero-byte markers
    await env.R2.put(`zotero/${key}/.folder`, new Uint8Array([]));

    return new Response("Created", { status: 201 });
  }

  /**
   * =========================
   * PUT (upload file)
   * =========================
   */
  if (request.method === "PUT") {
    const body = await request.arrayBuffer();

    await env.R2.put(`zotero/${key}`, body, {
      httpMetadata: {
        contentType:
          request.headers.get("content-type") || "application/octet-stream",
      },
    });

    return new Response("Created", { status: 201 });
  }

  /**
   * =========================
   * GET (download file)
   * =========================
   */
  if (request.method === "GET") {
    const obj = await env.R2.get(`zotero/${key}`);

    if (!obj) {
      return new Response(`Not found: ${key}`, { status: 404 });
    }

    return new Response(obj.body, {
      headers: {
        "Content-Type":
          obj.httpMetadata?.contentType ?? "application/octet-stream",
        "ETag": obj.etag ?? "",
        "DAV": "1,2",
      },
    });
  }

  /**
   * =========================
   * DELETE
   * =========================
   */
  if (request.method === "DELETE") {
    await env.R2.delete(`zotero/${key}`);
    return new Response("Deleted");
  }

  return new Response("Method not supported", {
    status: 405,
    headers: {
      "DAV": "1,2",
    },
  });
}