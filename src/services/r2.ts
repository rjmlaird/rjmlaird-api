export interface R2ObjectMeta {
  key: string;
  size?: number;
  etag?: string;
  uploaded?: string;
  contentType?: string | null;
}

/**
 * OPTIONAL: centralised key normalisation hook
 * (useful for WebDAV + Zotero consistency)
 */
function normaliseKey(key: string) {
  return key.replace(/^\/+/, "").replace(/\/+/g, "/");
}

/**
 * PUT OBJECT
 */
export async function putR2Object(
  env: Env,
  key: string,
  body: ArrayBuffer | ArrayBufferView | ReadableStream,
  contentType?: string
) {
  const safeKey = normaliseKey(key);

  return env.R2.put(safeKey, body, {
    httpMetadata: {
      contentType: contentType ?? "application/octet-stream",
    },
  });
}

/**
 * GET OBJECT
 */
export async function getR2Object(env: Env, key: string) {
  const safeKey = normaliseKey(key);

  const obj = await env.R2.get(safeKey);

  if (!obj) return null;

  return {
    body: obj.body,
    size: obj.size,
    etag: obj.etag,
    contentType: obj.httpMetadata?.contentType ?? null,
  };
}

/**
 * DELETE OBJECT
 */
export async function deleteR2Object(env: Env, key: string) {
  const safeKey = normaliseKey(key);

  return env.R2.delete(safeKey);
}

/**
 * LIST OBJECTS (SAFE + GUARDED PAGINATION)
 */
export async function listR2Objects(
  env: Env,
  prefix?: string
): Promise<R2ObjectMeta[]> {
  const all: R2ObjectMeta[] = [];

  let cursor: string | undefined = undefined;
  let iteration = 0;

  const safePrefix = prefix ? normaliseKey(prefix) : undefined;

  do {
    iteration++;

    // safety guard (prevents infinite loops if API behaves unexpectedly)
    if (iteration > 100) break;

    const result = await env.R2.list({
      prefix: safePrefix,
      cursor,
      limit: 1000,
    });

    for (const obj of result.objects) {
      all.push({
        key: obj.key,
        size: obj.size,
        etag: obj.etag,
        uploaded: obj.uploaded,
      });
    }

    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);

  return all;
}