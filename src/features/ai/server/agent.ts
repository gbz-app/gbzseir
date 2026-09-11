/**
 * Provider-neutral part of the GebzemAI agent: the options both clients take, the upstream error, the tool runner and
 * the answer-text rules. Pure module (no Next / Supabase imports) so it can be tested with a mocked fetch.
 * server-only: the options carry the API key.
 */
import "server-only";
import type { AiStreamEvent } from "../lib/types";
import type { AiModelConfig, AiUsageTotals } from "./models";

/**
 * API error texts can echo a masked key (OpenAI 401: "Incorrect API key provided: sk-proj-****abcd"). The route logs
 * the message, so anything key-like is cut out here, for both providers.
 */
export function redactSecrets(s: string): string {
  return s.replace(/\bsk-[A-Za-z0-9_*.\-]{3,}/g, "sk-[gizli]").replace(/\bBearer\s+\S+/gi, "Bearer [gizli]");
}

/** HTTP or stream error from a model API (status 0 = network). `type` is the API's error type / code (no user text). */
export class AiUpstreamError extends Error {
  readonly status: number;
  readonly type: string;
  constructor(status: number, type: string, message: string) {
    super(redactSecrets(message));
    this.name = "AiUpstreamError";
    this.status = status;
    this.type = type;
  }
}

/** A tool definition (JSON Schema input). Anthropic takes it as is; OpenAI wraps it as a function tool. */
export type AgentTool = { name: string; description: string; input_schema: Record<string, unknown> };

/** Conversation history as plain text (the route builds it; it starts with the user and alternates). */
export type AgentMessage = { role: "user" | "assistant"; content: string };

export type ToolRunResult = { content: string; isError?: boolean };

export type AgentRunOptions = {
  apiKey: string;
  model: AiModelConfig;
  system: string;
  messages: AgentMessage[];
  tools: AgentTool[];
  /** Runs one tool call (the caller emits status / cards). Throwing makes it an error result. */
  runTool: (name: string, input: Record<string, unknown>) => Promise<ToolRunResult>;
  emit: (ev: AiStreamEvent) => void;
  signal: AbortSignal;
  /** Filled while streaming, so usage is known after an error or abort. */
  usage: AiUsageTotals;
  maxTokens?: number;
  /** Tool rounds allowed; the request after the last round forbids tools. */
  maxToolRounds?: number;
  fetchImpl?: typeof fetch;
};

/** Stop names reported in the "done" event (Anthropic's names; the OpenAI client maps its finish_reason to them). */
export type AgentStop = "end_turn" | "max_tokens" | "tool_use" | "refusal" | (string & {});
export type AgentResult = { stop: AgentStop };

export const REFUSAL_TEXT = "Bu isteğe yardımcı olamıyorum. Kocaeli ile ilgili başka bir şey sorabilirsin.";
export const EMPTY_TEXT = "Şu an bir yanıt oluşturamadım. Soruyu biraz farklı sorabilir misin?";
const TOOL_FAILED = JSON.stringify({ hata: "Bu bilgiye şu an ulaşılamadı." });

export function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** Tool arguments from the model: a JSON object, or {} when it is not one. */
export function parseToolInput(json: string): Record<string, unknown> {
  try {
    return asRecord(JSON.parse(json || "{}"));
  } catch {
    return {};
  }
}

/** Runs the calls of one round in parallel; a throwing tool becomes an error result. */
export async function runToolCalls<C extends { name: string; input: Record<string, unknown> }>(
  o: Pick<AgentRunOptions, "runTool">,
  calls: C[],
): Promise<Array<{ call: C; result: ToolRunResult }>> {
  return Promise.all(
    calls.map(async (call) => {
      try {
        return { call, result: await o.runTool(call.name, call.input) };
      } catch {
        return { call, result: { content: TOOL_FAILED, isError: true } };
      }
    }),
  );
}

/**
 * Answer text sent to the client: text written before a tool round and the answer after it become separate
 * paragraphs; `finish` adds the fixed Turkish text for a refusal, a cut-off or an empty answer.
 */
export function createTextOutput(emit: (ev: AiStreamEvent) => void) {
  let emitted = false;
  let pendingBreak = false;
  const onText = (t: string) => {
    if (!t) return;
    if (pendingBreak && emitted) emit({ t: "text", d: "\n\n" });
    pendingBreak = false;
    emitted = true;
    emit({ t: "text", d: t });
  };
  return {
    onText,
    toolRoundDone: () => {
      pendingBreak = true;
    },
    finish: (stop: AgentStop) => {
      if (stop === "refusal" && !emitted) onText(REFUSAL_TEXT);
      else if (stop === "max_tokens" && emitted) onText("…");
      else if (!emitted) onText(EMPTY_TEXT);
    },
  };
}
