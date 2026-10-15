#!/usr/bin/env node
// Builds the public portfolio datasets in src/data from a raw content export.
//   node scripts/sanitise-data.mjs <rawDataDir> [outDir]
// Allowlist-first: only known public fields survive. Fails if anything private-looking remains.
import fs from "node:fs";
import path from "node:path";

const [, , srcDir, outDir = "src/data"] = process.argv;
if (!srcDir) {
  console.error("usage: node scripts/sanitise-data.mjs <rawDataDir> [outDir]");
  process.exit(1);
}
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(srcDir, f), "utf8"));
const report = { droppedDrafts: [], placeholders: 0, strippedNotion: 0, strippedTracking: 0, danglingRefs: 0 };

const WORK_KEYS = [
  "slug", "id", "title", "type", "status", "featured", "description", "excerpt", "date", "startDate", "endDate",
  "tags", "category", "sectors", "client", "tools_tech", "features", "links", "youtubeId", "heroImage",
  "heroAlt", "image", "imageCredit", "impact", "content", "relatedProjects", "relatedCaseStudies", "caseStudy", "caseStudies",
];
const LINK_KEYS = ["web", "live", "github", "youtube"];
const PLACEHOLDER_IMPACT = { outcome: "Improved discoverability and storytelling", engagement: "High" };

const isPlaceholderUrl = (u) => /yourname|example-project|example\.com/i.test(u);
const cleanUrl = (u) => {
  if (typeof u !== "string" || !/^https?:\/\//i.test(u) || isPlaceholderUrl(u)) return null;
  try {
    const url = new URL(u);
    if (url.searchParams.has("si")) {
      url.searchParams.delete("si"); // share-tracking parameter
      report.strippedTracking++;
    }
    return url.toString();
  } catch {
    return null;
  }
};

function cleanWork(raw) {
  if (raw.draft === true) {
    report.droppedDrafts.push(raw.slug);
    return null;
  }
  const item = {};
  const src = { ...raw };
  if (src.Client && !src.client) src.client = src.Client; // inconsistent key casing in the export
  for (const k of WORK_KEYS) if (src[k] !== undefined && src[k] !== null) item[k] = src[k];

  const dropPlaceholder = (k, re) => {
    if (typeof item[k] === "string" && re.test(item[k])) {
      delete item[k];
      report.placeholders++;
    }
  };
  dropPlaceholder("description", /^A short summary of/i);
  dropPlaceholder("excerpt", /^A slightly longer excerpt/i);
  dropPlaceholder("image", /my-first-post/i);

  if (Array.isArray(item.features) && item.features.every((f) => /^Feature (one|two|three)/i.test(f))) {
    delete item.features;
    report.placeholders++;
  }
  if (Array.isArray(item.tools_tech) && !item.tools_tech.length) delete item.tools_tech;
  if (item.impact && typeof item.impact === "object") {
    for (const [k, v] of Object.entries(PLACEHOLDER_IMPACT)) {
      if (item.impact[k] === v) {
        delete item.impact[k];
        report.placeholders++;
      }
    }
    if (!Object.keys(item.impact).length) delete item.impact;
  }
  if (Array.isArray(item.tags)) {
    item.tags = item.tags.filter((t) => !/^example$/i.test(t));
    if (!item.tags.length) delete item.tags;
  }
  if (item.category !== undefined) {
    const cats = (Array.isArray(item.category) ? item.category : [item.category]).filter((c) => c && c !== "case-studies");
    if (cats.length) item.category = cats;
    else delete item.category;
  }
  if (item.links) {
    const links = {};
    for (const k of LINK_KEYS) {
      const u = cleanUrl(item.links[k]);
      if (u) links[k] = u;
    }
    if (Object.keys(links).length) item.links = links;
    else delete item.links;
  }
  if (typeof item.content === "string") {
    const notion = /\s*\(https?:\/\/(?:[\w-]+\.)?notion\.(?:so|com)[^)]*\)/gi;
    if (notion.test(item.content)) report.strippedNotion++;
    item.content = item.content.replace(notion, "").trim();
    if (!item.content.replace(/[#\s]/g, "")) delete item.content;
  }
  return item;
}

const projects = readJson("projects.json").map(cleanWork).filter(Boolean);
const initiatives = readJson("initiatives.json").map(cleanWork).filter(Boolean);
const caseStudies = readJson("caseStudies.json").map(cleanWork).filter(Boolean);

// Drop references to anything that no longer exists in the public set.
const slugs = { projects: new Set(projects.map((p) => p.slug)), caseStudies: new Set(caseStudies.map((c) => c.slug)) };
const titles = new Set(caseStudies.map((c) => c.title?.toLowerCase()));
const fixRefs = (items) => {
  for (const it of items) {
    for (const [k, pool] of [
      ["relatedProjects", slugs.projects],
      ["relatedCaseStudies", slugs.caseStudies],
    ]) {
      if (!Array.isArray(it[k])) continue;
      const kept = it[k].filter((s) => pool.has(s));
      report.danglingRefs += it[k].length - kept.length;
      if (kept.length) it[k] = kept;
      else delete it[k];
    }
    if (Array.isArray(it.caseStudies)) {
      const kept = it.caseStudies.filter((s) => slugs.caseStudies.has(s) || titles.has(String(s).toLowerCase()));
      report.danglingRefs += it.caseStudies.length - kept.length;
      if (kept.length) it.caseStudies = kept;
      else delete it.caseStudies;
    }
    if (typeof it.caseStudy === "string" && !slugs.caseStudies.has(it.caseStudy) && !titles.has(it.caseStudy.toLowerCase())) {
      delete it.caseStudy;
      report.danglingRefs++;
    }
  }
};
[projects, initiatives, caseStudies].forEach(fixRefs);

const reviews = readJson("reviews.json").map((r) => ({
  content: r.content,
  author: r.author,
  position: r.position,
  company: r.company,
  avatar: r.avatar,
}));
const teaching = readJson("teaching.json");

// ---- BibTeX -> JSON (brace-aware; abstracts deliberately omitted) ----
function parseBibtex(text) {
  const entries = [];
  const re = /@(\w+)\s*\{\s*([^,\s]+)\s*,/g;
  let m;
  while ((m = re.exec(text))) {
    let i = re.lastIndex;
    let depth = 1;
    const start = i;
    while (i < text.length && depth) {
      const c = text[i++];
      if (c === "{") depth++;
      else if (c === "}") depth--;
    }
    const body = text.slice(start, i - 1);
    const fields = {};
    const fre = /(\w+)\s*=\s*/g;
    let fm;
    while ((fm = fre.exec(body))) {
      let j = fre.lastIndex;
      let val = "";
      if (body[j] === "{") {
        let d = 0;
        const s = j;
        do {
          if (body[j] === "{") d++;
          else if (body[j] === "}") d--;
          j++;
        } while (d && j < body.length);
        val = body.slice(s + 1, j - 1);
      } else if (body[j] === '"') {
        const e = body.indexOf('"', j + 1);
        val = body.slice(j + 1, e);
        j = e + 1;
      } else {
        const e = body.slice(j).search(/[,\n]/);
        val = body.slice(j, e < 0 ? undefined : j + e);
        j += val.length;
      }
      fields[fm[1].toLowerCase()] = val.replace(/\s+/g, " ").trim();
      fre.lastIndex = j;
    }
    entries.push({ type: m[1].toLowerCase(), key: m[2], fields });
    re.lastIndex = i;
  }
  return entries;
}
const unbrace = (s = "") => s.replace(/[{}]/g, "").replace(/\\&/g, "&");
const flipName = (n) => {
  const [last, first] = n.split(",").map((x) => x.trim());
  return first ? `${first} ${last}` : last;
};
const research = parseBibtex(fs.readFileSync(path.join(srcDir, "publications.txt"), "utf8"))
  .map(({ type, key, fields: f }) => ({
    key,
    type,
    title: unbrace(f.title),
    authors: unbrace(f.author || "").split(/\s+and\s+/).filter(Boolean).map(flipName),
    venue: unbrace(f.journal || f.booktitle || f.publisher || ""),
    year: Number(f.year || (f.date || "").slice(0, 4)) || undefined,
    doi: f.doi || undefined,
    url: cleanUrl(f.url) || (f.doi ? `https://doi.org/${f.doi}` : undefined),
  }))
  .filter((p) => p.title)
  .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));

// ---- Leak check: fail the build if anything private-looking remains ----
const outputs = { projects, initiatives, caseStudies, reviews, teaching, research };
const LEAK =
  /\/Volumes\/|\/Users\/|\/home\/|notion\.(so|com)|localhost|[\w.+-]+@[\w-]+\.[a-z]{2,}|(?:\+\d{1,3}[\s-]?)?\(?\d{3,5}\)?[\s-]\d{3}[\s-]\d{3,4}|api[_-]?key|secret|bearer |password/i;
const leaks = [];
for (const [name, data] of Object.entries(outputs)) {
  JSON.stringify(data, (k, v) => {
    if (typeof v === "string" && LEAK.test(v)) leaks.push(`${name}.${k}: ${v.slice(0, 80)}`);
    return v;
  });
}
if (leaks.length) {
  console.error("LEAK CHECK FAILED:\n" + leaks.join("\n"));
  process.exit(2);
}

fs.mkdirSync(outDir, { recursive: true });
for (const [name, data] of Object.entries(outputs)) {
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(data, null, 2) + "\n");
}
console.log(
  JSON.stringify(
    {
      ...report,
      counts: Object.fromEntries(Object.entries(outputs).map(([k, v]) => [k, Array.isArray(v) ? v.length : Object.keys(v).length])),
    },
    null,
    2,
  ),
);
