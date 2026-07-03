import { storage } from "../services/storage";

const BASE_PREFIX = "zotero/";

function normalizePath(rawPath: string) {
  return decodeURIComponent(rawPath)
    .replace(/^\/(v1\/)?webdav\/?/, "")
    .replace(/^\/+/, "");
}

function toKey(path: string) {
  if (!path) return null;
  return `${BASE_PREFIX}${path}`;
}

export async function handleWebDAV(request: Request, env: any) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const key = toKey(path);

  /**
   * =========================
   * OPTIONS (Zotero + desktop clients)
   * =========================
   */
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        DAV: "1,2",
        Allow: "OPTIONS, GET, PUT, DELETE, PROPFIND, HEAD, MKCOL",
        "MS-Author-Via": "DAV",
      },
    });
  }

  /**
   * =========================
   * ROOT
   * =========================
   */
  if (!path) {
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
   * PROPFIND (CORE FIXED LOGIC)
   * =========================
   */
  if (request.method === "PROPFIND") {
    const depth = request.headers.get("Depth") ?? "1";

    const prefix = `${BASE_PREFIX}${path ? path + "/" : ""}`;
    const items = await storage.r2.list(prefix, env);

    // ALWAYS include current directory as a node
    const selfHref = `/webdav/${path}`;

    const responses = [];

    // 1. SELF NODE (CRITICAL FOR ZOTERO)
    responses.push(`
  <d:response>
    <d:href>${selfHref}</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype><d:collection/></d:resourcetype>
        <d:getetag>"root"</d:getetag>
        <d:getcontentlength>0</d:getcontentlength>
        <d:getlastmodified>Thu, 01 Jan 1970 00:00:00 GMT</d:getlastmodified>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>`);

    // 2. CHILD NODES
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
    const obj = key ? await storage.r2.get(key, env) : null;
    if (!obj) return new Response(null, { status: 404 });

    return new Response(null, {
      status: 200,
      headers: {
        "Content-Length": String(obj.size ?? 0),
        ETag: obj.etag ?? "",
        "Content-Type": obj.contentType ?? "application/octet-stream",
        DAV: "1,2",
      },
    });
  }

  /**
   * =========================
   * MKCOL
   * =========================
   */
  if (request.method === "MKCOL") {
    const folderKey = `${key}/.folder`;

    await storage.r2.put(
      folderKey,
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
      key!,
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
    const obj = key ? await storage.r2.get(key, env) : null;
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
    headers: {
      DAV: "1,2",
    },
  });
}