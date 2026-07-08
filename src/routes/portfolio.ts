import { json } from "../lib/jsonResponse";

import initiatives from "../data/initiatives.json";
import reviews from "../data/reviews.json";
import teaching from "../data/teaching.json";

export type PortfolioCollection =
  | "initiatives"
  | "reviews"
  | "teaching"
  | "research";

const SECTION_KEYS = [
  "initiatives",
  "reviews",
  "teaching",
  "research",
] as const satisfies readonly PortfolioCollection[];

const portfolioData = {
  initiatives,
  reviews,
  teaching,
} satisfies Record<Exclude<PortfolioCollection, "research">, unknown>;

type ResearchEntry = {
  id: string;
  title: string;
  authors: string;
  year: string;
  type: string;
  publication: string;
  abstract: string;
  keywords: string[];
  doi: string;
  url: string;
  pdf: string;
  bibtex: string;
};

type ResearchData = {
  bibtex: string;
  orcid: string;
  items: ResearchEntry[];
};

let researchCache: ResearchData | null = null;

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isCollection(value: string): value is PortfolioCollection {
  return (SECTION_KEYS as readonly string[]).includes(value);
}

function getRoute(request: Request) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/v1\/portfolio\/?/, "");
  const query = url.searchParams.get("q");
  return { path, query };
}

function clean(s: unknown) {
  return typeof s === "string" ? s.trim() : "";
}

function normalizeAuthors(authors: unknown) {
  if (!Array.isArray(authors)) return "";
  return authors
    .map((a: any) => [clean(a.given), clean(a.family)].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(", ");
}

function normalizeYear(item: any) {
  return item?.issued?.["date-parts"]?.[0]?.[0] || item?.year || "";
}

function normalizeTitle(item: any) {
  return Array.isArray(item.title) ? item.title.join(" ") : item.title || "Untitled";
}

function normalizeContainer(item: any) {
  return item["container-title"] || item.journal || item.booktitle || item.publisher || "";
}

function normalizeType(item: any) {
  if (item.type === "article-journal") return "Journal article";
  if (item.type === "paper-conference") return "Conference paper";
  if (item.type === "report") return "Report";
  if (item.type === "webpage") return "Web page";
  if (item.type === "thesis") return "Thesis";
  return item.type || "Publication";
}

function normalizeUrl(item: any) {
  return item.URL || item.url || "";
}

function normalizeDoi(item: any) {
  return item.DOI || item.doi || "";
}

function normalizeAbstract(item: any) {
  return item.abstract || "";
}

function normalizeKeywords(item: any) {
  const raw = item.keyword || item.keywords || "";
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === "string") return raw.split(/[;,]/).map((s: string) => s.trim()).filter(Boolean);
  return [];
}

function excerptWords(text: string, count = 40) {
  const words = (text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= count) return { text: text || "", more: false };
  return { text: words.slice(0, count).join(" ") + "...", more: true };
}

function pdfUrlFromItem(item: any) {
  const file = item.file;
  if (!file) return "";
  const raw = Array.isArray(file) ? String(file[0] || "") : String(file);
  const match = raw.match(/^[^:]+:([^:]+):application\/pdf$/i);
  return match ? `/${match[1]}` : "";
}

function parseBibtexEntries(bibtex: string): any[] {
  const entries: any[] = [];
  const blocks = bibtex.split(/\n@/g).map((b, i) => (i === 0 ? b : "@" + b));
  for (const block of blocks) {
    const typeMatch = block.match(/^@([a-zA-Z]+)\s*{\s*([^,]+),/);
    if (!typeMatch) continue;
    const type = typeMatch[1].toLowerCase();
    const id = typeMatch[2].trim();

    const getField = (name: string) => {
      const re = new RegExp(`${name}\\s*=\\s*[{"]([^"}]+)[}"]`, "i");
      return block.match(re)?.[1] ?? "";
    };

    const title = getField("title");
    const author = getField("author");
    const year = getField("year");
    const journal = getField("journal") || getField("booktitle") || getField("publisher");
    const abstract = getField("abstract");
    const doi = getField("doi");
    const url = getField("url");
    const keywords = getField("keywords").split(/[;,]/).map((s) => s.trim()).filter(Boolean);
    const pdf = getField("file");

    entries.push({
      id,
      title,
      authors: author,
      year,
      type,
      publication: journal,
      abstract,
      keywords,
      doi,
      url,
      pdf,
      bibtex: block.trim(),
    });
  }
  return entries;
}

async function loadResearch(): Promise<ResearchData> {
  if (researchCache) return researchCache;

  const res = await fetch("https://api.rjmlaird.co.uk/api/publications.bib", {
    headers: { accept: "text/plain, application/octet-stream;q=0.9, */*;q=0.8" },
  });

  if (!res.ok) {
    researchCache = { bibtex: "", orcid: "", items: [] };
    return researchCache;
  }

  const bibtex = await res.text();
  const orcidMatch = bibtex.match(/orcid\s*=\s*[{"]([^"}]+)[}"]/i);
  const orcid = orcidMatch?.[1] ?? "";
  const items = parseBibtexEntries(bibtex).map((item) => {
    const preview = excerptWords(item.abstract, 40);
    const titleUrl = item.doi ? `https://doi.org/${item.doi}` : item.url || "";
    const recordUrl = item.url || (item.doi ? `https://doi.org/${item.doi}` : "");
    return {
      id: item.id,
      title: item.title || "Untitled",
      authors: item.authors || "",
      year: item.year || "",
      type: item.type || "Publication",
      publication: item.publication || "",
      abstract: preview.text,
      keywords: item.keywords || [],
      doi: item.doi || "",
      url: titleUrl || "",
      pdf: pdfUrlFromItem(item),
      bibtex: item.bibtex,
      recordUrl,
    };
  });

  researchCache = { bibtex, orcid, items };
  return researchCache;
}

export async function handlePortfolio(request: Request, _env: Env) {
  const method = request.method.toUpperCase();
  const { path, query } = getRoute(request);

  const research = path === "research" || path === "full" || path === "search"
    ? await loadResearch()
    : null;

  if (!path) {
    return json({
      service: "portfolio",
      version: "1.0",
      sections: SECTION_KEYS,
      endpoints: [
        "/v1/portfolio",
        "/v1/portfolio/sections",
        "/v1/portfolio/list",
        "/v1/portfolio/full",
        "/v1/portfolio/section/:section",
        "/v1/portfolio/search?q=",
      ],
    });
  }

  if (path === "sections") return json({ sections: SECTION_KEYS });

  if (path === "list") {
    return json({
      count: SECTION_KEYS.length,
      items: SECTION_KEYS.map((section) => ({
        section,
        hasData: section === "research" ? (research?.items.length ?? 0) > 0 : portfolioData[section] !== undefined,
      })),
    });
  }

  if (path === "full") {
    return json({
      sections: {
        ...portfolioData,
        research: research ?? { bibtex: "", orcid: "", items: [] },
      },
    });
  }

  if (path === "search") {
    const q = safeTrim(query).toLowerCase();
    if (!q) return json({ error: "Missing ?q=" }, 400);

    const baseResults = SECTION_KEYS.filter((section) => {
      if (section === "research") return JSON.stringify(research ?? {}).toLowerCase().includes(q);
      return JSON.stringify(portfolioData[section]).toLowerCase().includes(q);
    }).map((section) => ({
      section,
      data: section === "research" ? research : portfolioData[section],
    }));

    return json({ query: q, count: baseResults.length, results: baseResults });
  }

  if (path === "research" && method === "GET") {
    return json({ section: "research", data: research ?? (await loadResearch()) });
  }

  if (path.startsWith("section/")) {
    const section = safeTrim(path.replace(/^section\//, ""));
    if (!isCollection(section)) {
      return json({ error: "Not found", section, allowed: SECTION_KEYS }, 404);
    }

    if (section === "research") {
      return json({ section, data: research ?? (await loadResearch()) });
    }

    return json({ section, data: portfolioData[section] });
  }

  if (isCollection(path) && method === "GET") {
    if (path === "research") return json({ section: "research", data: research ?? (await loadResearch()) });
    return json({ section: path, data: portfolioData[path] });
  }

  return json({ error: "Not found", path, method }, 404);
}
