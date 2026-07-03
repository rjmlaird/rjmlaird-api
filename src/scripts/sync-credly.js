#!/usr/bin/env node

/**
 * Fetches badges from Credly public profile and updates achievements.json
 * with separated certifications and learning badges.
 *
 * Usage: node scripts/sync-credly.js
 *
 * Env: CREDLY_USERNAME (default: rjmlaird)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = resolve(__dirname, "../src/data/credly.json");
const CREDLY_USERNAME = process.env.CREDLY_USERNAME || "rjmlaird";
const API_URL = `https://www.credly.com/users/${CREDLY_USERNAME}/badges.json`;

const CERTIFICATION_PATTERNS = [
  /certified/i,
  /certification/i,
  /associate/i,
  /professional/i,
  /specialist/i,
  /terraform associate/i,
  /hashicorp certified/i,
  /aws certified/i,
];

function isCertification(badgeName = "") {
  return CERTIFICATION_PATTERNS.some((pattern) => pattern.test(badgeName));
}

function mapLevel(badge) {
  const name = badge.badge_template?.name || "";
  if (/professional/i.test(name)) return "Professional";
  if (/associate/i.test(name)) return "Associate";
  if (/specialist/i.test(name)) return "Specialist";
  if (/foundational|practitioner/i.test(name)) return "Foundational";
  return null;
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  return String(dateStr).slice(0, 10);
}

function getIssuerName(badge) {
  const entities =
    badge.issuer?.entities || badge.badge_template?.issuer?.entities || [];
  if (!Array.isArray(entities) || entities.length === 0) return "Unknown";
  const primary = entities.find((e) => e.primary) ?? entities[0];
  return primary?.entity?.name ?? "Unknown";
}

function getBadgeType(badgeName = "") {
  if (isCertification(badgeName)) return "Industry Certification";
  if (/knowledge/i.test(badgeName)) return "Knowledge Badge";
  if (/partner/i.test(badgeName)) return "Partner Badge";
  if (/proficient|well-architected/i.test(badgeName)) return "Proficiency Badge";
  if (/educate|learning/i.test(badgeName)) return "Learning Badge";
  if (/intermediate|foundational/i.test(badgeName)) return "Training Badge";
  return "Badge";
}

function transformBadge(badge, id) {
  const name = badge.badge_template?.name || "Untitled Badge";
  const type = getBadgeType(name);
  const entry = {
    id,
    name,
    type,
    issuer: getIssuerName(badge),
    issueDate: formatDate(badge.issued_at_date || badge.issued_at),
    badgeId: badge.id,
    badgeUrl: `https://www.credly.com/badges/${badge.id}`,
  };

  const level = mapLevel(badge);
  if (level) entry.level = level;

  const expiry = formatDate(badge.expires_at_date || badge.expires_at);
  if (expiry) entry.expiryDate = expiry;

  const imageUrl =
    badge.image_url || badge.image?.url || badge.badge_template?.image?.url;
  if (imageUrl) entry.imageUrl = imageUrl;

  return entry;
}

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchBadges() {
  console.log(`Fetching badges for @${CREDLY_USERNAME}...`);
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(API_URL, {
        headers: {
          Accept: "application/json",
        },
      });

      if (res.ok) {
        const json = await res.json();
        const badges = json.data || json;

        if (!Array.isArray(badges)) {
          throw new TypeError("Credly response did not contain a badge array.");
        }

        return badges;
      }

      const retriable = res.status >= 500 || res.status === 429;
      const msg = `Credly API returned ${res.status}: ${res.statusText}`;

      if (!retriable || attempt === MAX_RETRIES) throw new Error(msg);

      console.warn(`Attempt ${attempt} failed (${msg}), retrying...`);
    } catch (err) {
      lastError = err;
      if (attempt === MAX_RETRIES) throw err;
      console.warn(`Attempt ${attempt} error: ${err.message}, retrying...`);
    }

    await sleep(INITIAL_BACKOFF_MS * 2 ** (attempt - 1));
  }

  throw lastError;
}

async function main() {
  const badges = await fetchBadges();
  console.log(`Fetched ${badges.length} badges from Credly`);

  const certifications = [];
  const learningBadges = [];
  let certId = 1;
  let badgeId = 1;

  const sorted = [...badges].sort((a, b) => {
    const dateA = a.issued_at_date || a.issued_at || "";
    const dateB = b.issued_at_date || b.issued_at || "";
    return dateB.localeCompare(dateA);
  });

  for (const badge of sorted) {
    if (badge.state === "revoked") continue;

    const name = badge.badge_template?.name || "";
    if (isCertification(name)) {
      certifications.push(transformBadge(badge, certId++));
    } else {
      learningBadges.push(transformBadge(badge, badgeId++));
    }
  }

  console.log(`Certifications: ${certifications.length}`);
  console.log(`Learning badges: ${learningBadges.length}`);

  let existing = {};
  try {
    existing = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  } catch {
    console.log("No existing achievements.json found; creating a new file.");
  }

  const updated = {
    certifications,
    learning_badges: learningBadges,
    achievements: existing.achievements || [],
    coding_platform_stats: existing.coding_platform_stats || {},
  };

  writeFileSync(DATA_PATH, JSON.stringify(updated, null, 2) + "\n", "utf8");
  console.log(`Updated ${DATA_PATH}`);

  console.log("\n--- Certifications ---");
  for (const c of certifications) {
    console.log(`  ${c.name} (${c.issuer}) - ${c.issueDate}`);
  }

  console.log("\n--- Learning Badges ---");
  for (const b of learningBadges) {
    console.log(`  ${b.name} (${b.issuer}) - ${b.issueDate}`);
  }
}

try {
  await main();
} catch (err) {
  console.error("Failed to sync Credly badges:", err.message);
  process.exit(1);
}
