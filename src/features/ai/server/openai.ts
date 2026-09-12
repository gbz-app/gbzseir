/**
 * Minimal OpenAI Chat Completions client for GebzemAI: raw fetch (no SDK), stream: true with usage, manual tool loop.
 * Same contract as ./anthropic (AgentRunOptions in, provider-neutral AiStreamEvent text out), so the route and UI do not
 * change. Pure module (no Next / Supabase imports) so it can be tested with a mocked fetch.
 *
 * Wire format (checked against the live API on 2026-09-11 with gpt-5.4-mini, gpt-5.4-nano and gpt-4.1-mini):
 * - POST https://api.openai.com/v1/chat/completions, "Authorization: Bearer <key>". Server-Sent Events: "data: <chunk>"
 *   blocks, "data: [DONE]" last.
 * - Text: choices[0].delta.content. Tool calls: choices[0].delta.tool_calls[{ index, id?, type?, function: { name?,
 *   arguments } }]; the id and name come in the first delta of an index, the arguments are split over the next ones.
 * - finish_reason: "tool_calls" | "stop" | "length" | "content_filter". With stream_options.include_usage the last chunk
 *   has choices [] and usage { prompt_tokens (cached included), completion_tokens, prompt_tokens_details.cached_tokens }.
 * - The next request carries { role: "assistant", content: null | text, tool_calls } and one { role: "tool",
 *   tool_call_id, content } per call. tool_choice "none" (with the tools still listed) makes the model answer.
 * - GPT-5.4 models take reasoning_effort ("none" is their default and the fastest); gpt-4.1-mini rejects the field.
 *   The per-model fields come from the model catalog (model.extra).
 * server-only: it handles the API key and must never reach a client bundle.
 */
import "server-only";
import {
  AiUpstreamError,
  asRecord,
  createTextOutput,
  num,
  parseToolInput,
  runToolCalls,
  type AgentResult,
  type AgentRunOptions,
  type AgentStop,
  type AgentTool,
} from "./agent";

export const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export type OaToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type OaUserPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "low" } };
export type OaMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | OaUserPart[] }
  | { role: "assistant"; content: string | null; tool_calls?: OaToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type OaTool = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };

/** The same six tools as function tools (not strict: the schemas have optional fields). */
export function toOpenAiTools(tools: AgentTool[]): OaTool[] {
  return tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } }));
}

/** finish_reason -> the stop names the route already reports (Anthropic's). */
const FINISH_TO_STOP: Record<string, AgentStop> = {
  stop: "end_turn",
  length: "max_tokens",
  tool_calls: "tool_use",
  function_call: "tool_use",
  content_filter: "refusal",
};
const stopFor = (finish: string | null): AgentStop =>
  finish && Object.prototype.hasOwnProperty.call(FINISH_TO_STOP, finish) ? FINISH_TO_STOP[finish] : "end_turn";

/** Parallel calls of one message kept (higher indexes are ignored). */
const MAX_TOOL_CALLS = 16;

type OnceResult = { text: string; toolCalls: OaToolCall[]; finish: string | null; refused: boolean };

function errorType(err: Record<string, unknown>): string {
  if (typeof err.code === "string" && err.code) return err.code;
  if (typeof err.type === "string" && err.type) return err.type;
  return "api_error";
}

/** One streamed Chat Completions call. Text deltas go to onText as they arrive. */
async function streamOnce(o: AgentRunOptions, body: Record<string, unknown>, onText: (t: string) => void): Promise<OnceResult> {
  const payload = JSON.stringify(body);
  let res: Response;
  try {
    res = await (o.fetchImpl ?? fetch)(OPENAI_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${o.apiKey}` },
      body: payload,
      signal: o.signal,
      cache: "no-store",
    });
  } catch (e) {
    if (o.signal.aborted) throw e;
    throw new AiUpstreamError(0, "network", e instanceof Error ? e.message : "fetch failed");
  }
  if (!res.ok || !res.body) {
    // { error: { message, type, param, code } }; 401 bad key, 429 rate limit or insufficient_quota, 5xx outage.
    let type = "api_error";
    let message = `HTTP ${res.status}`;
    try {
      const err = asRecord(asRecord(await res.json()).error);
      type = errorType(err);
      if (typeof err.message === "string") message = err.message.slice(0, 300);
    } catch {
      /* body was not JSON */
    }
    throw new AiUpstreamError(res.status, type, message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const calls: Array<{ id: string; name: string; args: string }> = [];
  const usage = { seen: false, prompt: 0, cached: 0, completion: 0 };
  let buf = "";
  let readDone = false;
  let sawDone = false;
  let finish: string | null = null;
  let text = "";
  let refused = false;
  /** Output characters streamed (text + tool arguments), for the usage estimate when the usage chunk never came. */
  let streamedChars = 0;

  const handle = (raw: string) => {
    const data: string[] = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("data:")) data.push(line.slice(line.startsWith("data: ") ? 6 : 5));
    }
    if (!data.length) return;
    const joined = data.join("\n").trim();
    if (joined === "[DONE]") {
      sawDone = true;
      return;
    }
    let ev: Record<string, unknown>;
    try {
      ev = asRecord(JSON.parse(joined));
    } catch {
      return;
    }
    if (ev.error) {
      const err = asRecord(ev.error);
      const type = errorType(err);
      throw new AiUpstreamError(type === "rate_limit_exceeded" ? 429 : 500, type, typeof err.message === "string" ? err.message.slice(0, 300) : type);
    }
    if (ev.usage && typeof ev.usage === "object") {
      const u = asRecord(ev.usage);
      usage.seen = true;
      usage.prompt = num(u.prompt_tokens);
      usage.cached = num(asRecord(u.prompt_tokens_details).cached_tokens);
      usage.completion = num(u.completion_tokens);
    }
    for (const item of Array.isArray(ev.choices) ? ev.choices : []) {
      const choice = asRecord(item);
      if (typeof choice.index === "number" && choice.index !== 0) continue; // n = 1
      const d = asRecord(choice.delta);
      if (typeof d.content === "string" && d.content) {
        text += d.content;
        streamedChars += d.content.length;
        onText(d.content);
      }
      if (typeof d.refusal === "string" && d.refusal) refused = true;
      if (Array.isArray(d.tool_calls)) {
        for (const part of d.tool_calls) {
          const tc = asRecord(part);
          const i = typeof tc.index === "number" ? tc.index : typeof tc.id === "string" ? calls.length : calls.length - 1;
          if (!Number.isInteger(i) || i < 0 || i >= MAX_TOOL_CALLS) continue;
          const fn = asRecord(tc.function);
          const b = (calls[i] ??= { id: "", name: "", args: "" });
          if (typeof tc.id === "string" && !b.id) b.id = tc.id;
          if (typeof fn.name === "string" && !b.name) b.name = fn.name;
          if (typeof fn.arguments === "string") {
            b.args += fn.arguments;
            streamedChars += fn.arguments.length;
          }
        }
      }
      if (typeof choice.finish_reason === "string") finish = choice.finish_reason;
    }
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        readDone = true;
        break;
      }
      buf = (buf + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
      let sep: number;
      while ((sep = buf.indexOf("\n\n")) !== -1) {
        const raw = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        handle(raw);
      }
    }
    buf += decoder.decode();
    if (buf.trim()) handle(buf.replace(/\r\n/g, "\n"));
  } finally {
    if (usage.seen) {
      const cached = Math.min(usage.cached, usage.prompt);
      o.usage.input += usage.prompt - cached;
      o.usage.cacheRead += cached;
      o.usage.output += usage.completion;
    } else {
      // The usage chunk comes last. A stream cut before it (stop, error) is still billed, so the budget gets a
      // conservative estimate: about 3 characters per input token, 2 per output token.
      // A photo counts as its low-detail view (about 100 tokens), not as its base64 text.
      const photos = payload.match(/;base64,[A-Za-z0-9+/=]+/g) ?? [];
      o.usage.input += Math.ceil((payload.length - photos.join("").length) / 3) + photos.length * 100;
      o.usage.output += Math.ceil(streamedChars / 2);
    }
    if (!readDone) reader.cancel().catch(() => {});
  }
  if (!sawDone && finish === null) throw new AiUpstreamError(502, "incomplete_stream", "stream ended early");

  const toolCalls: OaToolCall[] = [];
  calls.forEach((c, i) => {
    if (c?.name) toolCalls.push({ id: c.id || `call_${i}`, type: "function", function: { name: c.name, arguments: c.args || "{}" } });
  });
  return { text, toolCalls, finish, refused };
}

/**
 * The tool loop: stream a message; when it asks for tools, run them (in parallel, one tool message per call) and
 * continue. At most maxToolRounds tool rounds; the next request sets tool_choice "none" so the model answers.
 */
export async function runOpenAiAgent(o: AgentRunOptions): Promise<AgentResult> {
  const convo: OaMessage[] = [
    { role: "system", content: o.system },
    ...o.messages.map((m): OaMessage => {
      if (m.role === "assistant") return { role: "assistant", content: m.content };
      if (!m.image) return { role: "user", content: m.content };
      // detail "low": one small fixed-size view, enough for "what is this" and cheap for the daily budget.
      const url = `data:${m.image.mime};base64,${m.image.data}`;
      return { role: "user", content: [{ type: "text", text: m.content }, { type: "image_url", image_url: { url, detail: "low" } }] };
    }),
  ];
  const tools = toOpenAiTools(o.tools);
  const maxRounds = o.maxToolRounds ?? 4;
  const out = createTextOutput(o.emit);

  for (let round = 0; ; round++) {
    const toolsAllowed = round < maxRounds;
    const body: Record<string, unknown> = {
      model: o.model.id,
      messages: convo,
      tools,
      tool_choice: toolsAllowed ? "auto" : "none",
      stream: true,
      stream_options: { include_usage: true },
      max_completion_tokens: o.maxTokens ?? 800,
      // Not kept for OpenAI's stored completions (the default, sent explicitly).
      store: false,
      ...o.model.extra,
    };
    const msg = await streamOnce(o, body, out.onText);

    // Only complete calls run: a call cut by the token limit ("length") has broken arguments.
    if (msg.toolCalls.length && toolsAllowed && (msg.finish === "tool_calls" || msg.finish === "stop")) {
      convo.push({ role: "assistant", content: msg.text || null, tool_calls: msg.toolCalls });
      o.usage.toolCalls += msg.toolCalls.length;
      const results = await runToolCalls(
        o,
        msg.toolCalls.map((tc) => ({ id: tc.id, name: tc.function.name, input: parseToolInput(tc.function.arguments) })),
      );
      if (o.signal.aborted) throw new DOMException("Aborted", "AbortError");
      for (const { call, result } of results) convo.push({ role: "tool", tool_call_id: call.id, content: result.content });
      out.toolRoundDone();
      continue;
    }

    const stop: AgentStop = msg.refused && !msg.text ? "refusal" : stopFor(msg.finish);
    out.finish(stop);
    return { stop };
  }
}
