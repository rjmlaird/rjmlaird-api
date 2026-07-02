export async function handleWebDAV(request: Request, env: any) {
  const key = new URL(request.url)
    .pathname
    .replace(/^\/v1\/webdav\/?/, "");

  if (!key) {
    return new Response("WebDAV root", { status: 200 });
  }

  switch (request.method) {
    case "PUT": {
      const body = await request.arrayBuffer();

      await env.R2.put(key, body, {
        httpMetadata: {
          contentType:
            request.headers.get("content-type") || "application/octet-stream",
        },
      });

      return new Response("Created", { status: 201 });
    }

    case "GET": {
      const obj = await env.R2.get(key);
      if (!obj) return new Response("Not found", { status: 404 });

      return new Response(obj.body, {
        headers: {
          "Content-Type":
            obj.httpMetadata?.contentType || "application/octet-stream",
          "ETag": obj.etag || "",
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