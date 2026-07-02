export async function handleWebDAV(request: Request, env: any) {
  const url = new URL(request.url);
  const key = url.pathname.replace("/v1/webdav/", "");

  switch (request.method) {
    case "PUT": {
      const body = await request.arrayBuffer();

      await env.R2.put(key, body, {
        httpMetadata: {
          contentType:
            request.headers.get("content-type") || "application/pdf"
        }
      });

      return new Response("Created", { status: 201 });
    }

    case "GET": {
      const obj = await env.R2.get(key);
      if (!obj) return new Response("Not found", { status: 404 });

      return new Response(obj.body);
    }

    case "DELETE": {
      await env.R2.delete(key);
      return new Response("Deleted");
    }

    default:
      return new Response("Method not supported", { status: 405 });
  }
}