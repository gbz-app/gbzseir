/**
 * Minimal Anthropic Messages API client for GebzemAI: raw fetch (no SDK), stream: true, manual tool loop.
 * Pure module (no Next / Supabase imports) so it can be tested with a mocked fetch.
 * Wire format: https://api.anthropic.com/v1/messages with the anthropic-version header; Server-Sent Events.
 * The options, the upstream error and the answer-text rules are shared with ./openai (./agent).
 * server-only: it handles the API key and must never reach a client bundle.
 */
import "server-only";
import { AiUpstreamError, asRecord, createTextOutput, num, runToolCalls, type AgentResult, type AgentRunOptions, type AgentTool } from "./agent";

export { AiUpstreamError };
export type { ToolRunResult } from "./agent";

export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";

export type ApiTextBlock = { type: "text"; text: string };
export type ApiToolUseBlock = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
export type ApiThinkingBlock = { type: "thinking"; thinking: string; signature: string };
export type ApiRedactedThinkingBlock = { type: "redacted_thinking"; data: string };
export type ApiContentBlock = ApiTextBlock | ApiToolUseBlock | ApiThinkingBlock | ApiRedactedThinkingBlock;
export type ApiToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
export type ApiMessage = { role: "user"; content: string | ApiToolResultBlock[] } | { role: "assistant"; content: string | ApiContentBlock[] };
export type ApiTool = AgentTool;
export type RunAgentOptions = AgentRunOptions;

type Building = ApiContentBlock & { _json?: string };

/** One streamed Messages API call. Text deltas go to onText as they arrive. */
async function streamOnce(
  o: AgentRunOptions,
  body: Record<string, unknown>,
  onText: (t: string) => void,
): Promise<{ content: ApiContentBlock[]; stopReason: string | null }> {
  let res: Response;
  try {
    res = await (o.fetchImpl ?? fetch)(ANTHROPIC_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": o.apiKey, "anthropic-version": ANTHROPIC_VERSION },
      body: JSON.stringify(body),
      signal: o.signal,
      cache: "no-store",
    });
  } catch (e) {
    if (o.signal.aborted) throw e;
    throw new AiUpstreamError(0, "network", e instanceof Error ? e.message : "fetch failed");
  }
  if (!res.ok || !res.body) {
    let type = "api_error";
    let message = `HTTP ${res.status}`;
    try {
      const j = asRecord(await res.json());
      const err = asRecord(j.error);
      if (typeof err.type === "string") type = err.type;
      if (typeof err.message === "string") message = err.message.slice(0, 300);
    } catch {
      /* body was not JSON */
    }
    throw new AiUpstreamError(res.status, type, message);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const blocks: Building[] = [];
  let buf = "";
  let stopReason: string | null = null;
  let stopped = false;
  let readDone = false;
  // Usage of this message (message_start, then cumulative counts in message_delta).
  let input = 0;
  let output = 0;
  let cacheWrite = 0;
  let cacheRead = 0;

  const readUsage = (u: Record<string, unknown>) => {
    input = Math.max(input, num(u.input_tokens));
    output = Math.max(output, num(u.output_tokens));
    cacheWrite = Math.max(cacheWrite, num(u.cache_creation_input_tokens));
    cacheRead = Math.max(cacheRead, num(u.cache_read_input_tokens));
  };

  const handle = (raw: string) => {
    const data: string[] = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("data:")) data.push(line.slice(line.startsWith("data: ") ? 6 : 5));
    }
    if (!data.length) return;
    let ev: Record<string, unknown>;
    try {
      ev = asRecord(JSON.parse(data.join("\n")));
    } catch {
      return;
    }
    const index = typeof ev.index === "number" ? ev.index : -1;
    switch (ev.type) {
      case "message_start":
        readUsage(asRecord(asRecord(ev.message).usage));
        break;
      case "content_block_start": {
        const cb = asRecord(ev.content_block);
        if (index < 0) break;
        if (cb.type === "text") {
          const text = typeof cb.text === "string" ? cb.text : "";
          blocks[index] = { type: "text", text };
          if (text) onText(text);
        } else if (cb.type === "tool_use") {
          blocks[index] = { type: "tool_use", id: String(cb.id ?? ""), name: String(cb.name ?? ""), input: {}, _json: "" };
        } else if (cb.type === "thinking") {
          blocks[index] = { type: "thinking", thinking: typeof cb.thinking === "string" ? cb.thinking : "", signature: typeof cb.signature === "string" ? cb.signature : "" };
        } else if (cb.type === "redacted_thinking") {
          blocks[index] = { type: "redacted_thinking", data: String(cb.data ?? "") };
        }
        break;
      }
      case "content_block_delta": {
        const d = asRecord(ev.delta);
        const b = blocks[index];
        if (!b) break;
        if (d.type === "text_delta" && b.type === "text" && typeof d.text === "string") {
          b.text += d.text;
          onText(d.text);
        } else if (d.type === "input_json_delta" && b.type === "tool_use" && typeof d.partial_json === "string") {
          b._json = (b._json ?? "") + d.partial_json;
        } else if (d.type === "thinking_delta" && b.type === "thinking" && typeof d.thinking === "string") {
          b.thinking += d.thinking;
        } else if (d.type === "signature_delta" && b.type === "thinking" && typeof d.signature === "string") {
          b.signature += d.signature;
        }
        break;
      }
      case "content_block_stop": {
        const b = blocks[index];
        if (b?.type === "tool_use") {
          try {
            b.input = asRecord(JSON.parse(b._json || "{}"));
          } catch {
            b.input = {};
          }
          delete b._json;
        }
        break;
      }
      case "message_delta":
        if (typeof asRecord(ev.delta).stop_reason === "string") stopReason = asRecord(ev.delta).stop_reason as string;
        readUsage(asRecord(ev.usage));
        break;
      case "message_stop":
        stopped = true;
        break;
      case "error": {
        const err = asRecord(ev.error);
        const type = typeof err.type === "string" ? err.type : "api_error";
        throw new AiUpstreamError(type === "overloaded_error" ? 529 : 500, type, typeof err.message === "string" ? err.message.slice(0, 300) : type);
      }
      default:
        break; // ping and future event types
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
    o.usage.input += input;
    o.usage.output += output;
    o.usage.cacheWrite += cacheWrite;
    o.usage.cacheRead += cacheRead;
    if (!readDone) reader.cancel().catch(() => {});
  }
  if (!stopped) throw new AiUpstreamError(502, "incomplete_stream", "stream ended early");

  const content: ApiContentBlock[] = [];
  for (const b of blocks) {
    if (!b) continue;
    if (b.type === "tool_use") {
      const { _json, ...rest } = b as ApiToolUseBlock & { _json?: string };
      void _json;
      content.push(rest);
    } else {
      content.push(b);
    }
  }
  return { content, stopReason };
}

/**
 * The tool loop: stream a message; when it asks for tools, run them (in parallel, all results in one user message)
 * and continue. At most maxToolRounds tool rounds; the next request forbids tools so the model answers.
 */
export async function runAgent(o: AgentRunOptions): Promise<AgentResult> {
  const convo: ApiMessage[] = o.messages.map((m): ApiMessage => (m.role === "user" ? { role: "user", content: m.content } : { role: "assistant", content: m.content }));
  const maxRounds = o.maxToolRounds ?? 4;
  const out = createTextOutput(o.emit);

  for (let round = 0; ; round++) {
    const toolsAllowed = round < maxRounds;
    const body: Record<string, unknown> = {
      model: o.model.id,
      max_tokens: o.maxTokens ?? 800,
      system: o.system,
      messages: convo,
      tools: o.tools,
      stream: true,
      ...(toolsAllowed ? {} : { tool_choice: { type: "none" } }),
      ...o.model.extra,
    };
    const msg = await streamOnce(o, body, out.onText);
    const toolUses = msg.content.filter((b): b is ApiToolUseBlock => b.type === "tool_use");

    if (msg.stopReason === "tool_use" && toolUses.length && toolsAllowed) {
      convo.push({ role: "assistant", content: msg.content });
      o.usage.toolCalls += toolUses.length;
      const results = await runToolCalls(o, toolUses);
      if (o.signal.aborted) throw new DOMException("Aborted", "AbortError");
      convo.push({
        role: "user",
        content: results.map(({ call, result }) => ({
          type: "tool_result" as const,
          tool_use_id: call.id,
          content: result.content,
          ...(result.isError ? { is_error: true } : {}),
        })),
      });
      out.toolRoundDone();
      continue;
    }

    const stop = msg.stopReason ?? "end_turn";
    out.finish(stop);
    return { stop };
  }
}
