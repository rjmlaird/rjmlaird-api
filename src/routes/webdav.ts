import { storage } from "../services/storage";

const BASE_PREFIX = "zotero";

type DavNode =
  | {
      key: string;
      kind: "file";
      size?: number;
      contentType?: string;
      etag?: string;
    }
  | {
      key: string;
      kind: "collection";
      etag?: string;
    };

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeDecode(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function normalizePath(raw: string): string {
  return safeDecode(raw)
    .replace(/^\/+/, "")
    .replace(/^v1\/webdav\/?/, "")
    .replace(/^webdav\/?/, "")
    .replace(/^zotero\/?/, "")
    .replace(/\/+$/, "");
}

function toKey(path: string | null): string | null {
  if (!path) return null;
  const cleaned = path.replace(/^\/+/, "").replace(/\/+$/, "");
  return cleaned ? `${BASE_PREFIX}/${cleaned}` : BASE_PREFIX;
}

function toHref(path: string): string {
  const cleaned = path.replace(/^\/+/, "").replace(/\/+$/, "");
  return cleaned ? `/webdav/zotero/${encodeURI(cleaned)}` : "/webdav/zotero";
}

function normalizeList(result: any): any[] {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.objects)) return result.objects;
  if (Array.isArray(result.keys)) return result.keys;
  return [];
}

function isCollectionMarkerKey(key: string): boolean {
  return key.endsWith("/.folder");
}

function etagFor(key: string, size = 0): string {
  return `"${key}:${size}"`;
}

function sortByKey(items: any[]) {
  return [...items].sort((a, b) => String(a.key).localeCompare(String(b.key)));
}

function xmlResponse(
  body: string,
  status: number,
  headers: Record<string, string> = {}
) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      ...headers,
    },
  });
}

function notFound() {
  return new Response("Not found", { status: 404 });
}

function badRequest() {
  return new Response("Bad request", { status: 400 });
}

function conflict() {
  return new Response("Conflict", { status: 409 });
}

function methodNotAllowed(allow: string) {
  return new Response("Method not allowed", {
    status: 405,
    headers: { Allow: allow },
  });
}

function propfindItem(node: DavNode, requestPath: string, displayname: string): string {
  const href = toHref(requestPath);
  const resType = node.kind === "collection" ? "<d:collection/>" : "";
  const etag = node.etag ?? etagFor(node.key, node.kind === "file" ? node.size ?? 0 : 0);
  const len = node.kind === "collection" ? 0 : node.size ?? 0;

  return `
<d:response>
  <d:href>${escapeXml(href)}</d:href>
  <d:propstat>
    <d:prop>
      <d:resourcetype>${resType}</d:resourcetype>
      <d:displayname>${escapeXml(displayname)}</d:displayname>
      <d:getetag>${escapeXml(etag)}</d:getetag>
      <d:getcontentlength>${len}</d:getcontentlength>
    </d:prop>
    <d:status>HTTP/1.1 200 OK</d:status>
  </d:propstat>
</d:response>`;
}

async function exists(key: string, env: any): Promise<DavNode | null> {
  const obj = await storage.r2.get(key, env);
  if (obj) {
    return {
      key,
      kind: "file",
      size: obj.size ?? 0,
      contentType: obj.contentType ?? undefined,
      etag: obj.etag ?? undefined,
    };
  }

  const marker = await storage.r2.get(`${key}/.folder`, env);
  if (marker) {
    return {
      key,
      kind: "collection",
      etag: etagFor(`${key}/.folder`, 0),
    };
  }

  return null;
}

async function parentExists(pathKey: string, env: any): Promise<boolean> {
  const parent = pathKey.includes("/")
    ? pathKey.slice(0, pathKey.lastIndexOf("/"))
    : BASE_PREFIX;

  return !!(await exists(parent, env));
}

export async function handleWebDAV(request: Request, env: any) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const key = path ? toKey(path) : BASE_PREFIX;
  const root = path === "" || path === BASE_PREFIX;

  const allow = "OPTIONS, GET, PUT, DELETE, PROPFIND, HEAD, MKCOL, LOCK, UNLOCK";

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        DAV: "1,2",
        Allow: allow,
        "MS-Author-Via": "DAV",
      },
    });
  }

  if (request.method === "LOCK") {
    const token = `urn:uuid:${crypto.randomUUID()}`;
    return xmlResponse(
      `<?xml version="1.0" encoding="utf-8"?>
<d:prop xmlns:d="DAV:">
  <d:lockdiscovery>
    <d:activelock>
      <d:locktoken>
        <d:href>${escapeXml(token)}</d:href>
      </d:locktoken>
    </d:activelock>
  </d:lockdiscovery>
</d:prop>`,
      200,
      {
        DAV: "1,2",
        "Lock-Token": `<${token}>`,
      }
    );
  }

  if (request.method === "UNLOCK") {
    return new Response(null, { status: 204, headers: { DAV: "1,2" } });
  }

  const current = key
    ? await exists(key, env)
    : ({ key: BASE_PREFIX, kind: "collection" } as DavNode);

  if (request.method === "PROPFIND") {
    if (!current) return notFound();

    const depth = request.headers.get("Depth") ?? "1";
    const responses: string[] = [];

    const selfPath = root ? BASE_PREFIX : path;
    const selfDisplay = root ? "zotero" : path.split("/").pop() ?? "zotero";
    responses.push(propfindItem(current, selfPath, selfDisplay));

    if (depth !== "0" && current.kind === "collection") {
      const prefix = current.key === BASE_PREFIX ? `${BASE_PREFIX}/` : `${current.key}/`;
      const raw = sortByKey(normalizeList(await storage.r2.list(prefix, env)));

      for (const item of raw) {
        if (!item?.key) continue;
        if (item.key === `${current.key}/.folder`) continue;

        const rel = item.key.startsWith(`${BASE_PREFIX}/`)
          ? item.key.slice(BASE_PREFIX.length + 1)
          : item.key;

        const isCollection = isCollectionMarkerKey(item.key);
        const hrefPath = isCollection ? rel.replace(/\/\.folder$/, "") : rel;
        const display = hrefPath.split("/").pop() ?? hrefPath;

        const node: DavNode = isCollection
          ? { key: item.key, kind: "collection", etag: item.etag }
          : {
              key: item.key,
              kind: "file",
              size: item.size ?? 0,
              contentType: item.contentType,
              etag: item.etag,
            };

        responses.push(propfindItem(node, hrefPath, display));
      }
    }

    return xmlResponse(
      `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">${responses.join("")}</d:multistatus>`,
      207,
      { DAV: "1,2" }
    );
  }

  if (request.method === "HEAD") {
    if (!current) return notFound();

    if (current.kind === "collection") {
      return new Response(null, { status: 200, headers: { DAV: "1,2" } });
    }

    return new Response(null, {
      status: 200,
      headers: {
        "Content-Length": String(current.size ?? 0),
        "Content-Type": current.contentType ?? "application/octet-stream",
        ETag: current.etag ?? etagFor(current.key, current.size ?? 0),
        DAV: "1,2",
      },
    });
  }

  if (request.method === "MKCOL") {
    if (!key) return badRequest();
    if (current) return conflict();
    if (!(await parentExists(key, env))) return conflict();

    await storage.r2.put(`${key}/.folder`, new Uint8Array([]), env);
    return new Response(null, { status: 201, headers: { DAV: "1,2" } });
  }

  if (request.method === "PUT") {
    if (!key) return badRequest();
    if (key !== BASE_PREFIX && !(await parentExists(key, env))) return conflict();

    const body = await request.arrayBuffer();
    await storage.r2.put(
      key,
      body,
      env,
      request.headers.get("content-type") ?? "application/octet-stream"
    );

    return new Response(null, {
      status: current ? 200 : 201,
      headers: { DAV: "1,2" },
    });
  }

  if (request.method === "GET") {
    if (!current || current.kind === "collection") return notFound();

    const obj = await storage.r2.get(key!, env);
    if (!obj) return notFound();

    return new Response(obj.body, {
      status: 200,
      headers: {
        "Content-Type": obj.contentType ?? "application/octet-stream",
        ETag: obj.etag ?? etagFor(key!, obj.size ?? 0),
        "Content-Length": String(obj.size ?? 0),
        DAV: "1,2",
      },
    });
  }

  if (request.method === "DELETE") {
    if (!current) return notFound();

    if (current.kind === "collection") {
      const prefix = `${current.key}/`;
      const children = normalizeList(await storage.r2.list(prefix, env));
      for (const item of children) {
        if (item?.key) await storage.r2.del(item.key, env);
      }
      await storage.r2.del(`${current.key}/.folder`, env);
      return new Response(null, { status: 204, headers: { DAV: "1,2" } });
    }

    await storage.r2.del(key!, env);
    return new Response(null, { status: 204, headers: { DAV: "1,2" } });
  }

  return methodNotAllowed(allow);
}
