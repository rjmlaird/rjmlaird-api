#!/usr/bin/env node
// Builds src/data/labs-builds.json (same catalogue shape as apps-builds / tools-builds)
// from the main site's src/data/experiments.json.
//   node scripts/build-labs.mjs <path-to>/experiments.json [outFile]
import fs from "node:fs";

const [, , src, outFile = "src/data/labs-builds.json"] = process.argv;
if (!src) {
  console.error("usage: node scripts/build-labs.mjs <experiments.json> [outFile]");
  process.exit(1);
}
const REPO = "https://github.com/rjmlaird/rjmlaird-labs";
const raw = JSON.parse(fs.readFileSync(src, "utf8"));
if (!Array.isArray(raw)) throw new Error("experiments.json must be an array");

// Source data has a few rough edges; normalise them here, deterministically, and report them.
const FIX_TECH = { Streamliy: "Streamlit" };
const notes = [];
const titleCase = (s) => s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

const builds = raw.map((e) => {
  let title = e.title;
  if (title === e.slug) {
    title = titleCase(e.slug);
    notes.push(`title "${e.slug}" -> "${title}"`);
  }
  const tech = (e.tech ?? []).map((t) => {
    if (FIX_TECH[t]) notes.push(`tech "${t}" -> "${FIX_TECH[t]}" (${e.slug})`);
    return FIX_TECH[t] ?? t;
  });
  const url = e.demoUrl.endsWith("/") ? e.demoUrl : e.demoUrl + "/";
  return {
    id: `labs/${e.slug}`,
    sourceId: e.slug,
    type: "lab",
    title,
    description: e.description,
    group: "experiments",
    tech,
    status: e.status,
    updated: e.updated,
    repository: REPO,
    path: e.demoUrl,
    url,
    sourcePath: e.repoUrl.replace(`${REPO}/tree/main/`, ""),
    source: e.repoUrl,
  };
});

const ids = new Set(builds.map((b) => b.id));
if (ids.size !== builds.length) throw new Error("Duplicate lab ids");

const out = {
  schemaVersion: 1,
  origin: "https://labs.rjmlaird.co.uk",
  repository: REPO,
  sourceRef: "main",
  groups: [{ id: "experiments", name: "Experiments", blurb: "Interactive experiments and prototypes." }],
  statuses: {
    active: { label: "Active", order: 1 },
    "in-progress": { label: "In progress", order: 2 },
    planned: { label: "Planned", order: 3 },
    archived: { label: "Archived", order: 4 },
  },
  builds,
};
fs.writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");
console.log(`[labs] ${builds.length} labs -> ${outFile}`);
for (const n of notes) console.log(`  normalised: ${n}`);
