import * as r2 from "./r2";
import * as zotero from "./zotero";

/**
 * ----------------------------------------------------
 * STORAGE ABSTRACTION LAYER
 * ----------------------------------------------------
 * Single entry point for all persistence operations:
 *
 * - R2 object storage (files, PDFs, assets)
 * - Zotero integration layer (research metadata sync)
 *
 * This prevents route-level coupling to storage backends.
 */
export const storage = {
  /**
   * -----------------------
   * RAW OBJECT STORAGE (R2)
   * -----------------------
   */
  r2: {
    /**
     * Upload a file to R2
     */
    put: async (key: string, body: BodyInit, env: Env, contentType?: string) => {
      return r2.put(key, body, env, contentType);
    },

    /**
     * Get a file from R2
     */
    get: async (key: string, env: Env) => {
      return r2.get(key, env);
    },

    /**
     * Delete a file from R2
     */
    del: async (key: string, env: Env) => {
      return r2.del(key, env);
    },

    /**
     * List objects in bucket
     */
    list: async (prefix: string | undefined, env: Env) => {
      return r2.list(prefix, env);
    }
  },

  /**
   * -----------------------
   * ZOTERO LAYER
   * -----------------------
   * Used for:
   * - research ingestion
   * - bibliographic metadata
   * - paper indexing
   */
  zotero: {
    /**
     * Store a research item
     */
    storeItem: async (item: any, env: Env) => {
      return zotero.storeItem(item, env);
    },

    /**
     * Fetch research items
     */
    getItems: async (env: Env) => {
      return zotero.getItems(env);
    },

    /**
     * Sync metadata from external sources
     */
    sync: async (env: Env) => {
      return zotero.sync(env);
    }
  }
};