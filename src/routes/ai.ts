// src/pages/api/ai.ts
//
// Multi-provider AI endpoint for rjmlaird.co.uk
// Accepts a question about Ryan and answers it using a chosen LLM provider,
// grounded in site content pulled from the existing resilient API data layer.
//
// Providers: claude (default), openai, gemini, perplexity
// Select via request body: { "question": "...", "provider": "openai" }
//
// Secrets required (set only the ones you plan to use):
//   wrangler secret put ANTHROPIC_API_KEY
//   wrangler secret put OPENAI_API_KEY
//   wrangler secret put GEMINI_API_KEY
//   wrangler secret put PERPLEXITY_API_KEY
//
// Assumes: Cloudflare adapter. Falls back to import.meta.env for local dev.

import type { APIRoute } from "astro";

export const prerender = false;

type Provider = "claude" | "openai" | "gemini" | "perplexity";

const DEFAULT_PROVIDER: Provider = "claude";
const MAX_TOKENS = 1000;

const MODELS: Record<Provider, string> = {
  claude: "claude-sonnet-4-6",
  openai: "gpt-5.1",
  gemini: "gemini-2.5-flash",
  perplexity: "sonar-pro",
};

// Endpoints on your own site that supply grounding context.
// Perplexity does its own live web search, so context matters less there,
// but we still pass it for consistency of answers across providers.
const CONTEXT_SOURCES = [
  "/api/cv.json",
  "/api/projects.json",
  "/api/publications.json",
] as const;

interface RequestBody {
  question?: string;
  provider?: string;
}

interface AdapterResult {
  answer: string;
}

function getEnv(request: Request, key: string): string | undefined {
  return (request as any).cf?.env?.[key] ?? (import.meta.env as any)[key];
}

async function fetchContext(origin: string): Promise<string> {
  const results = await Promise.allSettled(
    CONTEXT_SOURCES.map(async (path) => {
      const res = await fetch(`${origin}${path}`, {
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(`${path} returned ${res.status}`);
      const data = await res.json();
      return `## Source: ${path}\n${JSON.stringify(data)}`;
    })
  );

  const succeeded = results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value);

  if (succeeded.length === 0) {
    return (
      "## Fallback context\nRyan Laird is a space sector marketing consultant, " +
      "science communicator, and open-source developer running Green Orbit Digital. " +
      "Full CV data is temporarily unavailable."
    );
  }

  return succeeded.join("\n\n");
}

function buildSystemPrompt(context: string): string {
  return [
    "You are the site assistant for rjmlaird.co.uk, answering questions about Ryan Laird",
    "for visitors (recruiters, collaborators, journalists, etc).",
    "Answer only from the CONTEXT below. If the context doesn't cover something,",
    "say you don't have that information rather than guessing.",
    "Keep answers concise (2-4 sentences) and factual. Do not invent skills,",
    "job titles, or achievements not present in the context.",
    "",
    "CONTEXT:",
    context,
  ].join("\n");
}

// ---- Provider adapters -----------------------------------------------
// Each adapter takes (question, systemPrompt, apiKey) and returns a
// normalized { answer } shape, or throws on failure.

async function callClaude(
  question: string,
  systemPrompt: string,
  apiKey: string
): Promise<AdapterResult> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELS.claude,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: question }],
    }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const answer = data.content
    ?.filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n")
    .trim();
  return { answer: answer || "No answer generated." };
}

async function callOpenAI(
  question: string,
  systemPrompt: string,
  apiKey: string
): Promise<AdapterResult> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODELS.openai,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const answer = data.choices?.[0]?.message?.content?.trim();
  return { answer: answer || "No answer generated." };
}

async function callGemini(
  question: string,
  systemPrompt: string,
  apiKey: string
): Promise<AdapterResult> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODELS.gemini}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: question }] }],
        generationConfig: { maxOutputTokens: MAX_TOKENS },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const answer = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  return { answer: answer || "No answer generated." };
}

async function callPerplexity(
  question: string,
  systemPrompt: string,
  apiKey: string
): Promise<AdapterResult> {
  const res = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODELS.perplexity,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Perplexity API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const answer = data.choices?.[0]?.message?.content?.trim();
  return { answer: answer || "No answer generated." };
}

const ADAPTERS: Record<
  Provider,
  (question: string, systemPrompt: string, apiKey: string) => Promise<AdapterResult>
> = {
  claude: callClaude,
  openai: callOpenAI,
  gemini: callGemini,
  perplexity: callPerplexity,
};

const ENV_KEYS: Record<Provider, string> = {
  claude: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
};

// ---- Route handler -----------------------------------------------------

export const POST: APIRoute = async ({ request, url }) => {
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const question = body.question?.trim();
  if (!question) return jsonError("Missing 'question' field", 400);
  if (question.length > 2000) return jsonError("Question too long (max 2000 chars)", 400);

  const providerInput = (body.provider?.trim().toLowerCase() || DEFAULT_PROVIDER) as Provider;
  if (!ADAPTERS[providerInput]) {
    return jsonError(
      `Unknown provider '${providerInput}'. Valid options: ${Object.keys(ADAPTERS).join(", ")}`,
      400
    );
  }

  const apiKey = getEnv(request, ENV_KEYS[providerInput]);
  if (!apiKey) {
    return jsonError(`Provider '${providerInput}' is not configured`, 503);
  }

  const context = await fetchContext(url.origin);
  const systemPrompt = buildSystemPrompt(context);

  try {
    const result = await ADAPTERS[providerInput](question, systemPrompt, apiKey);
    return new Response(
      JSON.stringify({ answer: result.answer, provider: providerInput }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  } catch (err) {
    console.error(`AI endpoint failure (${providerInput})`, err);
    return jsonError("AI service temporarily unavailable", 502);
  }
};

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
