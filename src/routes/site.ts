import { Hono } from "hono";

export const site = new Hono();

const openapiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Ryan Laird Portfolio API",
    version: "1.0.0",
    description:
      "Public, read-only professional portfolio API for Ryan Laird.",
  },
  servers: [
    {
      url: "https://api.rjmlaird.co.uk",
      description: "Production",
    },
    {
      url: "http://localhost:8787",
      description: "Local development",
    },
  ],
  tags: [
    {
      name: "System",
      description: "Service status and API discovery.",
    },
    {
      name: "Biography",
      description: "Public biography, professional focus, and contact links.",
    },
    {
      name: "CV",
      description: "Professional profile and CV data.",
    },
    {
      name: "Portfolio",
      description: "Projects, initiatives, and case studies.",
    },
    {
      name: "Media",
      description: "Publications, talks, podcasts, and video.",
    },
    {
      name: "General",
      description: "Additional public profile and site data.",
    },
  ],
  paths: {
    "/healthz": {
      get: {
        tags: ["System"],
        summary: "Health check",
        responses: {
          "200": {
            description: "Service is available.",
          },
        },
      },
    },
    "/v1": {
      get: {
        tags: ["System"],
        summary: "API discovery",
        responses: {
          "200": {
            description: "API metadata and primary endpoint links.",
          },
        },
      },
    },
    "/v1/bio": {
      get: {
        tags: ["Biography"],
        summary: "Get public biography",
        responses: {
          "200": {
            description: "Biography document.",
          },
        },
      },
    },
    "/v1/bio/{section}": {
      get: {
        tags: ["Biography"],
        summary: "Get a biography section",
        parameters: [
          {
            name: "section",
            in: "path",
            required: true,
            schema: {
              type: "string",
              enum: [
                "short",
                "summary",
                "roles",
                "focus",
                "profiles",
                "links",
                "contact",
              ],
            },
          },
        ],
        responses: {
          "200": {
            description: "Requested biography section.",
          },
          "404": {
            description: "Unknown biography section.",
          },
        },
      },
    },
    "/v1/cv": {
      get: {
        tags: ["CV"],
        summary: "Get CV data",
        responses: {
          "200": {
            description: "CV API response.",
          },
        },
      },
    },
    "/v1/portfolio": {
      get: {
        tags: ["Portfolio"],
        summary: "Get portfolio data",
        responses: {
          "200": {
            description: "Portfolio API response.",
          },
        },
      },
    },
    "/v1/media": {
      get: {
        tags: ["Media"],
        summary: "Get media data",
        responses: {
          "200": {
            description: "Media API response.",
          },
        },
      },
    },
    "/v1/general": {
      get: {
        tags: ["General"],
        summary: "Get general public data",
        responses: {
          "200": {
            description: "General API response.",
          },
        },
      },
    },
    "/v1/site": {
      get: {
        tags: ["General"],
        summary: "Get public site data",
        responses: {
          "200": {
            description: "Site API response.",
          },
        },
      },
    },
  },
} as const;

site.get("/openapi.json", (c) => c.json(openapiSpec));

site.get("/health", (c) =>
  c.json(
    {
      error: "Legacy endpoint",
      message: "Use /healthz instead.",
      endpoint: "/healthz",
    },
    410,
  ),
);

site.get("/", (c) =>
  c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ryan Laird Portfolio API</title>
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css"
    />
    <style>
      :root {
        --ink: #0b0f1a;
        --card: #141b29;
        --lift: #1a2236;
        --white: #edeae3;
        --muted: #a4b0c5;
        --sky: #38bdf8;
        --border: rgba(255, 255, 255, 0.1);
        --font: Inter, ui-sans-serif, system-ui, sans-serif;
      }

      body {
        margin: 0;
        font-family: var(--font);
        background: var(--ink);
        color: var(--white);
      }

      .wrap {
        max-width: 1100px;
        margin: 0 auto;
        padding: 48px 20px;
      }

      .swagger-ui {
        background: transparent !important;
        color: var(--white) !important;
      }

      .swagger-ui .info .title,
      .swagger-ui .opblock-summary-path,
      .swagger-ui label,
      .swagger-ui .opblock-summary-description,
      .swagger-ui .parameter__name,
      .swagger-ui .parameter__type {
        color: var(--white) !important;
      }

      .swagger-ui .info .description,
      .swagger-ui .markdown p,
      .swagger-ui .renderedMarkdown,
      .swagger-ui .response-col_description,
      .swagger-ui .parameter__in {
        color: var(--muted) !important;
      }

      .swagger-ui .opblock {
        background: var(--card) !important;
        border: 1px solid var(--border) !important;
      }

      .swagger-ui .opblock-summary {
        border-bottom-color: var(--border) !important;
      }

      .swagger-ui .opblock-summary-method {
        background: var(--sky) !important;
        color: var(--ink) !important;
        font-weight: 700;
      }

      .swagger-ui .btn.execute {
        background: var(--sky) !important;
        border-color: var(--sky) !important;
        color: var(--ink) !important;
      }

      .swagger-ui .btn {
        background: var(--lift) !important;
        border: 1px solid var(--border) !important;
        color: var(--white) !important;
      }

      .swagger-ui input,
      .swagger-ui textarea,
      .swagger-ui select {
        background: var(--lift) !important;
        border-color: var(--border) !important;
        color: var(--white) !important;
      }
    </style>
  </head>
  <body>
    <main class="wrap">
      <div id="swagger-ui"></div>
    </main>

    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis],
      });
    </script>
  </body>
</html>`),
);
