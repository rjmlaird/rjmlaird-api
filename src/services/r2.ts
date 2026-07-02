export interface R2ObjectMeta {
  key: string;
  size?: number;
  etag?: string;
  uploaded?: Date;
  contentType?: string | null;
}

/**
 * Store object in R2
 */
export async function putR2Object(
  env: any,
  key: string,
  body: ArrayBuffer,
  contentType?: string
) {
  return env.R2.put(key, body, {
    httpMetadata: {
      contentType: contentType || "application/octet-stream",
    },
  });
}

/**
 * Retrieve object from R2
 */
export async function getR2Object(env: any, key: string) {
  const obj = await env.R2.get(key);

  if (!obj) return null;

  return {
    body: obj.body,
    size: obj.size,
    etag: obj.etag,
    contentType: obj.httpMetadata?.contentType || null,
  };
}

/**
 * Delete object from R2
 */
export async function deleteR2Object(env: any, key: string) {
  return env.R2.delete(key);
}

/**
 * List objects by prefix (useful for Zotero collections)
 */
export async function listR2Objects(env: any, prefix: string) {
  const result = await env.R2.list({ prefix });

  return result.objects.map((obj: any) => ({
    key: obj.key,
    size: obj.size,
    uploaded: obj.uploaded,
  }));
}