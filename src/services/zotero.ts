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
  // normalise slashes
  const clean = path.startsWith("/") ? path.slice(1) : path;
  return `${BASE_PREFIX}${clean}`;
}

/**
 * Upload file coming from Zotero WebDAV
 */
export async function zoteroPut(
  env: any,
  path: string,
  body: ArrayBuffer,
  contentType?: string
) {
  const key = buildZoteroKey(path);

  return putR2Object(env, key, body, contentType);
}

/**
 * Retrieve file for Zotero
 */
export async function zoteroGet(env: any, path: string) {
  const key = buildZoteroKey(path);
  return getR2Object(env, key);
}

/**
 * Delete file from Zotero storage
 */
export async function zoteroDelete(env: any, path: string) {
  const key = buildZoteroKey(path);
  return deleteR2Object(env, key);
}

/**
 * List Zotero "folders" (collections)
 */
export async function zoteroList(env: any, prefix = "") {
  return listR2Objects(env, `${BASE_PREFIX}${prefix}`);
}

/**
 * Normalise Zotero collection structure
 * (future-proofing for research graph)
 */
export function parseZoteroPath(path: string) {
  const clean = path.replace(/^\/+/, "");

  const parts = clean.split("/");

  return {
    collection: parts[0] || null,
    subcollection: parts[1] || null,
    filename: parts.slice(2).join("/") || null,
  };
}