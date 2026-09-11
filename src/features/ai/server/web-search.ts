/**
 * GebzemAI web search fallback: one OpenAI Responses API request with the built-in web_search tool, used only when the
 * app's own data has nothing (the internet_ara tool; the prompt tells the model to try the app tools first).
 *
 * Wire format (checked against the live API on 2026-09-12 with gpt-5.4-mini):
 * - POST https://api.openai.com/v1/responses, "Authorization: Bearer <key>", no streaming.
 * - tools: [{ type: "web_search", search_context_size, user_location: { type: "approximate", country, city, region,
 *   timezone } }]; reasoning.effort "none" works with web_search on gpt-5.4-mini (about 4-5 s, one search).
 * - output: web_search_call items (action.type "search" | "open_page" | "find_in_page"), then a message item whose
 *   content[0] is { type: "output_text", text, annotations: [{ type: "url_citation", url, title, start_index,
 *   end_index }] }. usage: { input_tokens (search content included), output_tokens }.
 * - Cost: a web search call is billed per call (10 USD / 1,000 for reasoning models) and the search content as input
 *   tokens at the model rate, so one question costs about 0.015 USD with gpt-5.4-mini (about 8k input tokens).
 * Pure module (no Next / Supabase imports). server-only: it handles the API key.
 */
import "server-only";

export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

/** Model used for the search request (its own model: the answer model may be another provider). */
export const WEB_SEARCH_MODEL = "gpt-5.4-mini";
/** Per-call price of the web_search tool in micro-USD (10 USD / 1,000 calls). */
export const WEB_SEARCH_CALL_MICRO_USD = 10_000;
/** gpt-5.4-mini prices in micro-USD per token (0.75 / 4.50 USD per 1M tokens). */
const INPUT_MICRO_USD_PER_TOKEN = 0.75;
const OUTPUT_MICRO_USD_PER_TOKEN = 4.5;

const TIMEOUT_MS = 20_000;
const MAX_SOURCES = 4;
const MAX_TEXT = 1200;

export type WebSource = { url: string; title: string };

export type WebSearchResult = {
  /** Short Turkish summary written by the search model (plain text, links removed). */
  text: string;
  sources: WebSource[];
  /** Number of web_search_call items that ran a search (each is billed). */
  searches: number;
  inputTokens: number;
  outputTokens: number;
  /** What this request cost, in micro-USD (for the daily budget). */
  costMicroUsd: number;
};

const INSTRUCTIONS =
  "Kocaeli (Türkiye) için kısa ve güncel bir bilgi araması yapıyorsun. Yanıtı Türkçe, en fazla 4 kısa cümle yaz. Yalnızca bulduğun kaynaklarda yazanı aktar, tahmin etme. Adres, telefon ya da saat gibi bilgilerde kaynağın ne dediğini söyle. Markdown, kalın yazı, başlık ya da bağlantı yazma.";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/** https URL without tracking parameters (utm_*), or null. */
function cleanUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    for (const k of [...u.searchParams.keys()]) if (k.toLowerCase().startsWith("utm_")) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return null;
  }
}

/** Drops markdown the model may still write: "([site](url))" citations, links, bold, headings. */
function plainText(s: string): string {
  return s
    .replace(/\s*\(\[[^\]]*\]\([^)]*\)\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*|__|^#+\s*/gm, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
    .slice(0, MAX_TEXT);
}

/**
 * Searches the web for `query` (Kocaeli-biased). Throws on a network / HTTP error or a timeout; the caller turns that
 * into a tool error. Never logs the query or the key.
 */
export async function webSearch(query: string, apiKey: string, signal?: AbortSignal): Promise<WebSearchResult> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const res = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: WEB_SEARCH_MODEL,
      reasoning: { effort: "none" },
      max_output_tokens: 400,
      instructions: INSTRUCTIONS,
      tools: [
        {
          type: "web_search",
          search_context_size: "low",
          // Province only: the app covers all 12 districts (the query names the district when the user did).
          user_location: { type: "approximate", country: "TR", region: "Kocaeli", timezone: "Europe/Istanbul" },
        },
      ],
      tool_choice: "required",
      input: query,
      store: false,
    }),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    cache: "no-store",
  });
  const body = asRecord(await res.json().catch(() => null));
  if (!res.ok) throw new Error(`web_search http ${res.status}`);

  const output = arr(body.output).map(asRecord);
  const searches = output.filter((o) => o.type === "web_search_call" && asRecord(o.action).type === "search").length;
  let text = "";
  const sources: WebSource[] = [];
  const seen = new Set<string>();
  for (const item of output) {
    if (item.type !== "message") continue;
    for (const part of arr(item.content).map(asRecord)) {
      if (part.type !== "output_text" || typeof part.text !== "string") continue;
      text += part.text;
      for (const a of arr(part.annotations).map(asRecord)) {
        const url = a.type === "url_citation" ? cleanUrl(a.url) : null;
        if (!url || seen.has(url) || sources.length >= MAX_SOURCES) continue;
        seen.add(url);
        const title = typeof a.title === "string" && a.title.trim() ? a.title.trim().slice(0, 120) : new URL(url).hostname;
        sources.push({ url, title });
      }
    }
  }
  const usage = asRecord(body.usage);
  const inputTokens = count(usage.input_tokens);
  const outputTokens = count(usage.output_tokens);
  const costMicroUsd = Math.ceil(
    Math.max(searches, 1) * WEB_SEARCH_CALL_MICRO_USD + inputTokens * INPUT_MICRO_USD_PER_TOKEN + outputTokens * OUTPUT_MICRO_USD_PER_TOKEN,
  );
  return { text: plainText(text), sources, searches, inputTokens, outputTokens, costMicroUsd };
}
