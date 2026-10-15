/// <reference types="wrangler/types" />

// Secrets — set via `wrangler secret put <NAME>`, not present in wrangler.jsonc,
// so `wrangler types` can't discover them. Declared here instead.
interface Env {
  CAL_WEBHOOK_SECRET: string;
  HUBSPOT_PRIVATE_APP_TOKEN: string;
  CDN_UPLOAD_TOKEN: string;
}
