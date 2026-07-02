import * as r2 from "./r2";
import * as zotero from "./zotero";

/**
 * Storage abstraction layer
 */
export const storage = {
  /**
   * Raw R2 storage
   */
  r2: {
    put: (
      key: string,
      body: ArrayBuffer | ReadableStream,
      env: Env,
      contentType?: string
    ) => r2.putR2Object(env, key, body, contentType),

    get: (key: string, env: Env) =>
      r2.getR2Object(env, key),

    del: (key: string, env: Env) =>
      r2.deleteR2Object(env, key),

    list: (prefix: string | undefined, env: Env) =>
      r2.listR2Objects(env, prefix),
  },

  /**
   * Zotero WebDAV storage
   */
  zotero: {
    put: (
      path: string,
      body: ArrayBuffer,
      env: Env,
      contentType?: string
    ) => zotero.zoteroPut(env, path, body, contentType),

    get: (path: string, env: Env) =>
      zotero.zoteroGet(env, path),

    del: (path: string, env: Env) =>
      zotero.zoteroDelete(env, path),

    list: (prefix: string | undefined, env: Env) =>
      zotero.zoteroList(env, prefix),
  },
};