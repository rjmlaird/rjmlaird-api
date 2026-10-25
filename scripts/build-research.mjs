#!/usr/bin/env node
// Builds src/data/research.json from src/data/publications.bib.
//   node scripts/build-research.mjs [bibFile] [outFile]
// Abstracts are deliberately NOT copied into the public JSON (publisher text); the raw .bib
// remains available at /v1/research/publications.bib for reference-manager import.
import fs from "node:fs";
import crypto from "node:crypto";
import { parseBibtex } from "../src/lib/bibtex.mjs";

const [, , bibFile = "src/data/publications.bib", outFile = "src/data/research.json"] = process.argv;
const text = fs.readFileSync(bibFile, "utf8");
const entries = parseBibtex(text);
if (!entries.length) throw new Error("No BibTeX entries parsed");

const clean = (s) => s?.replace(/\\&/g, "&").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
const slugify = (k) => k.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
const items = entries.map((e) => {
  const f = e.fields;
  const authors = (f.author ?? "").split(/\s+and\s+/).map((a) => clean(a)).filter(Boolean);
  const year = Number(f.year ?? (f.date ?? "").slice(0, 4)) || null;
  const doi = f.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
  return {
    id: slugify(e.key),
    bibKey: e.key,
    type: e.type,
    title: clean(f.title),
    authors,
    year,
    venue: clean(f.journal ?? f.booktitle ?? f.publisher ?? ""),
    volume: f.volume ?? null,
    issue: f.number ?? null,
    pages: f.pages?.replace(/--/g, "–") ?? null,
    doi: doi ?? null,
    url: doi ? `https://doi.org/${doi}` : f.url ?? null,
    hasAbstract: Boolean(f.abstract),
  };
});
items.sort((a, b) => (b.year ?? -1) - (a.year ?? -1) || a.title.localeCompare(b.title));

const ids = new Set(items.map((i) => i.id));
if (ids.size !== items.length) throw new Error("Duplicate BibTeX keys");
for (const i of items) {
  if (!i.title) throw new Error(`${i.id}: missing title`);
  if (!i.year) console.log(`  note: ${i.id} has no year; served with year: null and listed last`);
}

const version = crypto.createHash("sha1").update(text).digest("hex").slice(0, 12);
fs.writeFileSync(outFile, JSON.stringify({ version, count: items.length, items }, null, 2) + "\n");

// Public bibliography: re-serialised from parsed fields, dropping local file paths (Zotero `file`)
// and publisher abstracts. Nothing else from the raw export is added.
const DROP = new Set(["file", "abstract", "copyright"]);
const pub = entries
  .map((e) => {
    const lines = Object.entries(e.fields)
      .filter(([k]) => !DROP.has(k))
      .map(([k, v]) => `\t${k} = {${v}},`);
    return `@${e.type}{${e.key},\n${lines.join("\n")}\n}`;
  })
  .join("\n\n");
if (/files\/|\/Users\/|[A-Za-z]:\\/.test(pub)) throw new Error("Public bibliography still contains a local path");
fs.writeFileSync(outFile.replace(/research\.json$/, "publications.public.bib"), pub + "\n");
console.log(`[research] ${items.length} publications -> ${outFile} (${version})`);
