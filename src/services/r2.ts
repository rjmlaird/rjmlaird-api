export interface R2ObjectMeta {
  key: string;
  size?: number;
  etag?: string;
  uploaded?: string; // ISO string (normalized)
  contentType?: string | null;
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
  return env.R2.put(key, body, {
    httpMetadata: {
      contentType: contentType ?? "application/octet-stream",
    },
  });
}

/**
 * GET OBJECT
 */
export async function getR2Object(env: Env, key: string) {
  const obj = await env.R2.get(key);

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
  return env.R2.delete(key);
}

/**
 * LIST OBJECTS (PAGINATED SAFE)
 */
export async function listR2Objects(
  env: Env,
  prefix?: string
): Promise<R2ObjectMeta[]> {
  const all: R2ObjectMeta[] = [];

  let cursor: string | undefined;

  do {
    const result = await env.R2.list({
      prefix,
      cursor,
      limit: 1000,
    });

    for (const obj of result.objects) {
      all.push({
        key: obj.key,
        size: obj.size,
        etag: obj.etag,
        uploaded: obj.uploaded ? obj.uploaded.toISOString() : undefined,
      });
    }

    cursor = result.truncated ? result.cursor : undefined;
  } while (cursor);

  return all;
}