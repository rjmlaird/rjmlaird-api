import { defineConfig, type Plugin } from "vitest/config";
import { readFileSync } from "node:fs";

// Mirror wrangler's rules: *.html (default) and *.bib (wrangler.jsonc) are imported as text.
const htmlAsText: Plugin = {
  name: "html-as-text",
  enforce: "pre",
  load(id) {
    if (id.endsWith(".html") || id.endsWith(".bib")) return `export default ${JSON.stringify(readFileSync(id, "utf8"))};`;
  },
};

export default defineConfig({ plugins: [htmlAsText], test: { include: ["test/**/*.test.ts"] } });
