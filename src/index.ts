import { Hono } from "hono";
import { logger } from "hono/logger";

import { json } from "./lib/jsonResponse";

// Public, read-only route groups.
import cv from "./routes/cv";
import portfolio from "./routes/portfolio";
import media from "./routes/media";
import general from "./routes/general";
import { site } from "./routes/site";

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());

const API_VERSION = "v1";
const SERVICE_NAME = "rjmlaird-api";
const VISIBILITY = "public-read-only";

const publicRoutes = [
  "GET /healthz",
  "GET /v1",
  "GET /v1/cv/*",
  "GET /v1/portfolio/*",
  "GET /v1/media/*",
  "GET /v1/site/*",
  "GET /api/:collection",
  "GET /api/cv/:collection",
  "GET /api/profile",
  "GET /api/socials",
  "GET /api/portfolio/:collection",
  "GET /api/media/:collection",
] as const;

// Minimal public health endpoint.
// Do not expose bindings, versions, internal paths or operational state.
app.get("/healthz", (c) =>
  json({
    status: "ok",
    service: SERVICE_NAME,
    visibility: VISIBILITY,
  }),
);

// Public API discovery endpoint.
app.get("/v1", (c) => {
  const origin = new URL(c.req.url).origin;

  return json({
    name: SERVICE_NAME,
    version: API_VERSION,
    description:
      "Public, read-only professional portfolio API for Ryan Laird.",
    visibility: VISIBILITY,
    documentation: `${origin}/openapi.json`,
    endpoints: {
      health: "/healthz",
      profile: "/v1/cv/profile",
      cv: "/v1/cv",
      portfolio: "/v1/portfolio",
      media: "/v1/media",
      site: "/v1/site",
    },
  });
});

// Public route groups.
// These route modules must expose GET/HEAD endpoints only.
app.route("/v1/cv", cv);
app.route("/v1/portfolio", portfolio);
app.route("/v1/media", media);
app.route("/v1/site", general);

// Optional public documentation/site interface.
// This must not expose administrative routes, secrets, logs or private data.
app.route("/", site);

// Temporary compatibility endpoint for existing consumers.
// Prefer the versioned route groups above for all new integrations.
app.get("/api/:collection", (c) => {
  const collection = c.req.param("collection");

  return json(
    {
      error: "Legacy collection endpoint",
      collection,
      message:
        "Use the versioned /v1 endpoints instead.",
      endpoints: {
        cv: `/v1/cv/${collection}`,
        portfolio: `/v1/portfolio/${collection}`,
        media: `/v1/media/${collection}`,
      },
    },
    410,
  );
});

// Legacy profile shortcut.
app.get("/api/profile", (c) =>
  json({
    error: "Legacy endpoint",
    message: "Use /v1/cv/profile instead.",
    endpoint: "/v1/cv/profile",
  }, 410),
);

// Legacy social-links shortcut.
app.get("/api/socials", (c) =>
  json({
    error: "Legacy endpoint",
    message: "Use /v1/cv/socials instead.",
    endpoint: "/v1/cv/socials",
  }, 410),
);

// Explicitly reject non-read operations at the API boundary.
app.on(["POST", "PUT", "PATCH", "DELETE"], "*", (c) =>
  json(
    {
      error: "Method not allowed",
      message: "This API is public and read-only.",
      method: c.req.method,
      path: c.req.path,
    },
    405,
    {
      Allow: "GET, HEAD, OPTIONS",
    },
  ),
);

// CORS preflight for public consumers.
app.options("*", (c) =>
  new Response(null, {
    status: 204,
    headers: {
      Allow: "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  }),
);

// Global not-found response.
app.notFound((c) =>
  json(
    {
      error: "Route not found",
      path: c.req.path,
      method: c.req.method,
      documentation: "https://api.rjmlaird.co.uk/openapi.json",
    },
    404,
  ),
);

// Global error response.
// Avoid returning stack traces or internal exception details publicly.
app.onError((error, c) => {
  console.error(error);

  return json(
    {
      error: "Internal server error",
      requestId: c.req.header("cf-ray") ?? undefined,
    },
    500,
  );
});

export default app;
