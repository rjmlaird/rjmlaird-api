# rjmlaird-portfolio-api

A single, public, **read-only** Cloudflare Worker serving Ryan Laird's portfolio as JSON, with a browsable front end at `/`.

No bindings, no secrets, no storage, no outbound requests. Everything is bundled at build time from `src/data`.

## Endpoints

All `GET`. Full reference at `/openapi.json` and in the page at `/`.

| Path | Notes |
|---|---|
| `/` | Front end |
| `/v1/portfolio` | Counts and endpoint index |
| `/v1/portfolio/projects`, `/case-studies`, `/initiatives` | Filters: `status type tag sector client category featured q limit offset` |
| `/v1/portfolio/{projects,case-studies,initiatives}/:slug` | `?expand=` for relations. Legacy `/project/:slug`, `/case-study/:slug`, `/initiative/:slug` still work |
| `/v1/portfolio/reviews` · `/research` · `/teaching` | Testimonials, publications (parsed from BibTeX), teaching history |
| `/v1/portfolio/search?q=` | Cross-collection search returning compact hits |
| `/health` · `/openapi.json` | |

Any non-read method returns 405; every other path returns 404. CORS is open for `GET/HEAD/OPTIONS` only.

## Develop

```bash
npm install
npm run dev      # wrangler dev
npm run check    # tsc
npm test         # vitest (includes privacy and surface-area tests)
npm run deploy
```

Routing: `workers_dev` is off. Add a `routes` entry in `wrangler.jsonc` (or attach the domain in the dashboard) before cutover.
The deploy workflow needs repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

## Data and privacy

`src/data/*.json` is **generated**, not hand-edited:

```bash
node scripts/sanitise-data.mjs <path-to-raw-content-export>
```

The script keeps allowlisted fields only and removes local file paths, Notion links, draft items, template placeholder text, share-tracking URL parameters (`?si=`), and references to datasets that aren't public. It exits non-zero if anything resembling a path, email, phone number or credential remains.
At runtime `src/portfolio.ts` applies a second allowlist, and `test/api.test.ts` asserts that no endpoint leaks private-looking content.

Not covered by tooling: whether third-party testimonials and client names are cleared for publication. Review `reviews.json` and the `client` fields.
