import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { methodNotAllowed } from "hono/method-not-allowed";

import { json } from "./lib/jsonResponse";

import bio from "./routes/bio";
import builds from "./routes/builds";
import cv from "./routes/cv";
import general from "./routes/general";
import media from "./routes/media";
import portfolio from "./routes/portfolio";
import { site } from "./routes/site";

const app = new Hono<{ Bindings: Env }>();

const API_VERSION = "v1";
const SERVICE_NAME = "rjmlaird-api";
const VISIBILITY = "public-read-only";
const PUBLIC_METHODS = "GET, HEAD, OPTIONS";

/**
 * MIDDLEWARE
 */

app.use("*", logger());

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "HEAD", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 86400,
  }),
);

/**
 * HEALTH
 */

app.get("/healthz", () =>
  json({
    status: "ok",
    service: SERVICE_NAME,
    visibility: VISIBILITY,
  }),
);

/**
 * API INDEX
 */

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
      bio: "/v1/bio",
      builds: "/v1/builds",
      cv: "/v1/cv",
      portfolio: "/v1/portfolio",
      media: "/v1/media",
      general: "/v1/general",
      site: "/v1/site",
    },
  });
});

/**
 * VERSIONED ROUTES
 */

app.route("/v1/bio", bio);
app.route("/v1/builds", builds);
app.route("/v1/cv", cv);
app.route("/v1/portfolio", portfolio);
app.route("/v1/media", media);
app.route("/v1/general", general);
app.route("/v1/site", site);

/**
 * LEGACY ROUTES
 */

app.get("/api/profile", () =>
  json(
    {
      error: "Legacy endpoint",
      message: "Use /v1/bio instead.",
      endpoint: "/v1/bio",
    },
    410,
  ),
);

app.get("/api/socials", () =>
  json(
    {
      error: "Legacy endpoint",
      message: "Use /v1/bio/profiles or /v1/cv/socials instead.",
      endpoints: [
        "/v1/bio/profiles",
        "/v1/cv/socials",
      ],
    },
    410,
  ),
);

app.get("/api/:collection", (c) => {
  const collection = c.req.param("collection");

  return json(
    {
      error: "Legacy collection endpoint",
      collection,
      message: "Use the versioned /v1 endpoints instead.",
      endpoints: {
        bio: "/v1/bio",
        builds: "/v1/builds",
        cv: `/v1/cv/${collection}`,
        portfolio: `/v1/portfolio/${collection}`,
        media: `/v1/media/${collection}`,
      },
    },
    410,
  );
});

/**
 * ROOT SITE ROUTES
 */

app.route("/", site);

/**
 * UNSUPPORTED METHODS
 */

app.use(
  methodNotAllowed({
    app,
    onMethodNotAllowed: (c, methods) =>
      json(
        {
          error: "Method not allowed",
          message: "This API is public and read-only.",
          method: c.req.method,
          path: c.req.path,
        },
        405,
        {
          Allow:
            methods.length > 0
              ? methods.join(", ")
              : PUBLIC_METHODS,
        },
      ),
  }),
);

/**
 * NOT FOUND
 */

app.notFound((c) =>
  json(
    {
      error: "Route not found",
      path: c.req.path,
      method: c.req.method,
      documentation:
        `${new URL(c.req.url).origin}/openapi.json`,
    },
    404,
  ),
);

/**
 * ERROR HANDLING
 */

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
