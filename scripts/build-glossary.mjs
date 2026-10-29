#!/usr/bin/env node
// Builds src/data/glossary.json from the glossary repo's term files.
//   node scripts/build-glossary.mjs <path-to>/rjmlaird-glossary/src/content/terms [outFile]
// Generated, not hand-edited. Fails on duplicate slugs, unknown categories or broken related links.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import YAML from "yaml";

const [, , termsDir, outFile = "src/data/glossary.json"] = process.argv;
if (!termsDir) {
  console.error("usage: node scripts/build-glossary.mjs <termsDir> [outFile]");
  process.exit(1);
}

const BASE = "https://glossary.rjmlaird.co.uk";

// Category labels come from the glossary's own src/lib/categories.ts so the two cannot drift.
const catFile = path.resolve(termsDir, "../../lib/categories.ts");
const catSrc = fs.readFileSync(catFile, "utf8");
const labels = {};
for (const m of catSrc.matchAll(/(?:'([a-z-]+)'|\b([a-z-]+)\b):\s*\{\s*label:\s*'([^']+)'/g)) {
  labels[m[1] ?? m[2]] = m[3];
}
if (!Object.keys(labels).length) throw new Error(`No categories parsed from ${catFile}`);

const plain = (md) =>
  md
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__|\*|_|`)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const files = fs.readdirSync(termsDir).filter((f) => f.endsWith(".md")).sort();
const terms = files.map((f) => {
  const raw = fs.readFileSync(path.join(termsDir, f), "utf8");
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) throw new Error(`${f}: no frontmatter`);
  const fm = YAML.parse(m[1]);
  const slug = f.replace(/\.md$/, "");
  if (!fm.term || !fm.short || !fm.category) throw new Error(`${slug}: missing term/short/category`);
  if (!labels[fm.category]) throw new Error(`${slug}: unknown category ${fm.category}`);
  const updated = fm.updated instanceof Date ? fm.updated.toISOString().slice(0, 10) : String(fm.updated ?? "");
  return {
    slug,
    term: fm.term,
    category: fm.category,
    aliases: fm.aliases ?? [],
    short: fm.short,
    definition: plain(m[2]),
    related: fm.related ?? [],
    updated,
    url: `${BASE}/${slug}/`,
  };
});

const slugs = new Set(terms.map((t) => t.slug));
if (slugs.size !== terms.length) throw new Error("Duplicate slugs");
for (const t of terms) {
  for (const r of t.related) if (!slugs.has(r)) throw new Error(`${t.slug}: related "${r}" does not exist`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.updated)) throw new Error(`${t.slug}: bad updated "${t.updated}"`);
}

const counts = {};
for (const t of terms) counts[t.category] = (counts[t.category] ?? 0) + 1;
// Every category the glossary defines is valid for ?category=, even if currently empty.
const categories = Object.keys(labels).map((id) => ({ id, label: labels[id], count: counts[id] ?? 0 }));

const updatedAt = terms.map((t) => t.updated).sort().at(-1);
const version = crypto.createHash("sha1").update(JSON.stringify(terms)).digest("hex").slice(0, 12);
const out = { version, updatedAt, source: BASE + "/", categories, terms };
fs.writeFileSync(outFile, JSON.stringify(out, null, 1) + "\n");
console.log(`[glossary] ${terms.length} terms, ${categories.length} categories -> ${outFile} (${version})`);
