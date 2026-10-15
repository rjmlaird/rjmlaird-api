import { Hono } from "hono";

export const site = new Hono();

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="title"><title>Ryan Laird</title><rect width="64" height="64" rx="12" fill="#0B0F1A"/><path d="M18 14h17.5c9.1 0 14.5 4.9 14.5 12.4 0 5.3-3 9.4-8.3 11L51 50H39.5l-9.2-11H28v11H18V14Zm10 8v9h6.7c3.3 0 5.3-1.7 5.3-4.5S38 22 34.7 22H28Z" fill="#00C2A8"/></svg>`;

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
            description: "Biography section to retrieve.",
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

site.get("/favicon.svg", () =>
  new Response(faviconSvg, {
    headers: {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "image/svg+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  }),
);

site.get("/openapi.json", (c) =>
  c.json(openapiSpec, 200, {
    "Cache-Control": "public, max-age=300",
  }),
);

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
    <meta
      name="description"
      content="Public, read-only professional portfolio API for Ryan Laird."
    />
    <meta name="theme-color" content="#0B0F1A" />
    <title>Ryan Laird Portfolio API</title>

    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="shortcut icon" href="/favicon.svg" />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap"
      rel="stylesheet"
    />
    <link
      rel="stylesheet"
      href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css"
    />

    <style>
      :root {
        --ink: #0b0f1a;
        --ink-2: #0f1520;
        --card: #141b29;
        --lift: #1a2236;

        --white: #edeae3;
        --body: #9aa4b8;
        --muted: #8a98b2;

        --teal: #00c2a8;
        --teal-dim: rgba(0, 194, 168, 0.13);
        --teal-border: rgba(0, 194, 168, 0.26);

        --amber: #f5a623;
        --amber-border: rgba(245, 166, 35, 0.26);

        --violet: #a78bfa;
        --violet-border: rgba(167, 139, 250, 0.26);

        --coral: #ff8080;
        --coral-border: rgba(255, 128, 128, 0.3);

        --border: rgba(255, 255, 255, 0.11);
        --border-strong: rgba(255, 255, 255, 0.2);
        --focus: #7fe6d4;

        --font-display: "Space Grotesk", system-ui, -apple-system, "Segoe UI",
          sans-serif;
        --font-body: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;
        --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo,
          Consolas, monospace;
      }

      * {
        box-sizing: border-box;
      }

      html {
        background: var(--ink);
        color-scheme: dark;
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
      }

      body {
        min-width: 320px;
        min-height: 100vh;
        margin: 0;
        overflow-x: clip;
        background:
          radial-gradient(
            circle at 88% 0%,
            rgba(0, 194, 168, 0.08),
            transparent 30rem
          ),
          var(--ink);
        color: var(--white);
        font-family: var(--font-body);
        line-height: 1.6;
        -webkit-font-smoothing: antialiased;
      }

      .skip-link {
        position: absolute;
        top: -100px;
        left: 1rem;
        z-index: 1000;
        border-radius: 3px;
        background: var(--teal);
        color: var(--ink);
        font-family: var(--font-display);
        font-size: 0.875rem;
        font-weight: 700;
        padding: 0.6rem 1.1rem;
        text-decoration: none;
      }

      .skip-link:focus {
        top: 1rem;
      }

      .site-header {
        position: sticky;
        top: 0;
        z-index: 10;
        display: flex;
        min-height: 3.5rem;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        border-bottom: 1px solid var(--border);
        background: rgba(11, 15, 26, 0.96);
        padding: 0.75rem max(1.25rem, calc((100% - 1320px) / 2));
        -webkit-backdrop-filter: blur(18px);
        backdrop-filter: blur(18px);
      }

      .brand {
        color: var(--white);
        font-family: var(--font-display);
        font-size: 0.95rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-decoration: none;
      }

      .brand span {
        color: var(--teal);
      }

      .site-nav {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .site-nav a {
        display: inline-flex;
        min-height: 36px;
        align-items: center;
        border: 1px solid var(--border-strong);
        border-radius: 3px;
        color: var(--body);
        font-family: var(--font-display);
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.06em;
        padding: 0.3rem 0.7rem;
        text-decoration: none;
        text-transform: uppercase;
        transition:
          border-color 0.2s,
          color 0.2s;
      }

      .site-nav a:hover {
        border-color: var(--teal);
        color: var(--teal);
      }

      .site-nav a.primary-link {
        border-color: var(--teal);
        background: var(--teal);
        color: var(--ink);
      }

      .site-nav a.primary-link:hover {
        opacity: 0.88;
      }

      main {
        width: min(100% - 2.5rem, 1320px);
        margin: 0 auto;
        padding: clamp(2rem, 5vw, 4rem) 0;
      }

      .swagger-ui {
        color: var(--white) !important;
        font-family: var(--font-body) !important;
      }

      .swagger-ui .topbar {
        display: none;
      }

      .swagger-ui .info {
        margin: 0 0 2.5rem;
      }

      .swagger-ui .info .title {
        color: var(--white) !important;
        font-family: var(--font-display) !important;
        font-size: clamp(2rem, 4vw, 3.5rem) !important;
        font-weight: 700;
        letter-spacing: -0.03em;
        line-height: 1.05;
      }

      .swagger-ui .info .title small {
        margin-left: 0.7rem;
        border: 1px solid var(--teal-border);
        border-radius: 3px;
        background: var(--teal-dim);
        color: var(--teal) !important;
        font-family: var(--font-display);
        font-size: 0.7rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        vertical-align: middle;
      }

      .swagger-ui .info .description,
      .swagger-ui .info p,
      .swagger-ui .markdown p,
      .swagger-ui .renderedMarkdown p {
        max-width: 65ch;
        color: var(--body) !important;
        font-size: 1rem;
        line-height: 1.75;
      }

      .swagger-ui .info a,
      .swagger-ui .markdown a,
      .swagger-ui .renderedMarkdown a {
        color: var(--teal) !important;
      }

      .swagger-ui .scheme-container {
        margin: 0 0 2rem !important;
        padding: 1rem 1.25rem !important;
        border: 1px solid var(--border) !important;
        border-radius: 6px !important;
        background: var(--card) !important;
        box-shadow: none !important;
      }

      .swagger-ui .servers > label,
      .swagger-ui .servers-title,
      .swagger-ui .servers-title small,
      .swagger-ui label {
        color: var(--body) !important;
        font-family: var(--font-display) !important;
        font-size: 0.75rem !important;
        font-weight: 700 !important;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .swagger-ui select,
      .swagger-ui input[type="text"],
      .swagger-ui textarea {
        border: 1px solid var(--border-strong) !important;
        border-radius: 3px !important;
        background: var(--lift) !important;
        color: var(--white) !important;
        box-shadow: none !important;
        font-family: var(--font-body) !important;
      }

      .swagger-ui .opblock-tag {
        margin: 0 !important;
        padding: 1.5rem 0 0.85rem !important;
        border-bottom: 1px solid var(--border) !important;
        color: var(--white) !important;
        font-family: var(--font-display) !important;
        font-size: 0.875rem !important;
        font-weight: 700 !important;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }

      .swagger-ui .opblock-tag small {
        color: var(--muted) !important;
        font-family: var(--font-body) !important;
        font-size: 0.875rem !important;
        font-weight: 400;
        letter-spacing: 0;
        text-transform: none;
      }

      .swagger-ui .opblock {
        margin: 0.75rem 0 !important;
        overflow: hidden;
        border: 1px solid var(--border) !important;
        border-radius: 6px !important;
        background: var(--card) !important;
        box-shadow: none !important;
      }

      .swagger-ui .opblock:hover {
        border-color: var(--border-strong) !important;
      }

      .swagger-ui .opblock .opblock-summary {
        min-height: 58px;
        padding: 0.75rem 1rem !important;
        border-bottom: 0 !important;
      }

      .swagger-ui .opblock .opblock-summary-method {
        min-width: 76px;
        border-radius: 3px !important;
        background: var(--teal) !important;
        color: var(--ink) !important;
        font-family: var(--font-display) !important;
        font-size: 0.72rem !important;
        font-weight: 700 !important;
        letter-spacing: 0.08em;
        text-shadow: none !important;
      }

      .swagger-ui .opblock.opblock-get {
        border-color: var(--teal-border) !important;
      }

      .swagger-ui .opblock.opblock-get .opblock-summary-method {
        background: var(--teal) !important;
      }

      .swagger-ui .opblock.opblock-post {
        border-color: var(--amber-border) !important;
      }

      .swagger-ui .opblock.opblock-post .opblock-summary-method {
        background: var(--amber) !important;
      }

      .swagger-ui .opblock.opblock-put {
        border-color: var(--violet-border) !important;
      }

      .swagger-ui .opblock.opblock-put .opblock-summary-method {
        background: var(--violet) !important;
      }

      .swagger-ui .opblock.opblock-delete {
        border-color: var(--coral-border) !important;
      }

      .swagger-ui .opblock.opblock-delete .opblock-summary-method {
        background: var(--coral) !important;
      }

      .swagger-ui .opblock-summary-path,
      .swagger-ui .opblock-summary-path a {
        color: var(--white) !important;
        font-family: var(--font-mono) !important;
        font-size: 0.9rem !important;
        font-weight: 600 !important;
      }

      .swagger-ui .opblock-summary-description {
        color: var(--body) !important;
        font-family: var(--font-body) !important;
        font-size: 0.9rem !important;
      }

      .swagger-ui .opblock-body {
        border-top: 1px solid var(--border) !important;
        background: var(--ink-2) !important;
      }

      .swagger-ui .opblock-description-wrapper,
      .swagger-ui .opblock-external-docs-wrapper,
      .swagger-ui .opblock-title_normal {
        color: var(--body) !important;
      }

      .swagger-ui .opblock-section-header {
        min-height: 52px;
        padding: 0.75rem 1rem !important;
        background: var(--lift) !important;
        box-shadow: none !important;
      }

      .swagger-ui .opblock-section-header h4,
      .swagger-ui .opblock-section-header label {
        color: var(--white) !important;
        font-family: var(--font-display) !important;
      }

      .swagger-ui table {
        border-collapse: collapse;
      }

      .swagger-ui table thead tr th,
      .swagger-ui table thead tr td {
        border-bottom: 1px solid var(--border) !important;
        color: var(--body) !important;
        font-family: var(--font-display) !important;
        font-size: 0.7rem !important;
        letter-spacing: 0.1em;
        text-transform: uppercase;
      }

      .swagger-ui table tbody tr td {
        border-bottom: 1px solid var(--border) !important;
        color: var(--body) !important;
      }

      .swagger-ui .parameter__name,
      .swagger-ui .parameter__type,
      .swagger-ui .parameter__in {
        font-family: var(--font-mono) !important;
      }

      .swagger-ui .parameter__name {
        color: var(--white) !important;
      }

      .swagger-ui .parameter__type {
        color: var(--teal) !important;
      }

      .swagger-ui .parameter__in,
      .swagger-ui .parameter__extension,
      .swagger-ui .parameter__deprecated {
        color: var(--muted) !important;
      }

      .swagger-ui .response-col_status {
        color: var(--teal) !important;
        font-family: var(--font-mono) !important;
        font-size: 0.85rem !important;
        font-weight: 700;
      }

      .swagger-ui .response-col_description,
      .swagger-ui .response-col_description__inner p,
      .swagger-ui .responses-inner h4,
      .swagger-ui .responses-inner h5,
      .swagger-ui .response-col_links {
        color: var(--body) !important;
      }

      .swagger-ui .model-box {
        border: 1px solid var(--border) !important;
        border-radius: 4px !important;
        background: var(--lift) !important;
      }

      .swagger-ui .model-title,
      .swagger-ui .model,
      .swagger-ui .prop-type,
      .swagger-ui .prop-name {
        color: var(--white) !important;
      }

      .swagger-ui .prop-type {
        color: var(--teal) !important;
      }

      .swagger-ui .model-toggle:after {
        background-color: var(--teal) !important;
      }

      .swagger-ui pre,
      .swagger-ui .highlight-code {
        border: 1px solid var(--border) !important;
        border-radius: 4px !important;
        background: #090d15 !important;
      }

      .swagger-ui .microlight,
      .swagger-ui .highlight-code > .microlight {
        background: #090d15 !important;
        color: var(--white) !important;
        font-family: var(--font-mono) !important;
        font-size: 0.8rem !important;
        line-height: 1.65 !important;
      }

      .swagger-ui .btn {
        border: 1px solid var(--border-strong) !important;
        border-radius: 3px !important;
        background: transparent !important;
        color: var(--white) !important;
        box-shadow: none !important;
        font-family: var(--font-display) !important;
        font-size: 0.75rem !important;
        font-weight: 700 !important;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .swagger-ui .btn:hover {
        border-color: var(--teal) !important;
        color: var(--teal) !important;
      }

      .swagger-ui .btn.execute {
        border-color: var(--teal) !important;
        background: var(--teal) !important;
        color: var(--ink) !important;
      }

      .swagger-ui .btn.execute:hover {
        background: #12d8bd !important;
        color: var(--ink) !important;
      }

      .swagger-ui .btn.cancel {
        border-color: var(--coral) !important;
        color: var(--coral) !important;
      }

      .swagger-ui .authorization__btn svg,
      .swagger-ui .copy-to-clipboard button svg {
        fill: var(--teal) !important;
      }

      .swagger-ui .download-contents,
      .swagger-ui .tab li button.tablinks {
        color: var(--body) !important;
      }

      .swagger-ui .tab li.active button.tablinks {
        color: var(--teal) !important;
      }

      :focus-visible {
        outline: 3px solid var(--focus) !important;
        outline-offset: 4px;
      }

      @media (max-width: 700px) {
        .site-header {
          padding-right: 1rem;
          padding-left: 1rem;
        }

        .site-nav a:not(.primary-link) {
          display: none;
        }

        main {
          width: min(100% - 2rem, 1320px);
          padding: 2rem 0;
        }

        .swagger-ui .info .title {
          font-size: 2rem !important;
        }

        .swagger-ui .opblock .opblock-summary {
          align-items: flex-start;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .swagger-ui .opblock-summary-method {
          flex: 0 0 70px;
        }

        .swagger-ui .opblock-summary-path {
          flex: 1 1 calc(100% - 80px);
          min-width: 0;
          overflow-wrap: anywhere;
        }

        .swagger-ui .opblock-summary-description {
          flex: 1 0 100%;
          padding-left: 80px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          scroll-behavior: auto !important;
          transition-duration: 0.001ms !important;
          animation-duration: 0.001ms !important;
          animation-iteration-count: 1 !important;
        }
      }
    </style>
  </head>
  <body>
    <a class="skip-link" href="#documentation">Skip to API documentation</a>

    <header class="site-header">
      <a class="brand" href="https://rjmlaird.co.uk">
        rjmlaird<span>.</span>co.uk
      </a>

      <nav class="site-nav" aria-label="API navigation">
        <a href="/v1">API index</a>
        <a href="/healthz">Health</a>
        <a class="primary-link" href="/openapi.json">OpenAPI JSON</a>
      </nav>
    </header>

    <main id="documentation">
      <div id="swagger-ui"></div>
    </main>

    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        displayRequestDuration: true,
        docExpansion: "list",
        defaultModelsExpandDepth: -1,
        presets: [SwaggerUIBundle.presets.apis],
      });
    </script>
  </body>
</html>`),
);
