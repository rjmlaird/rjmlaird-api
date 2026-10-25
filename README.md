# rjmlaird-api

Public, **read-only** Cloudflare Worker (Hono) at `https://api.rjmlaird.co.uk`: structured data for Ryan Laird and the rjmlaird.co.uk estate, with Swagger UI at `/` and the OpenAPI document at `/openapi.json`.

No bindings, secrets or storage. Everything is bundled from `src/data` at build time. The only outbound requests are the optional `?probe=true` status checks.

## Endpoints

All `GET`/`HEAD`. Every JSON response carries an `ETag`; send `If-None-Match` for a `304`. Collections take `limit`/`offset` and return `meta` (`total`, `count`, `nextOffset`). Errors are `{ "error": "...", ...context }` (400 invalid parameter, 404 not found, 405 non-read method).

| Endpoint | Purpose |
|---|---|
| `/v1` | Discovery: endpoint groups and the estate entry point |
| `/v1/status` | Build, dataset inventory, estate counts. `?probe=true` HEAD-checks live subdomains (3 s timeout, cached 60 s, **503** when degraded) |
| `/v1/subdomains` · `/{id or host}` | **Estate entry point**: every public subdomain with its web and API entry points. Filters `status kind live` |
| `/v1/sites` · `/{id}` | Raw registry (`kind status footer host`) |
| `/v1/cv` | CV index + public profile summary + per-section counts; `/v1/cv/{section}`, `/search`, `/full` |
| `/v1/portfolio` | Projects, initiatives, case studies (existing filters unchanged) |
| `/v1/research` · `/{id}` · `/publications.bib` | Publications. Filters `year type author q sort`; sanitised BibTeX |
| `/v1/glossary` · `/{slug}` | Terms. Filters `category letter q sort expand=definition`; `/categories`, `/letters`; aliases resolve (`/v1/glossary/SAR`); `?format=jsonld` gives schema.org `DefinedTerm`/`DefinedTermSet` |
| `/v1/tools` · `/v1/apps` · `/v1/labs` | Catalogues, live items first. Filters `status group tech q live sort`; `/groups`, `/{slug}` |

`/v1/builds` (combined apps+tools), `/v1/media`, `/v1/general`, `/v1/bio` are unchanged. Legacy `/api/*` returns 410. `/v1/portfolio/publications.txt` is now a legacy alias of the BibTeX file.

## Data is generated

`src/data/*.json` is built, not hand-edited:

```bash
npm run data:glossary   # glossary repo term files  -> glossary.json (validates slugs, categories, related links)
npm run data:labs       # main site experiments.json -> labs-builds.json
npm run data:research   # publications.bib           -> research.json + publications.public.bib
```

Adjust the relative paths in `package.json` to your checkouts. `apps-builds.json` and `tools-builds.json` come from the apps/tools exporters; `sites.json` from `rjmlaird-docs/data/sites.yaml`; the older datasets from `scripts/sanitise-data.mjs`.

Privacy: the public bibliography drops Zotero `file` paths, abstracts and copyright fields (a test enforces it); restricted hosts never enter the registry.

## Develop

```bash
npm install
npm run dev     # wrangler dev
npm run check   # tsc
npm test        # vitest: every documented path must respond 200; behaviour tests for each endpoint
npm run deploy
```

`src/openapi.ts` is the single API description; keep it in step with `src/index.ts`.
