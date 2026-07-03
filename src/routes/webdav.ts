import { storage } from "../services/storage";

const BASE_PREFIX = "zotero";

/**
 * ======================================================
 * PATH NORMALISATION
 * ======================================================
 */
function normalizePath(raw: string): string {
  return decodeURIComponent(raw)
    .replace(/^\/+/, "")
    .replace(/^v1\/webdav\/?/, "")
    .replace(/^webdav\/?/, "")
    .replace(/^zotero\/?/, "")
    .replace(/\/+$/, "");
}

/**
 * ======================================================
 * KEY BUILDING
 * ======================================================
 */
function toKey(path: string | null): string | null {
  if (!path) return null;
  return `${BASE_PREFIX}/${path}`;
}

/**
 * ======================================================
 * HREF BUILDING (canonical)
 * ======================================================
 */
function toHref(path: string): string {
  if (!path) return "/webdav/zotero";
  return `/webdav/zotero/${path}`;
}

/**
 * ======================================================
 * SAFE LIST NORMALISATION (Cloudflare R2 variants)
 * ======================================================
 */
function normalizeList(result: any): any[] {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.objects)) return result.objects;
  if (Array.isArray(result.keys)) return result.keys;
  return [];
}

/**
 * ======================================================
 * STABLE SORT (CRITICAL for Zotero sync determinism)
 * ======================================================
 */
function sortItems(items: any[]) {
  return [...items].sort((a, b) => (a.key ?? "").localeCompare(b.key ?? ""));
}

/**
 * ======================================================
 * FOLDER DETECTION
 * ======================================================
 */
function isFolderKey(key: string): boolean {
  return key.endsWith("/.folder");
}

/**
 * ======================================================
 * STABLE ETAG (prevents sync loops)
 * ======================================================
 */
function makeEtag(item: any): string {
  const key = item.key ?? "unknown";
  const size = item.size ?? 0;
  return `"${key}:${size}"`;
}

/**
 * ======================================================
 * LOCK STORE (in-memory per Worker instance)
 * NOTE: sufficient for Zotero sync behaviour
 * ======================================================
 */
const LOCK_STORE = new Map<string, string>();

function getLock(path: string) {
  return LOCK_STORE.get(path);
}

function setLock(path: string) {
  const token = `urn:uuid:${crypto.randomUUID()}`;
  LOCK_STORE.set(path, token);
  return token;
}

/**
 * ======================================================
 * WEBDAV HANDLER
 * ======================================================
 */
export async function handleWebDAV(request: Request, env: any) {
  const url = new URL(request.url);

  const path = normalizePath(url.pathname);
  const key = toKey(path);
  const isRoot = !path;

  /**
   * ======================================================
   * OPTIONS
   * ======================================================
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
   * ======================================================
   * LOCK (stateful per path)
   * ======================================================
   */
  if (request.method === "LOCK") {
    const token = setLock(path || "/");

    return new Response(
      `<?xml version="1.0" encoding="utf-8"?>
<d:prop xmlns:d="DAV:">
  <d:lockdiscovery>
    <d:activelock>
      <d:locktoken>
        <d:href>${token}</d:href>
      </d:locktoken>
    </d:activelock>
  </d:lockdiscovery>
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

  /**
   * ======================================================
   * UNLOCK (clears state)
   * ======================================================
   */
  if (request.method === "UNLOCK") {
    LOCK_STORE.delete(path || "/");
    return new Response(null, { status: 204 });
  }

  /**
   * ======================================================
   * ROOT
   * ======================================================
   */
  if (isRoot) {
    return new Response("WebDAV root", {
      status: 200,
      headers: { DAV: "1,2" },
    });
  }

  /**
   * ======================================================
   * LOAD OBJECT
   * ======================================================
   */
  const obj = key ? await storage.r2.get(key, env) : null;

  /**
   * ======================================================
   * PROPFIND (Zotero-critical stable model)
   * ======================================================
   */
  if (request.method === "PROPFIND") {
    const depth = request.headers.get("Depth") ?? "1";

    const prefix = key ? `${key}/` : `${BASE_PREFIX}/`;
    const rawList = await storage.r2.list(prefix, env);

    let items = sortItems(normalizeList(rawList));

    const responses: string[] = [];

    /**
     * SELF NODE
     */
    responses.push(`
<d:response>
  <d:href>${toHref(path)}</d:href>
  <d:propstat>
    <d:prop>
      <d:resourcetype><d:collection/></d:resourcetype>
      <d:displayname>${path || "zotero"}</d:displayname>
      <d:getetag>"${path}-root"</d:getetag>
      <d:getcontentlength>0</d:getcontentlength>
    </d:prop>
    <d:status>HTTP/1.1 200 OK</d:status>
  </d:propstat>
</d:response>`);

    /**
     * CHILDREN
     */
    if (depth !== "0") {
      for (const item of items) {
        const clean = item.key.replace(`${BASE_PREFIX}/`, "");
        const folder = isFolderKey(item.key);

        responses.push(`
<d:response>
  <d:href>${toHref(clean.replace(/\/\.folder$/, ""))}</d:href>
  <d:propstat>
    <d:prop>
      <d:resourcetype>${
        folder ? "<d:collection/>" : ""
      }</d:resourcetype>
      <d:displayname>${clean}</d:displayname>
      <d:getetag>${makeEtag(item)}</d:getetag>
      <d:getcontentlength>${item.size ?? 0}</d:getcontentlength>
    </d:prop>
    <d:status>HTTP/1.1 200 OK</d:status>
  </d:propstat>
</d:response>`);
      }
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
   * ======================================================
   * HEAD
   * ======================================================
   */
  if (request.method === "HEAD") {
    if (!obj) return new Response(null, { status: 404 });

    return new Response(null, {
      status: 200,
      headers: {
        "Content-Length": String(obj.size ?? 0),
        ETag: obj.etag ?? makeEtag({ key, size: obj.size }),
      },
    });
  }

  /**
   * ======================================================
   * MKCOL (idempotent-safe)
   * ======================================================
   */
  if (request.method === "MKCOL") {
    if (!key) return new Response("Bad request", { status: 400 });

    const exists = await storage.r2.get(`${key}/.folder`, env);
    if (exists) return new Response("Already exists", { status: 200 });

    await storage.r2.put(`${key}/.folder`, new Uint8Array([]), env);
    return new Response("Created", { status: 201 });
  }

  /**
   * ======================================================
   * PUT
   * ======================================================
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
   * ======================================================
   * GET
   * ======================================================
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
   * ======================================================
   * DELETE
   * ======================================================
   */
  if (request.method === "DELETE") {
    if (!key) return new Response("Bad request", { status: 400 });

    await storage.r2.del(key, env);
    LOCK_STORE.delete(path);

    return new Response("Deleted", { status: 200 });
  }

  return new Response("Method not supported", {
    status: 405,
    headers: { DAV: "1,2" },
  });
}