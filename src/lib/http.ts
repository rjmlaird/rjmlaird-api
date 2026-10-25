// Shared response helpers for the v1 routes: ETag/304, pagination, consistent errors.
import type { Context } from "hono";

export const API_VERSION = "v1";

/** Two 32-bit FNV-1a passes combined; cheap, sync, and plenty for ETags (not security). */
export function hashString(input: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    a = Math.imul(a ^ ch, 0x01000193) >>> 0;
    b = Math.imul(b ^ ch, 0x85ebca6b) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

const BASE_HEADERS = {
  // Bundled data only changes on deploy, so clients revalidate with the ETag rather than
  // trusting a stale copy; the CDN is told not to keep its own copy across deploys.
  "Cache-Control": "public, max-age=0, must-revalidate",
  "CDN-Cache-Control": "no-store",
  "Cloudflare-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

function matchesEtag(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === "*") return true;
  const strip = (v: string) => v.trim().replace(/^W\//, "");
  return header.split(",").some((v) => strip(v) === strip(etag));
}

/** JSON (or JSON-LD) response with a content-derived weak ETag and 304 support. */
export function respond(
  c: Context,
  body: unknown,
  opts: { status?: number; contentType?: string } = {},
): Response {
  const text = JSON.stringify(body);
  const status = opts.status ?? 200;
  const headers = new Headers(BASE_HEADERS);
  headers.set("Content-Type", opts.contentType ?? "application/json; charset=utf-8");

  if (status === 200) {
    const etag = `W/"${hashString(text)}"`;
    headers.set("ETag", etag);
    if (matchesEtag(c.req.header("If-None-Match"), etag)) {
      return new Response(null, { status: 304, headers });
    }
  }
  return new Response(text, { status, headers });
}

export function errorResponse(
  c: Context,
  status: number,
  error: string,
  extra: Record<string, unknown> = {},
): Response {
  return respond(c, { error, ...extra }, { status });
}

export type Page = { limit: number; offset: number };

/** Parses ?limit= and ?offset=. Returns a Page, or an error message for the caller to 400 with. */
export function parsePage(
  query: Record<string, string | undefined>,
  opts: { defaultLimit: number; maxLimit: number },
): Page | { error: string } {
  const read = (name: string, fallback: number, min: number, max: number) => {
    const raw = query[name];
    if (raw === undefined || raw === "") return fallback;
    if (!/^\d+$/.test(raw)) return { error: `${name} must be a non-negative integer` };
    const n = Number(raw);
    if (n < min || n > max) return { error: `${name} must be between ${min} and ${max}` };
    return n;
  };
  const limit = read("limit", opts.defaultLimit, 1, opts.maxLimit);
  if (typeof limit !== "number") return limit;
  const offset = read("offset", 0, 0, 1_000_000);
  if (typeof offset !== "number") return offset;
  return { limit, offset };
}

export function paginate<T>(items: T[], page: Page) {
  const slice = items.slice(page.offset, page.offset + page.limit);
  return {
    items: slice,
    meta: {
      total: items.length,
      count: slice.length,
      limit: page.limit,
      offset: page.offset,
      nextOffset: page.offset + slice.length < items.length ? page.offset + slice.length : null,
    },
  };
}

/** Builds an absolute URL on the request's own origin. */
export function link(c: Context, path: string): string {
  return new URL(path, new URL(c.req.url).origin).toString();
}

const MAX_QUERY = 100;

/** Lower-cases, strips accents and collapses punctuation so "Earth-observation" matches "earth observation". */
export function fold(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Returns the folded query, null when absent, or an error string when invalid. */
export function parseQuery(q: string | undefined): string | null | { error: string } {
  if (q === undefined) return null;
  const folded = fold(q);
  if (!folded) return null;
  if (q.length > MAX_QUERY) return { error: `q must be ${MAX_QUERY} characters or fewer` };
  return folded;
}

export const matches = (foldedQuery: string, ...fields: (string | undefined | null)[]) =>
  fields.some((f) => f && fold(f).includes(foldedQuery));

export function csv(value: string | undefined): string[] {
  return value ? value.split(",").map((v) => v.trim()).filter(Boolean) : [];
}
