export async function handleWebDAV(request: Request, env: any) {
  const url = new URL(request.url);

  // normalise path safely (removes /v1/webdav and leading slash issues)
  let key = url.pathname.replace(/^\/v1\/webdav\/?/, "");

  // prevent accidental empty string collisions
  if (key === "") {
    return new Response("WebDAV root", { status: 200 });
  }

  // optional but IMPORTANT: ensure no leading slash survives
  key = key.replace(/^\/+/, "");

  switch (request.method) {
    case "PUT": {
      const body = await request.arrayBuffer();

      await env.R2.put(key, body, {
        httpMetadata: {
          contentType:
            request.headers.get("content-type") ?? "application/octet-stream",
        },
      });

      return new Response("Created", { status: 201 });
    }

    case "GET": {
      const obj = await env.R2.get(key);

      if (!obj) {
        return new Response(`Not found: ${key}`, { status: 404 });
      }

      return new Response(obj.body, {
        headers: {
          "Content-Type":
            obj.httpMetadata?.contentType ?? "application/octet-stream",
          ETag: obj.etag ?? "",
        },
      });
    }

    case "DELETE": {
      await env.R2.delete(key);
      return new Response("Deleted");
    }

    default:
      return new Response("Method not supported", { status: 405 });
  }
}