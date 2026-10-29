// The public estate registry (subdomains). Source of truth is rjmlaird-docs/data/sites.yaml; the
// JSON in src/data/sites.json is generated from it with restricted hosts (dam, mcp, hooks, auth,
// dav, upload) already removed, so nothing private can appear here.
import registryData from "../data/sites.json";

export type SiteKind = "hub" | "authority" | "service" | "operational" | "tool";
export type SiteStatus = "live" | "building" | "planned" | "optional";

export type Site = {
  id: string;
  label: string;
  host: string;
  url: string;
  kind: SiteKind;
  status: SiteStatus;
  audience: string;
  job: string;
  cta: string | null;
  footer: boolean;
  footer_order: number | null;
};

export const KINDS: readonly SiteKind[] = ["hub", "authority", "service", "operational", "tool"];
export const STATUSES: readonly SiteStatus[] = ["live", "building", "planned", "optional"];

export const APEX = "rjmlaird.co.uk";
export const registryVersion: string = registryData.version;
export const sites = registryData.sites as Site[];

/**
 * Where each subdomain's data lives in this API, so a client can go from a host to its machine-readable
 * entry point. Null means the site has no API surface (it is purely a web front end).
 */
export const SITE_API: Record<string, string | null> = {
  main: "/v1/bio",
  cv: "/v1/cv",
  portfolio: "/v1/portfolio",
  research: "/v1/research",
  glossary: "/v1/glossary",
  labs: "/v1/labs",
  apps: "/v1/apps",
  tools: "/v1/tools",
  api: "/v1",
  status: "/v1/status",
  brand: null,
  booking: null,
  cdn: null,
};

export function findSite(key: string): Site | undefined {
  const k = key.trim().toLowerCase().replace(/\.$/, "");
  const label = k.endsWith(`.${APEX}`) ? k.slice(0, -(APEX.length + 1)) : k;
  return sites.find((s) => s.id === k || s.host === k || s.id === label);
}
