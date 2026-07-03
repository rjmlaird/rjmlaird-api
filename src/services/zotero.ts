import {
  putR2Object,
  getR2Object,
  deleteR2Object,
  listR2Objects,
} from "./r2";

/**
 * ======================================================
 * SINGLE SOURCE OF TRUTH PREFIX
 * ======================================================
 */
const BASE_PREFIX = "zotero";

/**
 * Normalize a Zotero path into a safe R2 key segment
 * (IMPORTANT: no double-prefixing allowed)
 */
function normalizePath(path: string): string {
  const clean = decodeURIComponent(path)
    .trim()
    .replace(/^\/+/, "")
    .replace(/^zotero\/?/, "") // 🔥 prevents zotero/zotero bug
    .replace(/\/+/g, "/");

  return clean;
}

/**
 * Build final R2 key
 */
export function buildZoteroKey(path: string) {
  const normalized = normalizePath(path);

  if (!normalized) {
    return BASE_PREFIX;
  }

  return `${BASE_PREFIX}/${normalized}`;
}

/**
 * PUT
 */
export async function zoteroPut(
  env: Env,
  path: string,
  body: ArrayBuffer | ArrayBufferView | ReadableStream,
  contentType?: string
) {
  const key = buildZoteroKey(path);
  return putR2Object(env, key, body, contentType);
}

/**
 * GET
 */
export async function zoteroGet(env: Env, path: string) {
  const key = buildZoteroKey(path);
  return getR2Object(env, key);
}

/**
 * DELETE
 */
export async function zoteroDelete(env: Env, path: string) {
  const key = buildZoteroKey(path);
  return deleteR2Object(env, key);
}

/**
 * LIST
 */
export async function zoteroList(env: Env, prefix = "") {
  const normalized = normalizePath(prefix);

  return listR2Objects(
    env,
    normalized ? `${BASE_PREFIX}/${normalized}` : `${BASE_PREFIX}`
  );
}

/**
 * Parse path into logical structure (safe debug utility)
 */
export function parseZoteroPath(path: string) {
  const clean = normalizePath(path);

  const parts = clean.split("/").filter(Boolean);

  return {
    collection: parts[0] || null,
    subcollection: parts[1] || null,
    filename: parts.slice(2).join("/") || null,
  };
}