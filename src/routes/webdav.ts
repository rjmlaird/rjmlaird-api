import { storage } from "../services/storage";

const BASE_PREFIX = "zotero";
const DAV_HEADER = "1,2";
const ALLOW_HEADER =
  "OPTIONS, GET, PUT, DELETE, PROPFIND, HEAD, MKCOL, LOCK, UNLOCK";
const LOCK_TIMEOUT_SECONDS = 300;

type DavKind = "file" | "collection";

type DavNode = {
  key: string;
  kind: DavKind;
  size?: number;
  contentType?: string;
  etag?: string;
};

type LockRecord = {
  token: string;
  key: string;
  owner?: string;
  expiresAt: number;
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

function nonNullable<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
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

function xmlResponse(body: string, status: number, headers: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      DAV: DAV_HEADER,
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

function preconditionFailed() {
  return new Response("Precondition failed", { status: 412 });
}

function locked() {
  return new Response("Locked", { status: 423 });
}

function methodNotAllowed() {
  return new Response("Method not allowed", {
    status: 405,
    headers: { Allow: ALLOW_HEADER, DAV: DAV_HEADER },
  });
}

function unauthorized() {
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Zotero WebDAV", charset="UTF-8"',
      DAV: DAV_HEADER,
    },
  });
}

function parseAuthorizationHeader(request: Request): boolean {
  return !!request.headers.get("authorization");
}

function parseIfHeader(request: Request): string[] {
  const value = request.headers.get("if");
  if (!value) return [];
  return [...value.matchAll(/<([^>]+)>/g)].map((m) => m[1]).filter(nonNullable);
}

function getLockTokenFromHeaders(request: Request): string | null {
  const lockToken = request.headers.get("lock-token");
  if (lockToken) return lockToken.replace(/^<|>$/g, "").trim();

  const ifTokens = parseIfHeader(request);
  return ifTokens.find(
    (token) => token.startsWith("urn:uuid:") || token.startsWith("opaquelocktoken:")
  ) ?? null;
}

function lockKey(key: string): string {
  return `locks/${key}`;
}

async function getLockRecord(key: string, env: any): Promise<LockRecord | null> {
  const raw = await storage.r2.get(lockKey(key), env);
  if (!raw) return null;

  const text = await new Response(raw.body).text();

  try {
    const parsed = JSON.parse(text) as LockRecord;
    if (!parsed?.token || !parsed?.key) return null;
    if (Date.now() > parsed.expiresAt) {
      await storage.r2.del(lockKey(key), env);
      return null;
    }
    return parsed;
  } catch {
    await storage.r2.del(lockKey(key), env);
    return null;
  }
}

async function setLockRecord(record: LockRecord, env: any): Promise<void> {
  await storage.r2.put(
    lockKey(record.key),
    new TextEncoder().encode(JSON.stringify(record)),
    env,
    "application/json"
  );
}

async function deleteLockRecord(key: string, env: any): Promise<void> {
  await storage.r2.del(lockKey(key), env);
}

async function requireWriteLock(key: string, request: Request, env: any): Promise<Response | null> {
  const record = await getLockRecord(key, env);
  if (!record) return null;

  const supplied = getLockTokenFromHeaders(request);
  if (!supplied || supplied !== record.token) return locked();

  return null;
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

function propfindCollectionBody(responses: string[]): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">${responses.join("")}</d:multistatus>`;
}

async function listCollectionChildren(current: DavNode, env: any): Promise<any[]> {
  const prefix = current.key === BASE_PREFIX ? `${BASE_PREFIX}/` : `${current.key}/`;
  return sortByKey(normalizeList(await storage.r2.list(prefix, env)));
}

async function collectCollectionKeysRecursive(prefixKey: string, env: any): Promise<string[]> {
  const prefix = `${prefixKey}/`;
  const items = normalizeList(await storage.r2.list(prefix, env));
  return items.map((x) => x.key).filter(nonNullable);
}

export async function handleWebDAV(request: Request, env: any) {
  const url = new URL(request.url);
  const path = normalizePath(url.pathname);
  const key = path ? toKey(path) : BASE_PREFIX;
  const root = path === "" || path === BASE_PREFIX;

  if (!parseAuthorizationHeader(request)) {
    return unauthorized();
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        DAV: DAV_HEADER,
        Allow: ALLOW_HEADER,
        "MS-Author-Via": "DAV",
      },
    });
  }

  if (request.method === "LOCK") {
    if (!key) return badRequest();

    const existing = await getLockRecord(key, env);
    if (existing) {
      const supplied = getLockTokenFromHeaders(request);
      if (!supplied || supplied !== existing.token) return locked();

      const refreshed: LockRecord = {
        ...existing,
        expiresAt: Date.now() + LOCK_TIMEOUT_SECONDS * 1000,
      };
      await setLockRecord(refreshed, env);

      return xmlResponse(
        `<?xml version="1.0" encoding="utf-8"?>
<d:prop xmlns:d="DAV:">
  <d:lockdiscovery>
    <d:activelock>
      <d:locktoken>
        <d:href>${escapeXml(existing.token)}</d:href>
      </d:locktoken>
    </d:activelock>
  </d:lockdiscovery>
</d:prop>`,
        200,
        { "Lock-Token": `<${existing.token}>` }
      );
    }

    const token = `urn:uuid:${crypto.randomUUID()}`;
    const record: LockRecord = {
      token,
      key,
      expiresAt: Date.now() + LOCK_TIMEOUT_SECONDS * 1000,
    };

    await setLockRecord(record, env);

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
      { "Lock-Token": `<${token}>` }
    );
  }

  if (request.method === "UNLOCK") {
    const token = getLockTokenFromHeaders(request);
    const record = await getLockRecord(key!, env);

    if (record && token && token === record.token) {
      await deleteLockRecord(key!, env);
      return new Response(null, { status: 204, headers: { DAV: DAV_HEADER } });
    }

    return preconditionFailed();
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
      const children = await listCollectionChildren(current, env);

      for (const item of children) {
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

    return xmlResponse(propfindCollectionBody(responses), 207);
  }

  if (request.method === "HEAD") {
    if (!current) return notFound();

    if (current.kind === "collection") {
      return new Response(null, { status: 200, headers: { DAV: DAV_HEADER } });
    }

    return new Response(null, {
      status: 200,
      headers: {
        "Content-Length": String(current.size ?? 0),
        "Content-Type": current.contentType ?? "application/octet-stream",
        ETag: current.etag ?? etagFor(current.key, current.size ?? 0),
        DAV: DAV_HEADER,
      },
    });
  }

  if (request.method === "MKCOL") {
    if (!key) return badRequest();
    if (current) return conflict();
    if (!(await parentExists(key, env))) return conflict();

    await storage.r2.put(`${key}/.folder`, new Uint8Array([]), env);
    return new Response(null, { status: 201, headers: { DAV: DAV_HEADER } });
  }

  if (request.method === "PUT") {
    if (!key) return badRequest();

    const lockResp = await requireWriteLock(key, request, env);
    if (lockResp) return lockResp;

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
      headers: { DAV: DAV_HEADER },
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
        DAV: DAV_HEADER,
      },
    });
  }

  if (request.method === "DELETE") {
    if (!current) return notFound();

    const lockResp = await requireWriteLock(key!, request, env);
    if (lockResp) return lockResp;

    if (current.kind === "collection") {
      const children = await collectCollectionKeysRecursive(current.key, env);
      for (const childKey of children) {
        await storage.r2.del(childKey, env);
      }
      await storage.r2.del(`${current.key}/.folder`, env);
      await deleteLockRecord(current.key, env);

      return new Response(null, { status: 204, headers: { DAV: DAV_HEADER } });
    }

    await storage.r2.del(key!, env);
    await deleteLockRecord(key!, env);

    return new Response(null, { status: 204, headers: { DAV: DAV_HEADER } });
  }

  return methodNotAllowed();
}
