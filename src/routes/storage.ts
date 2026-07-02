export interface StorageObject {
  key: string;
  body?: ArrayBuffer | ReadableStream;
  contentType?: string;
}

/**
 * Put object into R2
 */
export async function putObject(env: any, key: string, body: ArrayBuffer, contentType?: string) {
  return env.R2.put(key, body, {
    httpMetadata: {
      contentType: contentType || "application/octet-stream"
    }
  });
}

/**
 * Get object from R2
 */
export async function getObject(env: any, key: string) {
  const obj = await env.R2.get(key);

  if (!obj) return null;

  return {
    body: obj.body,
    size: obj.size,
    etag: obj.etag,
    contentType: obj.httpMetadata?.contentType || null
  };
}

/**
 * Delete object from R2
 */
export async function deleteObject(env: any, key: string) {
  return env.R2.delete(key);
}

/**
 * List objects (useful for research indexing)
 */
export async function listObjects(env: any, prefix: string) {
  const result = await env.R2.list({
    prefix
  });

  return result.objects.map((obj: any) => ({
    key: obj.key,
    size: obj.size,
    uploaded: obj.uploaded
  }));
}