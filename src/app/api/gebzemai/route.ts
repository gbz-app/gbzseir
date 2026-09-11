import { after } from "next/server";
import { z } from "zod";
import { IS_ADMIN_SITE } from "@/config/app-mode";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { trNormalize } from "@/core/tr";
import {
  AI_HISTORY_ASSISTANT_CHARS,
  AI_HISTORY_LIMIT,
  AI_HISTORY_TOTAL_CHARS,
  AI_MAX_INPUT_CHARS,
  type AiErrorBody,
  type AiErrorCode,
  type AiStreamEvent,
} from "@/features/ai/lib/types";
import type { AiProvider } from "@/features/ai/lib/models";
import { AiUpstreamError, type AgentMessage } from "@/features/ai/server/agent";
import { getAiConfig, isAiAvailable, providerApiKey } from "@/features/ai/server/config";
import { costMicroUsd, emptyUsage, resolveAiModel, totalInputTokens } from "@/features/ai/server/models";
import { buildSystemPrompt } from "@/features/ai/server/prompt";
import { runProviderAgent } from "@/features/ai/server/provider";
import { callRpc } from "@/features/ai/server/rpc";
import { AI_TOOLS, runAiTool, toolStatusLabel } from "@/features/ai/server/tools";

/**
 * POST /api/gebzemai: one GebzemAI turn, streamed as newline-delimited JSON (AiStreamEvent per line).
 * Public app only, signed-in users only. Provider: app_settings ai_provider (OpenAI Chat Completions or Anthropic
 * Messages, both streamed; the events are the same). Limits and budget: ai_begin_turn (user session); usage:
 * ai_finish_turn (service role, server only). The conversation text is never stored or logged.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_CHARS = 48_000;
/** Whole turn (all model calls and tools); the function itself may run 60 s. */
const DEADLINE_MS = 50_000;
const MAX_TOKENS = 800;
const MAX_TOOL_ROUNDS = 4;

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(20_000) }))
    .min(1)
    .max(40),
});

type BeginResult = {
  ok: boolean;
  reason?: string | null;
  turn_id?: string;
  model?: string;
  remaining?: number;
  daily_limit?: number;
  reset_at?: string | null;
};

function errorJson(status: number, body: Omit<AiErrorBody, "ok">): Response {
  return Response.json({ ok: false, ...body } satisfies AiErrorBody, { status, headers: { "Cache-Control": "no-store" } });
}

/** Browsers always send Origin on a POST fetch: it must be this site (the session cookie must not be usable cross-site). */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const allowed = new Set<string>();
  for (const h of [request.headers.get("host"), request.headers.get("x-forwarded-host")]) if (h) allowed.add(h.split(",")[0].trim());
  try {
    allowed.add(new URL(request.url).host);
  } catch {
    /* ignore */
  }
  return allowed.has(host);
}

/** Last AI_HISTORY_LIMIT messages, trimmed and capped; same-role neighbours merged; starts with the user. */
function toApiMessages(items: Array<{ role: "user" | "assistant"; text: string }>): AgentMessage[] {
  const out: AgentMessage[] = [];
  for (const it of items.slice(-AI_HISTORY_LIMIT)) {
    const text = it.text.split(String.fromCharCode(0)).join("").trim();
    if (!text) continue;
    const clipped = text.slice(0, it.role === "user" ? AI_MAX_INPUT_CHARS : AI_HISTORY_ASSISTANT_CHARS);
    const last = out[out.length - 1];
    if (last && last.role === it.role) last.content = `${last.content}\n\n${clipped}`;
    else out.push({ role: it.role, content: clipped });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

/**
 * The history comes from the client, so its size is bounded here: per message (questions AI_MAX_INPUT_CHARS, answers
 * AI_HISTORY_ASSISTANT_CHARS, clipped in toApiMessages) and in total (AI_HISTORY_TOTAL_CHARS, newest kept; the
 * question itself always fits).
 */
function capHistory(items: Array<{ role: "user" | "assistant"; text: string }>): Array<{ role: "user" | "assistant"; text: string }> {
  const kept: Array<{ role: "user" | "assistant"; text: string }> = [];
  let total = 0;
  for (const it of items.slice(-AI_HISTORY_LIMIT).reverse()) {
    const len = Math.min(it.text.trim().length, it.role === "user" ? AI_MAX_INPUT_CHARS : AI_HISTORY_ASSISTANT_CHARS);
    if (kept.length && total + len > AI_HISTORY_TOTAL_CHARS) break;
    total += len;
    kept.push(it);
  }
  return kept.reverse();
}

const LIMIT_MESSAGES: Record<string, string> = {
  daily: "Bugünlük soru hakkın doldu.",
  minute: "Biraz hızlı gittin. Kısa bir süre sonra tekrar sorabilirsin.",
  budget: "GebzemAI bugün çok yoğun. Yarın tekrar dene.",
};

function upstreamFailure(e: unknown, deadline: AbortSignal, provider: AiProvider): { code: AiErrorCode; message: string } {
  if (deadline.aborted) return { code: "timeout", message: "Yanıt çok uzun sürdü. Tekrar dene." };
  if (e instanceof AiUpstreamError) {
    // API error texts describe the request, never the user's words; safe to log.
    console.error("[gebzemai] upstream", provider, e.status, e.type, e.message);
    if (e.status === 0) return { code: "network", message: "Bağlantı sorunu oldu. Tekrar dene." };
    if (e.status === 401 || e.status === 403) return { code: "not_active", message: "GebzemAI şu an yanıt veremiyor. Daha sonra tekrar dene." };
    if (e.status === 429 || e.status === 529 || e.status >= 500) return { code: "busy", message: "GebzemAI şu an çok yoğun. Birazdan tekrar dene." };
    return { code: "server", message: "Bir sorun oldu. Tekrar dene." };
  }
  console.error("[gebzemai] turn failed", provider, e instanceof Error ? e.name : typeof e);
  return { code: "server", message: "Bir sorun oldu. Tekrar dene." };
}

export async function POST(request: Request): Promise<Response> {
  // The admin site has no GebzemAI.
  if (IS_ADMIN_SITE) return errorJson(404, { code: "bad_request", message: "Bulunamadı." });
  if (!isSameOrigin(request)) return errorJson(403, { code: "forbidden", message: "İzin verilmedi." });
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return errorJson(415, { code: "bad_request", message: "Geçersiz istek." });
  }

  const raw = await request.text().catch(() => "");
  if (!raw || raw.length > MAX_BODY_CHARS) return errorJson(413, { code: "too_long", message: "Mesaj çok uzun." });
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return errorJson(400, { code: "bad_request", message: "Geçersiz istek." });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return errorJson(400, { code: "bad_request", message: "Geçersiz istek." });
  const items = parsed.data.messages;
  const lastItem = items[items.length - 1];
  if (lastItem.role !== "user" || !lastItem.text.trim()) return errorJson(400, { code: "bad_request", message: "Bir soru yaz." });
  if (lastItem.text.trim().length > AI_MAX_INPUT_CHARS) {
    return errorJson(400, { code: "too_long", message: `Soru en fazla ${AI_MAX_INPUT_CHARS} karakter olabilir.` });
  }
  const messages = toApiMessages(capHistory(items));
  if (!messages.length) return errorJson(400, { code: "bad_request", message: "Bir soru yaz." });

  const config = await getAiConfig();
  const provider = config.provider;
  const apiKey = providerApiKey(provider);
  if (!isAiAvailable(config) || !apiKey) {
    return errorJson(503, { code: "not_active", message: "GebzemAI henüz aktif değil. Şimdilik aramayı kullanabilirsin." });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return errorJson(401, { code: "auth", message: "GebzemAI'yi kullanmak için giriş yap." });

  const begin = await callRpc<BeginResult>(supabase, "ai_begin_turn");
  if (begin.error || !begin.data) {
    console.error("[gebzemai] ai_begin_turn failed", begin.error?.code, begin.error?.message);
    return errorJson(500, { code: "server", message: "Şu an başlatılamadı. Tekrar dene." });
  }
  const b = begin.data;
  if (!b.ok || !b.turn_id) {
    const reason = b.reason ?? "server";
    if (reason === "auth") return errorJson(401, { code: "auth", message: "GebzemAI'yi kullanmak için giriş yap." });
    if (reason === "disabled") return errorJson(503, { code: "not_active", message: "GebzemAI henüz aktif değil. Şimdilik aramayı kullanabilirsin." });
    if (reason === "banned") return errorJson(403, { code: "banned", message: "Hesabın kısıtlı olduğu için GebzemAI'yi kullanamazsın." });
    if (reason === "daily" || reason === "minute" || reason === "budget") {
      return errorJson(429, { code: reason, message: LIMIT_MESSAGES[reason], resetAt: b.reset_at ?? null, dailyLimit: b.daily_limit });
    }
    return errorJson(500, { code: "server", message: "Şu an başlatılamadı. Tekrar dene." });
  }

  const turnId = b.turn_id;
  // The DB names the model at begin; a model of the other provider (switched a moment ago) falls back to this one's default.
  const model = resolveAiModel(b.model ?? config.model, provider);
  const usage = emptyUsage();
  const userAbort = new AbortController();
  const deadline = AbortSignal.timeout(DEADLINE_MS);
  const signal = AbortSignal.any([userAbort.signal, deadline]);
  const onClientGone = () => userAbort.abort();
  request.signal?.addEventListener("abort", onClientGone, { once: true });
  const encoder = new TextEncoder();

  let finished: Promise<void> = Promise.resolve();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const send = (ev: AiStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(ev)}\n`));
        } catch {
          open = false;
        }
      };
      finished = (async () => {
        let status: "done" | "error" | "aborted" = "done";
        try {
          send({ t: "start", remaining: b.remaining ?? 0, dailyLimit: b.daily_limit ?? 0 });
          // The answer text lives only in this function's memory (for the notice check below); never stored or logged.
          let answer = "";
          /** Required sentences from the tools: text -> keyword the answer must mention. */
          const notices = new Map<string, string>();
          const result = await runProviderAgent(provider, {
            apiKey,
            model,
            system: buildSystemPrompt(),
            messages,
            tools: AI_TOOLS,
            maxTokens: MAX_TOKENS,
            maxToolRounds: MAX_TOOL_ROUNDS,
            signal,
            usage,
            emit: (ev) => {
              if (ev.t === "text") answer += ev.d;
              send(ev);
            },
            runTool: async (name, input) => {
              send({ t: "status", label: toolStatusLabel(name) });
              const out = await runAiTool(name, input);
              if (out.cards.length) send({ t: "cards", items: out.cards });
              if (out.notice) notices.set(out.notice.text, out.notice.keyword);
              return { content: out.content, isError: out.isError };
            },
          });
          // E.g. demo duty data: the answer must say it is sample data even when the model did not.
          for (const [text, keyword] of notices) {
            if (!trNormalize(answer).includes(keyword)) send({ t: "text", d: `\n\n${text}` });
          }
          send({ t: "done", stop: result.stop });
        } catch (e) {
          if (userAbort.signal.aborted && !deadline.aborted) {
            status = "aborted";
          } else {
            status = "error";
            send({ t: "error", ...upstreamFailure(e, deadline, provider) });
          }
        } finally {
          request.signal?.removeEventListener("abort", onClientGone);
          try {
            const { error } = await callRpc<boolean>(createAdminClient(), "ai_finish_turn", {
              p_turn: turnId,
              p_input: totalInputTokens(usage),
              p_output: usage.output,
              p_cost_micro_usd: costMicroUsd(usage, model),
              p_model: model.id,
              p_status: status,
              p_tool_calls: usage.toolCalls,
            });
            if (error) console.error("[gebzemai] ai_finish_turn failed", error.code, error.message);
          } catch (e) {
            console.error("[gebzemai] ai_finish_turn threw", e instanceof Error ? e.message : typeof e);
          }
          if (open) {
            open = false;
            try {
              controller.close();
            } catch {
              /* already closed */
            }
          }
        }
      })();
    },
    cancel() {
      userAbort.abort();
    },
  });

  // Keep the function alive until the usage is recorded, even when the client leaves early.
  after(() => finished);

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
