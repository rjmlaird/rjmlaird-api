import { Hono } from "hono";
import { storage } from "../services/storage";

type WebdavEnv = Env & {
  ZOTERO_WEBDAV_USER?: string;
  ZOTERO_WEBDAV_PASS?: string;
};

const webdav = new Hono<{ Bindings: WebdavEnv }>();

const BASE_PREFIX = "zotero";
const MOUNT_PREFIX = "/webdav";
const DAV_HEADER = "1,2";
const ALLOW_HEADER = "OPTIONS, GET, PUT, DELETE, PROPFIND, HEAD, MKCOL, LOCK, UNLOCK";
const LOCK_TIMEOUT_SECONDS = 300;

type LockRecord = {
  token: string;
  key: string;
  expiresAt: number;
};

type DavFile = {
  kind: "file";
  key: string;
  size: number;
  contentType?: string;
  etag?: string;
};

type DavCollection = {
  kind: "collection";
  key: string;
  etag?: string;
};

type DavNode = DavFile | DavCollection;

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xml(body: string, status: number, headers: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      DAV: DAV_HEADER,
      ...headers,
    },
  });
}

function plain(body: string | null, status: number, headers: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: {
      DAV: DAV_HEADER,
      ...headers,
    },
  });
}

function normalizePath(pathname: string) {
  const path = pathname.replace(/^\/+/, "");
  const afterMount =
    path === "webdav"
      ? ""
      : path.startsWith("webdav/")
        ? path.slice("webdav/".length)
        : path.startsWith("v1/webdav/")
          ? path.slice("v1/webdav/".length)
          : path;

  return afterMount.replace(/^zotero\/?/, "").replace(/\/+$/, "");
}

function toKey(path: string | null) {
  if (!path) return BASE_PREFIX;
  const cleaned = path.replace(/^\/+/, "").replace(/\/+$/, "");
  return cleaned ? `${BASE_PREFIX}/${cleaned}` : BASE_PREFIX;
}

function etagFor(key: string, size = 0) {
  return `"${key}:${size}"`;
}

function listArray(result: unknown): Array<{ key: string; size?: number; contentType?: string; etag?: string }> {
  if (!result) return [];
  if (Array.isArray(result)) return result as Array<{ key: string; size?: number; contentType?: string; etag?: string }>;
  if (typeof result === "object" && result !== null) {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.objects)) return r.objects as Array<{ key: string; size?: number; contentType?: string; etag?: string }>;
    if (Array.isArray(r.keys)) return r.keys as Array<{ key: string; size?: number; contentType?: string; etag?: string }>;
  }
  return [];
}

async function getLockRecord(key: string, env: Env): Promise<LockRecord | null> {
  const obj = await storage.r2.get(`locks/${key}`, env);
  if (!obj?.body) return null;

  try {
    const text = await new Response(obj.body).text();
    const record = JSON.parse(text) as LockRecord;
    if (!record.token || !record.key || Date.now() > record.expiresAt) {
      await storage.r2.del(`locks/${key}`, env);
      return null;
    }
    return record;
  } catch {
    await storage.r2.del(`locks/${key}`, env);
    return null;
  }
}

async function setLockRecord(record: LockRecord, env: Env) {
  const body = new TextEncoder().encode(JSON.stringify(record));
  await storage.r2.put(`locks/${record.key}`, body, env, "application/json");
}

async function deleteLockRecord(key: string, env: Env) {
  await storage.r2.del(`locks/${key}`, env);
}

async function exists(key: string, env: Env): Promise<DavNode | null> {
  const file = await storage.r2.get(key, env);
  if (file) {
    return {
      kind: "file",
      key,
      size: file.size ?? 0,
      contentType: file.contentType ?? undefined,
      etag: file.etag ?? undefined,
    };
  }

  const marker = await storage.r2.get(`${key}/.folder`, env);
  if (marker) {
    return {
      kind: "collection",
      key,
      etag: etagFor(`${key}/.folder`, 0),
    };
  }

  return null;
}

async function parentExists(key: string, env: Env) {
  const parent = key.includes("/") ? key.slice(0, key.lastIndexOf("/")) : BASE_PREFIX;
  if (!parent || parent === BASE_PREFIX) return true;
  return !!(await exists(parent, env));
}

function hrefFromPath(path: string) {
  const cleaned = path.replace(/^\/+/, "").replace(/\/+$/, "");
  return cleaned ? `${MOUNT_PREFIX}/zotero/${encodeURI(cleaned)}` : `${MOUNT_PREFIX}/zotero/`;
}

function propfindItem(node: DavNode, requestPath: string, displayname: string) {
  const href = hrefFromPath(requestPath);
  const resType = node.kind === "collection" ? "<d:collection/>" : "";
  const etag = node.etag ?? etagFor(node.key, node.kind === "file" ? node.size : 0);
  const len = node.kind === "collection" ? 0 : node.size;

  return `\n<d:response>\n  <d:href>${escapeXml(href)}</d:href>\n  <d:propstat>\n    <d:prop>\n      <d:resourcetype>${resType}</d:resourcetype>\n      <d:displayname>${escapeXml(displayname)}</d:displayname>\n      <d:getetag>${escapeXml(etag)}</d:getetag>\n      <d:getcontentlength>${len}</d:getcontentlength>\n    </d:prop>\n    <d:status>HTTP/1.1 200 OK</d:status>\n  </d:propstat>\n</d:response>`;
}

function multistatus(items: string[]) {
  return `<?xml version="1.0" encoding="utf-8"?>\n<d:multistatus xmlns:d="DAV:">${items.join("")}</d:multistatus>`;
}

function parseLockToken(request: Request) {
  const token = request.headers.get("lock-token");
  return token ? token.replace(/^<|>$/g, "").trim() : null;
}

/** Validates the Authorization header's Basic credentials against the
 *  configured Zotero WebDAV username/password. Returns true only if both
 *  are set and match exactly. */
function checkBasicAuth(request: Request, env: WebdavEnv): boolean {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) return false;

  if (!env.ZOTERO_WEBDAV_USER || !env.ZOTERO_WEBDAV_PASS) return false;

  try {
    const decoded = atob(header.slice(6));
    const separatorIndex = decoded.indexOf(":");
    if (separatorIndex === -1) return false;

    const user = decoded.slice(0, separatorIndex);
    const pass = decoded.slice(separatorIndex + 1);
    return user === env.ZOTERO_WEBDAV_USER && pass === env.ZOTERO_WEBDAV_PASS;
  } catch {
    return false;
  }
}

/** Lists immediate children (files + one-level-deep subfolders) under a
 *  collection key by scanning R2 keys with that prefix. */
async function listChildren(
  collectionKey: string,
  env: WebdavEnv
): Promise<Array<{ name: string; node: DavNode }>> {
  const listPrefix = collectionKey === BASE_PREFIX ? `${BASE_PREFIX}/` : `${collectionKey}/`;
  const raw = await storage.r2.list(listPrefix, env);
  const items = listArray(raw);

  const children = new Map<string, { name: string; node: DavNode }>();

  for (const item of items) {
    if (item.key.startsWith("locks/")) continue; // separate namespace, not part of the tree

    const rest = item.key.slice(listPrefix.length);
    if (!rest) continue;

    const [first, ...remainder] = rest.split("/");
    if (!first) continue;

    const childKey = `${collectionKey === BASE_PREFIX ? BASE_PREFIX : collectionKey}/${first}`;

    if (remainder.length > 0) {
      // Nested deeper — first segment is a subfolder.
      if (!children.has(first) || children.get(first)!.node.kind !== "collection") {
        children.set(first, { name: first, node: { kind: "collection", key: childKey, etag: etagFor(childKey, 0) } });
      }
    } else if (first === ".folder") {
      continue; // marker for the current collection itself, not a child
    } else {
      children.set(first, {
        name: first,
        node: { kind: "file", key: item.key, size: item.size ?? 0, contentType: item.contentType, etag: item.etag },
      });
    }
  }

  return Array.from(children.values());
}

webdav.all("*", async (c) => {
  const request = c.req.raw;

  if (!request.headers.get("authorization") || !checkBasicAuth(request, c.env)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        DAV: DAV_HEADER,
        "WWW-Authenticate": 'Basic realm="Zotero WebDAV", charset="UTF-8"',
      },
    });
  }

  const pathname = normalizePath(new URL(request.url).pathname);
  const key = toKey(pathname || null);
  const root = !pathname;

  const current: DavNode | null = root
    ? { kind: "collection", key: BASE_PREFIX, etag: etagFor(BASE_PREFIX, 0) }
    : await exists(key, c.env);

  switch (request.method) {
    case "OPTIONS":
      return new Response(null, {
        status: 204,
        headers: {
          DAV: DAV_HEADER,
          Allow: ALLOW_HEADER,
          "MS-Author-Via": "DAV",
        },
      });

    case "HEAD":
    case "GET": {
      if (!current) return plain("Not Found", 404);
      if (current.kind === "collection") {
        return plain("Cannot GET a collection", 404);
      }

      const obj = await storage.r2.get(current.key, c.env);
      if (!obj) return plain("Not Found", 404);

      const headers: Record<string, string> = {
        "Content-Type": current.contentType ?? "application/octet-stream",
        "Content-Length": String(current.size),
        ETag: current.etag ?? etagFor(current.key, current.size),
      };

      if (request.method === "HEAD") {
        return plain(null, 200, headers);
      }

      return new Response(obj.body, { status: 200, headers: { DAV: DAV_HEADER, ...headers } });
    }

    case "PUT": {
      if (root) return plain("Cannot PUT to root collection", 405);

      const lock = await getLockRecord(key, c.env);
      const requestToken = parseLockToken(request);
      if (lock && lock.token !== requestToken) {
        return plain("Locked", 423);
      }

      if (!(await parentExists(key, c.env))) {
        return plain("Conflict: parent collection does not exist", 409);
      }

      const contentType = request.headers.get("content-type") ?? "application/octet-stream";
      const body = await request.arrayBuffer();
      await storage.r2.put(key, body, c.env, contentType);

      return plain(null, current ? 204 : 201, {
        ETag: etagFor(key, body.byteLength),
      });
    }

    case "DELETE": {
      if (root) return plain("Cannot DELETE root collection", 405);
      if (!current) return plain("Not Found", 404);

      const lock = await getLockRecord(key, c.env);
      const requestToken = parseLockToken(request);
      if (lock && lock.token !== requestToken) {
        return plain("Locked", 423);
      }

      if (current.kind === "collection") {
        const children = await listChildren(key, c.env);
        for (const child of children) {
          await storage.r2.del(child.node.key, c.env);
        }
        await storage.r2.del(`${key}/.folder`, c.env);
      } else {
        await storage.r2.del(key, c.env);
      }

      await deleteLockRecord(key, c.env);
      return plain(null, 204);
    }

    case "MKCOL": {
      if (current) return plain("Already exists", 405);
      if (!(await parentExists(key, c.env))) {
        return plain("Conflict: parent collection does not exist", 409);
      }

      await storage.r2.put(`${key}/.folder`, new Uint8Array(0), c.env, "application/x-directory");
      return plain(null, 201);
    }

    case "PROPFIND": {
      if (!current) return plain("Not Found", 404);

      const depthHeader = request.headers.get("depth") ?? "1";
      const depth = depthHeader === "0" ? 0 : 1; // "infinity" is not supported — treated as 1

      const selfName = root ? "zotero" : key.slice(key.lastIndexOf("/") + 1);
      const items = [propfindItem(current, pathname, selfName)];

      if (depth === 1 && current.kind === "collection") {
        const children = await listChildren(key, c.env);
        for (const child of children) {
          const childPath = root ? child.name : `${pathname}/${child.name}`;
          items.push(propfindItem(child.node, childPath, child.name));
        }
      }

      return xml(multistatus(items), 207);
    }

    case "LOCK": {
      if (root) return plain("Cannot lock root collection", 405);

      const existingLock = await getLockRecord(key, c.env);
      if (existingLock) {
        return plain("Locked", 423);
      }

      const token = `urn:uuid:${crypto.randomUUID()}`;
      const record: LockRecord = {
        token,
        key,
        expiresAt: Date.now() + LOCK_TIMEOUT_SECONDS * 1000,
      };
      await setLockRecord(record, c.env);

      const lockBody = `<?xml version="1.0" encoding="utf-8"?>\n<d:prop xmlns:d="DAV:">\n  <d:lockdiscovery>\n    <d:activelock>\n      <d:locktype><d:write/></d:locktype>\n      <d:lockscope><d:exclusive/></d:lockscope>\n      <d:depth>0</d:depth>\n      <d:timeout>Second-${LOCK_TIMEOUT_SECONDS}</d:timeout>\n      <d:locktoken><d:href>${escapeXml(token)}</d:href></d:locktoken>\n    </d:activelock>\n  </d:lockdiscovery>\n</d:prop>`;

      return xml(lockBody, 200, { "Lock-Token": `<${token}>` });
    }

    case "UNLOCK": {
      const requestToken = parseLockToken(request);
      const lock = await getLockRecord(key, c.env);

      if (!lock || !requestToken || lock.token !== requestToken) {
        return plain("Lock token mismatch", 409);
      }

      await deleteLockRecord(key, c.env);
      return plain(null, 204);
    }

    default:
      return new Response("Method not allowed", {
        status: 405,
        headers: { DAV: DAV_HEADER, Allow: ALLOW_HEADER },
      });
  }
});

export default webdav;
