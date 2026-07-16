import { Hono } from "hono";
import { json } from "./lib/jsonResponse";

import system from "./routes/system";
import debug from "./routes/debug";
import webdav from "./routes/webdav";
import research from "./routes/research";
import cv from "./routes/cv";
import portfolio from "./routes/portfolio";
import contact from "./routes/contact";
import activities from "./routes/activities";
import general from "./routes/general";
import { aiApp } from "./routes/ai";

import awards from "./data/awards.json";
import certifications from "./data/certifications.json";
import credly from "./data/credly.json";
import education from "./data/education.json";
import experience from "./data/experience.json";
import { languages } from "./data/languages";
import memberships from "./data/memberships.json";
import profile from "./data/profile.json";
import skills from "./data/skills.json";
import teaching from "./data/teaching.json";
import { tools } from "./data/tools";
import volunteering from "./data/volunteering.json";

const app = new Hono<{ Bindings: Env }>();

const cvData = {
  awards,
  certifications,
  credly,
  education,
  experience,
  languages,
  memberships,
  profile,
  skills,
  teaching,
  tools,
  volunteering,
} satisfies Record<string, unknown>;

const cvCollections = [
  "awards",
  "certifications",
  "credly",
  "education",
  "experience",
  "languages",
  "memberships",
  "profile",
  "skills",
  "teaching",
  "tools",
  "volunteering",
] as const;

const openapiSpec = {
  openapi: "3.0.0",
  info: {
    title: "rjmlaird API",
    version: "1.0.0",
    description: "GitHub-powered CV + portfolio + contact + research + WebDAV API.",
  },
  servers: [{ url: "/" }],
  paths: {
    "/": {
      get: {
        summary: "API landing page",
        responses: {
          "200": {
            description: "Swagger UI landing page",
          },
        },
      },
    },
    "/health": {
      get: {
        summary: "Health check",
        responses: {
          "200": {
            description: "Healthy",
          },
        },
      },
    },
    "/openapi.json": {
      get: {
        summary: "OpenAPI document",
        responses: {
          "200": {
            description: "OpenAPI JSON document",
          },
        },
      },
    },
    "/api/{collection}": {
      get: {
        summary: "Get CV collection",
        parameters: [
          {
            name: "collection",
            in: "path",
            required: true,
            schema: {
              type: "string",
              enum: cvCollections,
            },
          },
        ],
        responses: {
          "200": {
            description: "Collection data",
          },
          "404": {
            description: "Collection not found",
          },
        },
      },
    },
    "/v1/research": {
      get: {
        summary: "Research API",
        responses: {
          "200": { description: "OK" },
        },
      },
    },
    "/v1/cv": {
      get: {
        summary: "CV API",
        responses: {
          "200": { description: "OK" },
        },
      },
    },
    "/v1/portfolio": {
      get: {
        summary: "Portfolio API",
        responses: {
          "200": { description: "OK" },
        },
      },
    },
    "/v1/contact": {
      post: {
        summary: "Contact API",
        responses: {
          "200": { description: "OK" },
        },
      },
    },
    "/v1/activities": {
      get: {
        summary: "Activities API",
        responses: {
          "200": { description: "OK" },
        },
      },
    },
    "/v1/general": {
      get: {
        summary: "General API",
        responses: {
          "200": { description: "OK" },
        },
      },
    },
    "/v1/ai": {
      post: {
        summary: "AI endpoint",
        responses: {
          "200": { description: "OK" },
        },
      },
    },
    "/webdav": {
      options: {
        summary: "WebDAV options",
        responses: {
          "204": { description: "No Content" },
        },
      },
      get: {
        summary: "WebDAV get",
        responses: {
          "200": { description: "OK" },
          "404": { description: "Not found" },
        },
      },
      put: {
        summary: "WebDAV put",
        responses: {
          "200": { description: "Updated" },
          "201": { description: "Created" },
        },
      },
      delete: {
        summary: "WebDAV delete",
        responses: {
          "204": { description: "Deleted" },
        },
      },
      propfind: {
        summary: "WebDAV propfind",
        responses: {
          "207": { description: "Multi-Status" },
        },
      },
      mkcol: {
        summary: "WebDAV mkcol",
        responses: {
          "201": { description: "Collection created" },
        },
      },
      lock: {
        summary: "WebDAV lock",
        responses: {
          "200": { description: "Locked" },
          "423": { description: "Locked" },
        },
      },
      unlock: {
        summary: "WebDAV unlock",
        responses: {
          "204": { description: "Unlocked" },
        },
      },
    },
  },
};

app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "rjmlaird-api",
    timestamp: new Date().toISOString(),
  })
);

app.route("/system", system);
app.route("/debug", debug);
app.route("/webdav", webdav);
app.route("/v1/research", research);
app.route("/v1/cv", cv);
app.route("/v1/portfolio", portfolio);
app.route("/v1/contact", contact);
app.route("/v1/activities", activities);
app.route("/v1/general", general);
app.route("/v1/ai", aiApp);

app.get("/api/:collection", (c) => {
  const collection = c.req.param("collection") as (typeof cvCollections)[number];

  if (!cvCollections.includes(collection)) {
    return json({ error: "Collection not found", collection, allowed: cvCollections }, 404);
  }

  return json(cvData[collection]);
});

app.get("/openapi.json", (c) => c.json(openapiSpec));

app.get("/", (c) =>
  c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>rjmlaird API</title>
    <meta name="description" content="rjmlaird API" />
    <meta name="theme-color" content="#0B0F1A" />

    <meta property="og:site_name" content="rjmlaird API" />
    <meta property="og:title" content="rjmlaird API" />
    <meta property="og:description" content="GitHub-powered CV + portfolio + contact + research + WebDAV API." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://rjmlaird.co.uk/api" />
    <meta property="og:image" content="https://rjmlaird.co.uk/og-image.png" />

    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="rjmlaird API" />
    <meta name="twitter:description" content="GitHub-powered CV + portfolio + contact + research + WebDAV API." />
    <meta name="twitter:image" content="https://rjmlaird.co.uk/og-image.png" />

    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/site.webmanifest" />

    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css"
      crossorigin="anonymous"
    />

    <style>
      :root{
        --ink:#0B0F1A;--ink2:#0F1520;--card:#141B29;--lift:#1A2236;
        --w:#EDEAE3;
        /* --m lightened from #6B7A96 -> #7C8AA4: the old value sat at ~4.4:1 on
           --ink, just under the 4.5:1 AA floor for body-sized text. */
        --m:#7C8AA4;--mb:#8892A4;
        --teal:#00C2A8;--td:rgba(0,194,168,.13);--tb:rgba(0,194,168,.26);
        --amber:#F5A623;--ad:rgba(245,166,35,.11);
        --violet:#A78BFA;--vd:rgba(167,139,250,.11);--vb:rgba(167,139,250,.26);
        --coral:#F87171;--cd:rgba(248,113,113,.11);
        --green:#4ADE80;--gd:rgba(74,222,128,.11);
        --sky:#38BDF8;--sd:rgba(56,189,248,.11);
        --bd:rgba(255,255,255,.07);--bm:rgba(255,255,255,.13);
        --focus:#7FE6D4;
        /* Shared content column width + fluid gutter. Under ~1370px the gutter
           is a flat 2.5rem, same as before. Past that it grows to keep the
           column from stretching edge-to-edge on wide/ultrawide monitors —
           it's just section padding, so full-bleed section backgrounds are
           untouched; no inner wrapper <div> needed. */
        --content-max:3200px;
        --gutter:max(2.5rem, calc((100% - var(--content-max)) / 2));
        --D:'Space Grotesk',sans-serif;--B:'Inter',sans-serif;
        color-scheme: dark;
      }

      body {
        margin: 0;
        font-family: system-ui, sans-serif;
        background: var(--ink);
        color: var(--w);
      }

      .wrap {
        max-width: 960px;
        margin: auto;
        padding: 48px 20px;
      }

      h1 {
        margin-bottom: 6px;
        color: #f8fafc;
      }

      p {
        color: var(--m);
        margin-top: 0;
        line-height: 1.5;
      }

      .card {
        background: var(--card);
        border: 1px solid var(--bd);
        border-radius: 12px;
        padding: 16px;
        margin-top: 16px;
        box-shadow: 0 14px 40px rgba(0, 0, 0, 0.22);
      }

      .card strong {
        color: #f8fafc;
        display: block;
        margin-bottom: 8px;
        font-size: 0.95rem;
        letter-spacing: 0.02em;
      }

      .endpoint {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 0;
        font-family: monospace;
        border-bottom: 1px solid var(--bd);
        color: var(--w);
        gap: 12px;
      }

      .endpoint:last-child {
        border-bottom: none;
      }

      .method {
        color: var(--sky);
        font-weight: 700;
        margin-right: 8px;
        text-transform: uppercase;
        letter-spacing: 0.02em;
        flex: 0 0 auto;
      }

      .path {
        color: #f8fafc;
        overflow-wrap: anywhere;
      }

      a {
        color: var(--sky);
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
      }

      #swagger-ui {
        margin-top: 18px;
        background: var(--ink);
        border: 1px solid var(--bd);
        border-radius: 12px;
        overflow: hidden;
      }

      .swagger-ui {
        background: transparent !important;
        color: #f8fafc !important;
      }

      .swagger-ui .topbar {
        display: none !important;
      }

      .swagger-ui .info {
        margin: 0;
        padding: 18px 18px 0;
      }

      .swagger-ui .info .title {
        color: #f8fafc !important;
      }

      .swagger-ui .info p,
      .swagger-ui .markdown p,
      .swagger-ui .opblock-summary-description,
      .swagger-ui .parameter__type,
      .swagger-ui .parameter__name,
      .swagger-ui .response-col_description,
      .swagger-ui .response-col_status,
      .swagger-ui .tab li,
      .swagger-ui .tab button,
      .swagger-ui label,
      .swagger-ui .model-title,
      .swagger-ui .model,
      .swagger-ui .renderedMarkdown {
        color: #cbd5e1 !important;
      }

      .swagger-ui .scheme-container {
        background: var(--card) !important;
        border-bottom: 1px solid var(--bd) !important;
        box-shadow: none !important;
        padding: 14px 18px;
      }

      .swagger-ui .opblock {
        border-radius: 12px !important;
        margin: 0 0 12px !important;
        box-shadow: none !important;
        background: var(--card) !important;
        border: 1px solid #374151 !important;
      }

      .swagger-ui .opblock .opblock-summary {
        padding: 12px 14px;
        background: var(--card) !important;
      }

      .swagger-ui .opblock-summary {
        color: #f8fafc !important;
      }

      .swagger-ui .opblock-summary-method {
        color: #ffffff !important;
        background: linear-gradient(180deg, #0ea5e9, #2563eb) !important;
        border: none !important;
        border-radius: 999px !important;
        font-weight: 700 !important;
        letter-spacing: 0.02em;
        min-width: 56px;
        text-align: center;
      }

      .swagger-ui .opblock-summary-path {
        color: #f8fafc !important;
        font-weight: 700 !important;
        text-shadow: 0 1px 0 rgba(0, 0, 0, 0.35);
        overflow-wrap: anywhere;
      }

      .swagger-ui .opblock-summary-description {
        color: #cbd5e1 !important;
      }

      .swagger-ui .opblock.opblock-get {
        border-color: rgba(56, 189, 248, 0.45) !important;
      }

      .swagger-ui .opblock.opblock-post {
        border-color: rgba(34, 197, 94, 0.42) !important;
      }

      .swagger-ui .opblock.opblock-put {
        border-color: rgba(96, 165, 250, 0.42) !important;
      }

      .swagger-ui .opblock.opblock-delete {
        border-color: rgba(248, 113, 113, 0.42) !important;
      }

      .swagger-ui .opblock .opblock-section-header,
      .swagger-ui .opblock .opblock-description-wrapper,
      .swagger-ui .opblock .parameters,
      .swagger-ui .opblock .responses-wrapper,
      .swagger-ui .opblock .responses-inner {
        background: transparent !important;
      }

      .swagger-ui .opblock-section-header {
        background: var(--card) !important;
        border-bottom: 1px solid var(--bd) !important;
      }

      .swagger-ui .opblock-section-header h4,
      .swagger-ui .opblock-section-header label {
        color: #f8fafc !important;
        font-weight: 700 !important;
      }

      .swagger-ui .parameters,
      .swagger-ui .responses-wrapper,
      .swagger-ui .responses-inner,
      .swagger-ui .opblock-body {
        color: #ffffff !important;
      }

      .swagger-ui .parameters-col_description,
      .swagger-ui .parameters-col_name,
      .swagger-ui .parameter__name,
      .swagger-ui .parameter__type,
      .swagger-ui .param-name,
      .swagger-ui .tab,
      .swagger-ui .response-col_status,
      .swagger-ui .response-col_description,
      .swagger-ui .responses-inner h4,
      .swagger-ui .responses-inner h5,
      .swagger-ui .opblock-title {
        color: #ffffff !important;
      }

      .swagger-ui .btn {
        border-radius: 10px !important;
        background: #1f2937 !important;
        border-color: #374151 !important;
        color: #f8fafc !important;
      }

      .swagger-ui .btn.execute {
        background: linear-gradient(180deg, #0ea5e9, #2563eb) !important;
        border: none !important;
        color: #ffffff !important;
      }

      .swagger-ui .btn.try-out__btn {
        background: #1f2937 !important;
        border-color: #374151 !important;
        color: #f8fafc !important;
      }
    </style>
  </head>
  <body>

    <script
      src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"
      crossorigin="anonymous"
    ></script>
    <script
      src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-standalone-preset.js"
      crossorigin="anonymous"
    ></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        layout: "BaseLayout",
        docExpansion: "list",
        filter: false,
        displayRequestDuration: true,
        presets: [SwaggerUIBundle.presets.apis],
      });
    </script>
  </body>
</html>`),
);

app.notFound((c) => c.text("Not found", 404));

export default app;