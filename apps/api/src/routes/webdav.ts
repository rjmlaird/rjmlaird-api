import { Hono } from "hono";
import { storage } from "../services/storage";

const webdav = new Hono<{ Bindings: Env }>();

const BASE_PREFIX = "zotero";
const DAV_HEADER = "1,2";
const ALLOW_HEADER = "OPTIONS, GET, PUT, DELETE, PROPFIND, HEAD, MKCOL, LOCK, UNLOCK";
const LOCK_TIMEOUT_SECONDS = 300;

type LockRecord = {
  token: string;
  key: string;
  expiresAt: number;
};

type DavNode =
  | { kind: "file"; key: string; size: number; contentType?: string; etag?: string }
  | { kind: "collection"; key: string; etag?: string };

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
  return pathname
    .replace(/^/+/, "")
    .replace(/^v1/webdav/?/, "")
    .replace(/^webdav/?/, "")
    .replace(/^zotero/?/, "")
    .replace(//+$/, "");
}

function toKey(path: string | null) {
  if (!path) return null;
  const cleaned = path.replace(/^/+/, "").replace(//+$/, "");
  return cleaned ? `${BASE_PREFIX}/${cleaned}` : BASE_PREFIX;
}

function etagFor(key: string, size = 0) {
  return `"${key}:${size}"`;
}

function listArray(result: unknown): Array<{ key: string; size?: number; contentType?: string; etag?: string }> {
  if (!result) return [];
  if (Array.isArray(result)) {
    return result as Array<{ key: string; size?: number; contentType?: string; etag?: string }>;
  }
  if (typeof result === "object" && result !== null) {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.objects)) {
      return r.objects as Array<{ key: string; size?: number; contentType?: string; etag?: string }>;
    }
    if (Array.isArray(r.keys)) {
      return r.keys as Array<{ key: string; size?: number; contentType?: string; etag?: string }>;
    }
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
  const cleaned = path.replace(/^/+/, "").replace(//+$/, "");
  return cleaned ? `/webdav/zotero/${encodeURI(cleaned)}` : "/webdav/zotero/";
}

function propfindItem(node: DavNode, requestPath: string, displayname: string) {
  const href = hrefFromPath(requestPath);
  const resType = node.kind === "collection" ? "<d:collection/>" : "";
  const etag = node.etag ?? etagFor(node.key, node.kind === "file" ? node.size : 0);
  const len = node.kind === "collection" ? 0 : node.size;

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

function multistatus(items: string[]) {
  return `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">${items.join("")}</d:multistatus>`;
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
  const key = pathname ? toKey(pathname) : BASE_PREFIX;
  const root = !pathname || pathname === BASE_PREFIX;
  const current = root
    ? { kind: "collection", key: BASE_PREFIX, etag: etagFor(BASE_PREFIX, 0) }
    : key
      ? await exists(key, c.env)
      : null;

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

    case "LOCK": {
      if (!key) return plain("Bad request", 400);

      const existing = await getLockRecord(key, c.env);
      if (existing) {
        const supplied = parseLockToken(request);
        if (supplied !== existing.token) {
          return xml(
            `<?xml version="1.0" encoding="utf-8"?>
<D:error xmlns:D="DAV:">
  <D:lock-token-submitted>
    <D:href>${escapeXml(`/webdav/${pathname || BASE_PREFIX}/`)}</D:href>
  </D:lock-token-submitted>
</D:error>`,
            423
          );
        }

        existing.expiresAt = Date.now() + LOCK_TIMEOUT_SECONDS * 1000;
        await setLockRecord(existing, c.env);

        return xml(
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
      await setLockRecord(
        {
          token,
          key,
          expiresAt: Date.now() + LOCK_TIMEOUT_SECONDS * 1000,
        },
        c.env
      );

      return xml(
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

    case "UNLOCK": {
      if (!key) return plain("Precondition failed", 412);
      const record = await getLockRecord(key, c.env);
      const token = parseLockToken(request);
      if (record && token === record.token) {
        await deleteLockRecord(key, c.env);
        return new Response(null, { status: 204, headers: { DAV: DAV_HEADER } });
      }
      return plain("Precondition failed", 412);
    }

    case "PROPFIND": {
      if (!current) return plain("Not found", 404);

      const depth = request.headers.get("Depth") ?? "1";
      const responses: string[] = [];
      const selfPath = root ? "" : pathname;
      const selfDisplay = root ? "zotero" : pathname.split("/").pop() ?? "zotero";
      responses.push(propfindItem(current, selfPath, selfDisplay));

      if (depth !== "0" && current.kind === "collection") {
        const list = listArray(await storage.r2.list(`${current.key}/`, c.env));
        for (const item of list) {
          if (!item?.key || item.key === `${current.key}/.folder`) continue;

          const rel = item.key.startsWith(`${BASE_PREFIX}/`)
            ? item.key.slice(BASE_PREFIX.length + 1)
            : item.key;
          const isCollection = item.key.endsWith("/.folder");
          const hrefPath = isCollection ? rel.replace(//.folder$/, "") : rel;
          const display = hrefPath.split("/").pop() ?? hrefPath;

          responses.push(
            propfindItem(
              isCollection
                ? { kind: "collection", key: item.key, etag: item.etag }
                : {
                    kind: "file",
                    key: item.key,
                    size: item.size ?? 0,
                    contentType: item.contentType,
                    etag: item.etag,
                  },
              hrefPath,
              display
            )
          );
        }
      }

      return xml(multistatus(responses), 207);
    }

    case "HEAD": {
      if (!current) return plain("Not found", 404);
      if (current.kind === "collection") return new Response(null, { status: 200, headers: { DAV: DAV_HEADER } });

      return new Response(null, {
        status: 200,
        headers: {
          DAV: DAV_HEADER,
          "Content-Length": String(current.size ?? 0),
          "Content-Type": current.contentType ?? "application/octet-stream",
          ETag: current.etag ?? etagFor(current.key, current.size ?? 0),
        },
      });
    }

    case "MKCOL": {
      if (!pathname || root || current) return new Response(null, { status: 405, headers: { DAV: DAV_HEADER } });
      const targetKey = toKey(pathname);
      if (!targetKey) return new Response(null, { status: 405, headers: { DAV: DAV_HEADER } });
      if (!(await parentExists(targetKey, c.env))) return new Response(null, { status: 409, headers: { DAV: DAV_HEADER } });
      await storage.r2.put(`${targetKey}/.folder`, new Uint8Array([]), c.env);
      return new Response(null, { status: 201, headers: { DAV: DAV_HEADER } });
    }

    case "PUT": {
      if (!key) return plain("Bad request", 400);
      if (root) return new Response("Method not allowed", { status: 405, headers: { DAV: DAV_HEADER, Allow: ALLOW_HEADER } });

      const lock = await getLockRecord(key, c.env);
      const token = parseLockToken(request);
      if (lock && token !== lock.token) {
        return xml(
          `<?xml version="1.0" encoding="utf-8"?>
<D:error xmlns:D="DAV:">
  <D:lock-token-submitted>
    <D:href>${escapeXml(`/webdav/${key}`)}</D:href>
  </D:lock-token-submitted>
</D:error>`,
          423
        );
      }

      if (key !== BASE_PREFIX && !(await parentExists(key, c.env))) return plain("Conflict", 409);

      const body = await request.arrayBuffer();
      await storage.r2.put(key, body, c.env, request.headers.get("content-type") ?? "application/octet-stream");
      return new Response(null, { status: current ? 200 : 201, headers: { DAV: DAV_HEADER } });
    }

    case "GET": {
      if (!current) return plain("Not found", 404);

      if (current.kind === "collection") {
        return root
          ? new Response("WebDAV root", { status: 200, headers: { DAV: DAV_HEADER } })
          : new Response("Method not allowed", { status: 405, headers: { DAV: DAV_HEADER, Allow: ALLOW_HEADER } });
      }

      const obj = await storage.r2.get(key, c.env);
      if (!obj?.body) return plain("Not found", 404);

      return new Response(obj.body, {
        status: 200,
        headers: {
          DAV: DAV_HEADER,
          "Content-Type": obj.contentType ?? "application/octet-stream",
          "Content-Length": String(obj.size ?? 0),
          ETag: obj.etag ?? etagFor(key, obj.size ?? 0),
        },
      });
    }

    case "DELETE": {
      if (!current) return plain("Not found", 404);
      if (root) return plain("Forbidden", 403);

      const lock = await getLockRecord(key, c.env);
      const token = parseLockToken(request);
      if (lock && token !== lock.token) {
        return xml(
          `<?xml version="1.0" encoding="utf-8"?>
<D:error xmlns:D="DAV:">
  <D:lock-token-submitted>
    <D:href>${escapeXml(`/webdav/${key}`)}</D:href>
  </D:lock-token-submitted>
</D:error>`,
          423
        );
      }

      if (current.kind === "collection") {
        const list = listArray(await storage.r2.list(`${current.key}/`, c.env));
        for (const item of list) {
          if (item?.key) await storage.r2.del(item.key, c.env);
        }
        await storage.r2.del(`${current.key}/.folder`, c.env);
      } else {
        await storage.r2.del(key, c.env);
      }

      await deleteLockRecord(key, c.env);
      return new Response(null, { status: 204, headers: { DAV: DAV_HEADER } });
    }

    default:
      return new Response("Method not allowed", {
        status: 405,
        headers: { DAV: DAV_HEADER, Allow: ALLOW_HEADER },
      });
  }
});

export default webdav;
