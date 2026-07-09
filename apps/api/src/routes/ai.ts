import { Hono } from "hono";
import { z } from "zod";

type Env = {
  API_BASE_URL?: string;
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  PERPLEXITY_API_KEY?: string;
};

type Provider = "claude" | "openai" | "gemini" | "perplexity";

type RequestBody = {
  question?: string;
  provider?: string;
};

type AdapterResult = {
  answer: string;
};

type AnthropicResponse = {
  content?: Array<{ type?: string; text?: string }>;
};

type OpenAIResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

const aiApp = new Hono<{ Bindings: Env }>();

const DEFAULT_PROVIDER: Provider = "claude";
const MAX_TOKENS = 1000;

const MODELS: Record<Provider, string> = {
  claude: "claude-sonnet-4-6",
  openai: "gpt-5.1",
  gemini: "gemini-2.5-flash",
  perplexity: "sonar-pro",
};

const CONTEXT_SOURCES = ["/api/cv.json", "/api/projects.json", "/api/publications.json"] as const;

const ENV_KEYS: Record<Provider, keyof Env> = {
  claude: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
};

async function fetchJson<T>(res: Response): Promise<T | null> {
  if (!res.ok) return null;
  return (await res.json()) as T;
}

async function fetchContext(origin: string): Promise<string> {
  const results = await Promise.allSettled(
    CONTEXT_SOURCES.map(async (path) => {
      const res = await fetch(`${origin}${path}`, {
        headers: { accept: "application/json" },
      });
      if (!res.ok) throw new Error(`${path} returned ${res.status}`);
      const data = (await res.json()) as unknown;
      return `## Source: ${path}\n${JSON.stringify(data)}`;
    })
  );

  const succeeded = results
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
    .map((r) => r.value);

  if (succeeded.length === 0) {
    return [
      "## Fallback context",
      "Ryan Laird is a web developer and science communicator working on digital products, content systems, and API-driven sites.",
      "Full CV data is temporarily unavailable.",
    ].join("\n");
  }

  return succeeded.join("\n\n");
}

function buildSystemPrompt(context: string): string {
  return [
    "You are the site assistant for rjmlaird.co.uk, answering questions about Ryan Laird.",
    "Answer only from the CONTEXT below. If the context doesn't cover something, say you don't have that information rather than guessing.",
    "Keep answers concise and factual. Do not invent skills, job titles, or achievements not present in the context.",
    "",
    "CONTEXT:",
    context,
  ].join("\n");
}

async function callClaude(question: string, systemPrompt: string, apiKey: string): Promise<AdapterResult> {
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

  const data = (await res.json()) as AnthropicResponse;
  const answer = data.content
    ?.filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("\n")
    .trim();

  return { answer: answer || "No answer generated." };
}

async function callOpenAI(question: string, systemPrompt: string, apiKey: string): Promise<AdapterResult> {
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

  const data = (await res.json()) as OpenAIResponse;
  const answer = data.choices?.[0]?.message?.content?.trim();

  return { answer: answer || "No answer generated." };
}

async function callGemini(question: string, systemPrompt: string, apiKey: string): Promise<AdapterResult> {
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

  const data = (await res.json()) as GeminiResponse;
  const answer = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  return { answer: answer || "No answer generated." };
}

async function callPerplexity(question: string, systemPrompt: string, apiKey: string): Promise<AdapterResult> {
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

  const data = (await res.json()) as OpenAIResponse;
  const answer = data.choices?.[0]?.message?.content?.trim();

  return { answer: answer || "No answer generated." };
}

const ADAPTERS: Record<Provider, (question: string, systemPrompt: string, apiKey: string) => Promise<AdapterResult>> = {
  claude: callClaude,
  openai: callOpenAI,
  gemini: callGemini,
  perplexity: callPerplexity,
};

aiApp.post("/", async (c) => {
  const body = (await c.req.json().catch(() => null)) as RequestBody | null;
  if (!body) return c.json({ error: "Invalid JSON body" }, 400);

  const question = body.question?.trim();
  if (!question) return c.json({ error: "Missing 'question' field" }, 400);
  if (question.length > 2000) return c.json({ error: "Question too long (max 2000 chars)" }, 400);

  const provider = ((body.provider?.trim().toLowerCase() || DEFAULT_PROVIDER) as Provider);
  if (!(provider in ADAPTERS)) {
    return c.json(
      { error: `Unknown provider '${provider}'. Valid options: ${Object.keys(ADAPTERS).join(", ")}` },
      400
    );
  }

  const apiKey = c.env[ENV_KEYS[provider]];
  if (!apiKey) return c.json({ error: `Provider '${provider}' is not configured` }, 503);

  const context = await fetchContext(c.req.url);
  const systemPrompt = buildSystemPrompt(context);

  try {
    const result = await ADAPTERS[provider](question, systemPrompt, apiKey);
    return c.json({ answer: result.answer, provider });
  } catch (err) {
    console.error(`AI endpoint failure (${provider})`, err);
    return c.json({ error: "AI service temporarily unavailable" }, 502);
  }
});

export { aiApp };
export default aiApp;
