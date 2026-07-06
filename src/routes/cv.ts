import { json } from "../lib/jsonResponse";
import { storage } from "../services/storage";

const CV_PREFIX = "cv";

type CvSection =
  | "achievements"
  | "awards"
  | "certifications"
  | "contact"
  | "credentials"
  | "credly"
  | "education"
  | "experience"
  | "initiatives"
  | "languages"
  | "memberships"
  | "organisations"
  | "personal"
  | "profile"
  | "projects"
  | "reviews"
  | "services"
  | "skills"
  | "socials"
  | "talks"
  | "teaching"
  | "tools"

const SECTION_KEYS: CvSection[] = [
  "achievements",
  "awards",
  "certifications",
  "contact",
  "credentials",
  "credly",
  "education",
  "experience",
  "initiatives",
  "languages",
  "memberships",
  "organisations",
  "personal",
  "profile",
  "projects",
  "reviews",
  "services",
  "skills",
  "socials",
  "talks",
  "teaching",
  "tools",
];

type R2Item = {
  key: string;
  size?: number;
  etag?: string;
  uploaded?: string;
  metadata?: Record<string, unknown>;
};

type CvRecord = {
  id: string;
  section: CvSection;
  title?: string | null;
  updatedAt?: string | null;
  source?: string | null;
  data: unknown;
};

type CvEnv = Env & {
  CV_PREFIX?: string;
};

function normalizeR2List(result: unknown): R2Item[] {
  if (!result) return [];
  if (Array.isArray(result)) return result as R2Item[];
  if (typeof result === "object" && result !== null) {
    const r = result as Record<string, unknown>;
    if (Array.isArray(r.objects)) return r.objects as R2Item[];
    if (Array.isArray(r.keys)) return r.keys as R2Item[];
  }
  return [];
}

function getRoute(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/v1\/cv\/?/, "");
  const query = url.searchParams.get("q");
  return { path, query, url };
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function readJsonBody<T>(request: Request): Promise<T | null> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return null;

  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

async function listCvItems(env: CvEnv) {
  const prefix = env.CV_PREFIX ?? CV_PREFIX;
  const raw = await storage.r2.list(`${prefix}/`, env);
  return normalizeR2List(raw);
}

async function readCvRecord(env: CvEnv, key: string): Promise<CvRecord | null> {
  const obj = await storage.r2.get(key, env);
  if (!obj?.body) return null;

  const text = await new Response(obj.body).text();
  if (!text) return null;

  try {
    return JSON.parse(text) as CvRecord;
  } catch {
    return null;
  }
}

async function writeCvRecord(env: CvEnv, record: CvRecord) {
  const prefix = env.CV_PREFIX ?? CV_PREFIX;
  const key = `${prefix}/${record.section}.json`;
  const bytes = new TextEncoder().encode(JSON.stringify(record));
  await storage.r2.put(key, bytes, env, "application/json");
  return key;
}

function isSection(value: string): value is CvSection {
  return (SECTION_KEYS as string[]).includes(value);
}

function sectionFromPath(path: string): CvSection | null {
  const cleaned = safeTrim(path).replace(/^section\//, "").replace(/\.json$/, "");
  return isSection(cleaned) ? cleaned : null;
}

export async function handleCv(request: Request, env: CvEnv) {
  const method = request.method.toUpperCase();
  const { path, query } = getRoute(request);

  if (!path) {
    return json({
      service: "cv",
      version: "1.0",
      sections: SECTION_KEYS,
      endpoints: [
        "/v1/cv",
        "/v1/cv/list",
        "/v1/cv/full",
        "/v1/cv/section/:section",
        "/v1/cv/search?q=",
        "/v1/cv/ingest",
      ],
    });
  }

  if (path === "list") {
    const items = await listCvItems(env);

    return json({
      count: items.length,
      items: items.slice(0, 200),
    });
  }

  if (path === "full") {
    const items = await listCvItems(env);
    const sections: Record<string, unknown> = {};

    for (const item of items) {
      const record = await readCvRecord(env, item.key);
      if (!record) continue;
      sections[record.section] = record.data;
    }

    return json({
      sectionCount: Object.keys(sections).length,
      sections,
    });
  }

  if (path === "search") {
    const q = safeTrim(query).toLowerCase();
    if (!q) return json({ error: "Missing ?q=" }, 400);

    const items = await listCvItems(env);
    const results: Array<{ key: string; size: number; record: CvRecord | null }> = [];

    for (const item of items) {
      const record = await readCvRecord(env, item.key);
      const haystack = JSON.stringify({ key: item.key, record }).toLowerCase();
      if (haystack.includes(q)) {
        results.push({
          key: item.key,
          size: item.size ?? 0,
          record,
        });
      }
    }

    return json({
      query: q,
      count: results.length,
      results: results.slice(0, 100),
    });
  }

  const section = sectionFromPath(path);
  if (section && method === "GET") {
    const key = `${env.CV_PREFIX ?? CV_PREFIX}/${section}.json`;
    const record = await readCvRecord(env, key);

    if (!record) {
      return json({ error: "Not found", key }, 404);
    }

    return json({
      key,
      record,
    });
  }

  if (path === "ingest" && method === "POST") {
    const body = (await readJsonBody<Partial<CvRecord>>(request)) ?? {};
    const sectionValue = safeTrim(body.section);

    if (!isSection(sectionValue)) {
      return json(
        {
          error: "Invalid or missing section",
          allowed: SECTION_KEYS,
        },
        400
      );
    }

    const record: CvRecord = {
      id: safeTrim(body.id) || sectionValue,
      section: sectionValue,
      title: body.title ?? null,
      updatedAt: safeTrim(body.updatedAt) || new Date().toISOString(),
      source: body.source ?? null,
      data: body.data ?? null,
    };

    const key = await writeCvRecord(env, record);

    return json(
      {
        status: "ingested",
        key,
        record,
      },
      201
    );
  }

  if (path === "sections") {
    return json({
      sections: SECTION_KEYS,
    });
  }

  return json(
    {
      error: "Not found",
      path,
      method,
    },
    404
  );
}

export default {
  async fetch(request: Request, env: CvEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/v1/cv")) {
      return handleCv(request, env);
    }

    return json(
      {
        error: "Not found",
        path: url.pathname,
      },
      404
    );
  },
};
