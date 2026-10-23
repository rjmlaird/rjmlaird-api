// src/routes/builds.ts
import { Hono } from "hono";

import { json } from "../lib/jsonResponse";

import appsData from "../data/apps-builds.json";
import toolsData from "../data/tools-builds.json";

const builds = new Hono<{ Bindings: Env }>();

const combinedBuilds = [
  ...appsData.builds,
  ...toolsData.builds,
];

/**
 * Reject duplicate IDs instead of silently overwriting entries.
 *
 * Exporters use namespaced IDs:
 * - apps/astrodash
 * - tools/astro-calc
 */

const seenIds = new Set<string>();

for (const build of combinedBuilds) {
  if (seenIds.has(build.id)) {
    throw new Error(
      `Duplicate build ID in combined catalogue: "${build.id}".`,
    );
  }

  seenIds.add(build.id);
}

/**
 * Keep catalogue-specific metadata separate.
 * Group IDs and status vocabularies may differ between sources.
 */

const buildsData = {
  schemaVersion: 1,

  catalogues: {
    apps: {
      schemaVersion: appsData.schemaVersion,
      origin: appsData.origin,
      repository: appsData.repository,
      sourceRef: appsData.sourceRef,
      groups: appsData.groups,
      statuses: appsData.statuses,
    },

    tools: {
      schemaVersion: toolsData.schemaVersion,
      origin: toolsData.origin,
      repository: toolsData.repository,
      sourceRef: toolsData.sourceRef,
      groups: toolsData.groups,
      statuses: toolsData.statuses,
    },
  },

  total: combinedBuilds.length,
  builds: combinedBuilds,
};

builds.get("/", () => json(buildsData));

export default builds;
