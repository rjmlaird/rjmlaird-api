import { Hono } from "hono";
import { storage } from "../services/storage";

const webdav = new Hono<{ Bindings: Env }>();

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

function plain(body: string, status: number, headers: Record<string, string> = {}) {
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

webdav.all("*", async (c) => {
  const request = c.req.raw;

  if (!request.headers.get("authorization")) {
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
    // keep the rest as-is
    default:
      return new Response("Method not allowed", {
        status: 405,
        headers: { DAV: DAV_HEADER, Allow: ALLOW_HEADER },
      });
  }
});

export default webdav;
