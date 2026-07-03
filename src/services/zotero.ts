import {
  putR2Object,
  getR2Object,
  deleteR2Object,
  listR2Objects,
} from "./r2";

/**
 * Base storage prefix for Zotero data in R2
 */
const BASE_PREFIX = "zotero/";

/**
 * Build structured key for Zotero files
 */
export function buildZoteroKey(path: string) {
  const clean = decodeURIComponent(path)
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");

  return `${BASE_PREFIX}${clean}`;
}

/**
 * Upload file coming from Zotero WebDAV
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
 * Retrieve file for Zotero
 */
export async function zoteroGet(env: Env, path: string) {
  const key = buildZoteroKey(path);
  return getR2Object(env, key);
}

/**
 * Delete file from Zotero storage
 */
export async function zoteroDelete(env: Env, path: string) {
  const key = buildZoteroKey(path);
  return deleteR2Object(env, key);
}

/**
 * List Zotero collections (flat view of R2 keys)
 */
export async function zoteroList(env: Env, prefix = "") {
  return listR2Objects(
    env,
    prefix ? `${BASE_PREFIX}${prefix.replace(/^\/+/, "")}` : BASE_PREFIX
  );
}

/**
 * Parse Zotero path into logical components
 */
export function parseZoteroPath(path: string) {
  const clean = decodeURIComponent(path)
    .replace(/^\/+/, "");

  const parts = clean.split("/");

  return {
    collection: parts[0] || null,
    subcollection: parts[1] || null,
    filename: parts.slice(2).join("/") || null,
  };
}