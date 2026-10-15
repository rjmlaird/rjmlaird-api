// src/lib/jsonResponse.ts

export function json<T>(
  data: T,
  status = 200,
  headers: HeadersInit = {},
): Response {
  const responseHeaders = new Headers(headers);

  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  responseHeaders.set(
    "Cache-Control",
    "public, max-age=0, must-revalidate",
  );
  responseHeaders.set("CDN-Cache-Control", "no-store");
  responseHeaders.set("Cloudflare-CDN-Cache-Control", "no-store");
  responseHeaders.set("X-Content-Type-Options", "nosniff");

  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders,
  });
}
