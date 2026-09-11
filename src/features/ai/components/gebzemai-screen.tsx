"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUp, Clock, LogIn, RotateCcw, Search, Square, SquarePen, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BottomDock } from "@/components/shared/bottom-dock";
import { PageHeader } from "@/components/shared/page-header";
import { routes } from "@/core/routes";
import { formatDayLabel, formatTime } from "@/core/format";
import { notify } from "@/lib/notify";
import { readJSON, removeItem, writeJSON } from "@/lib/storage";
import { useIsClient } from "@/lib/use-is-client";
import { AiCardList } from "./ai-cards";
import { AiAvatar, AiIntroArt } from "./ai-intro";
import { AiPrivacyText } from "./ai-privacy";
import {
  AI_COUNTER_FROM,
  AI_EXAMPLES,
  AI_HISTORY_ASSISTANT_CHARS,
  AI_HISTORY_LIMIT,
  AI_MAX_CARDS,
  AI_MAX_INPUT_CHARS,
  type AiCard,
  type AiErrorBody,
  type AiHistoryItem,
  type AiLimitReason,
  type AiStreamEvent,
} from "../lib/types";

export type GebzemAiMode = "inactive" | "guest" | "chat";
export type AiLimitState = { reason: AiLimitReason; resetAt: string | null };

type UserMsg = { id: string; role: "user"; text: string };
type AssistantMsg = {
  id: string;
  role: "assistant";
  text: string;
  cards: AiCard[];
  state: "streaming" | "done" | "stopped" | "error";
  status?: string;
  error?: string;
};
type ChatMsg = UserMsg | AssistantMsg;

/** Chat of this tab (sessionStorage: survives opening a card and coming back, gone when the tab closes). */
const STORAGE_KEY = "gebzemai:chat:v1";
const MAX_STORED = 30;
const TEXTAREA_MAX_PX = 144;
const PRIVACY = <AiPrivacyText />;
const BLACK_CTA = "bg-foreground text-background shadow-none hover:bg-foreground/90";

function Title() {
  return (
    <span className="inline-flex items-center gap-2">
      GebzemAI
      <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[11px] leading-none font-bold tracking-wide text-primary">Beta</span>
    </span>
  );
}

let idSeq = 0;
const newId = () => `m${Date.now().toString(36)}${(idSeq++).toString(36)}`;

const safeHref = (h: unknown): h is string => typeof h === "string" && (/^\/(?!\/)/.test(h) || /^https:\/\//i.test(h));

function mergeCards(prev: AiCard[], next: AiCard[]): AiCard[] {
  const seen = new Set(prev.map((c) => c.id));
  const out = [...prev];
  for (const c of next) {
    if (out.length >= AI_MAX_CARDS) break;
    if (!c || seen.has(c.id) || !safeHref(c.href) || typeof c.title !== "string") continue;
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

function loadStored(): ChatMsg[] {
  const raw = readJSON<{ v?: number; messages?: unknown }>(STORAGE_KEY, {}, "session");
  if (raw.v !== 1 || !Array.isArray(raw.messages)) return [];
  const out: ChatMsg[] = [];
  for (const m of raw.messages as Array<Record<string, unknown>>) {
    if (!m || typeof m.id !== "string" || typeof m.text !== "string") continue;
    if (m.role === "user") out.push({ id: m.id, role: "user", text: m.text.slice(0, AI_MAX_INPUT_CHARS) });
    else if (m.role === "assistant") {
      const state = m.state === "done" || m.state === "stopped" || m.state === "error" ? m.state : "stopped";
      out.push({
        id: m.id,
        role: "assistant",
        text: m.text.slice(0, 8000),
        cards: mergeCards([], Array.isArray(m.cards) ? (m.cards as AiCard[]) : []),
        state,
        error: state === "error" && typeof m.error === "string" ? m.error : undefined,
      });
    }
  }
  return out.slice(-MAX_STORED);
}

/** History for the route: user texts and finished assistant texts, last AI_HISTORY_LIMIT. */
function buildHistory(conversation: ChatMsg[]): AiHistoryItem[] {
  const items: AiHistoryItem[] = [];
  for (const m of conversation) {
    if (m.role === "user") items.push({ role: "user", text: m.text });
    else if ((m.state === "done" || m.state === "stopped") && m.text.trim()) items.push({ role: "assistant", text: m.text.slice(0, AI_HISTORY_ASSISTANT_CHARS) });
  }
  return items.slice(-AI_HISTORY_LIMIT);
}

/** Model text as plain text (no markdown emphasis or headings). */
function plain(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1").replace(/^#{1,6}\s+/gm, "");
}

const isLimitReason = (v: unknown): v is AiLimitReason => v === "daily" || v === "minute" || v === "budget";

// ---------------------------------------------------------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------------------------------------------------------
export function GebzemAiScreen({
  mode,
  initialLimit = null,
  initialRemaining = null,
}: {
  mode: GebzemAiMode;
  initialLimit?: AiLimitState | null;
  initialRemaining?: number | null;
}) {
  const [current, setCurrent] = React.useState<GebzemAiMode>(mode);
  if (current === "inactive") return <InactiveView />;
  if (current === "guest") return <GuestView />;
  return <ChatGate initialLimit={initialLimit} initialRemaining={initialRemaining} onInactive={() => setCurrent("inactive")} />;
}

function Hero({ title, text }: { title: string; text: string }) {
  return (
    <>
      <AiIntroArt />
      <h2 className="mt-5 text-xl font-bold text-balance">{title}</h2>
      <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-balance text-muted-foreground">{text}</p>
    </>
  );
}

function ExampleLinks({ hrefFor }: { hrefFor: (e: (typeof AI_EXAMPLES)[number]) => string }) {
  return (
    <ul className="mt-3 flex flex-wrap justify-center gap-2">
      {AI_EXAMPLES.map((e) => (
        <li key={e.text}>
          <Link
            href={hrefFor(e)}
            className="inline-flex min-h-11 items-center rounded-full bg-card px-4 text-sm font-medium outline-none transition-colors active:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {e.text}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** Key missing or switched off: calm state, examples lead to the matching app pages, main action is search. */
function InactiveView() {
  return (
    <>
      <PageHeader title={<Title />} backHref={routes.home()} />
      <div className="flex flex-1 flex-col items-center px-4 pt-8 pb-10 text-center">
        <Hero title="GebzemAI henüz aktif değil" text="Yakında buradan Gebze hakkında soru sorabileceksin. Şimdilik aradığını arama ve sayfalarımızda bulabilirsin." />
        <Button asChild className={cn("mt-5", BLACK_CTA)}>
          <Link href={routes.search()}>
            <Search aria-hidden /> Aramaya git
          </Link>
        </Button>
        <p className="mt-8 text-xs font-semibold text-muted-foreground">Şunlara göz atabilirsin</p>
        <ExampleLinks hrefFor={(e) => e.href} />
      </div>
    </>
  );
}

function GuestView() {
  const login = routes.auth.login(routes.ai());
  return (
    <>
      <PageHeader title={<Title />} backHref={routes.home()} />
      <div className="flex flex-1 flex-col items-center px-4 pt-8 pb-10 text-center">
        <Hero title="Merhaba, ben GebzemAI" text="Gebze'de nöbetçi eczane, açık mekan, etkinlik ve daha fazlasını sor; cevabı uygulamadaki bilgilerden hazırlarım." />
        <Button asChild className={cn("mt-5", BLACK_CTA)}>
          <Link href={login}>
            <LogIn aria-hidden /> Giriş yap ve sor
          </Link>
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">Soru sormak için giriş yapman yeterli.</p>
        <p className="mt-8 text-xs font-semibold text-muted-foreground">Örneğin</p>
        <ExampleLinks hrefFor={() => login} />
      </div>
    </>
  );
}

/** The chat reads sessionStorage, so it mounts only on the client (no hydration mismatch). */
function ChatGate(props: { initialLimit: AiLimitState | null; initialRemaining: number | null; onInactive: () => void }) {
  const isClient = useIsClient();
  if (!isClient) {
    return (
      <>
        <PageHeader title={<Title />} backHref={routes.home()} />
        <div className="flex-1" />
        <BottomDock inFlow className="sticky bottom-0 z-30">
          <div className="h-[52px] rounded-[1.75rem] bg-card" />
          <p className="mt-2 text-center text-[11px] leading-snug text-muted-foreground">{PRIVACY}</p>
        </BottomDock>
      </>
    );
  }
  return <Chat {...props} />;
}

// ---------------------------------------------------------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------------------------------------------------------
function Chat({ initialLimit, initialRemaining, onInactive }: { initialLimit: AiLimitState | null; initialRemaining: number | null; onInactive: () => void }) {
  const [messages, setMessages] = React.useState<ChatMsg[]>(loadStored);
  const [input, setInput] = React.useState("");
  const [streaming, setStreaming] = React.useState(false);
  const [limit, setLimit] = React.useState<AiLimitState | null>(initialLimit);
  const [remaining, setRemaining] = React.useState<number | null>(initialRemaining);
  const [needsLogin, setNeedsLogin] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");
  const abortRef = React.useRef<AbortController | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const stickRef = React.useRef(true);

  // Keep the chat of this tab (not while an answer is still streaming).
  React.useEffect(() => {
    if (streaming) return;
    if (messages.length) writeJSON(STORAGE_KEY, { v: 1, messages: messages.slice(-MAX_STORED) }, "session");
    else removeItem(STORAGE_KEY, "session");
  }, [messages, streaming]);

  // Follow the answer while the reader is at the bottom.
  React.useEffect(() => {
    const onScroll = () => {
      stickRef.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  React.useEffect(() => {
    if (stickRef.current) window.scrollTo({ top: document.documentElement.scrollHeight });
  }, [messages]);

  // Leaving the page stops the answer.
  React.useEffect(() => () => abortRef.current?.abort(), []);

  // A limit ends by itself at its reset time.
  React.useEffect(() => {
    if (!limit?.resetAt) return;
    const ms = Date.parse(limit.resetAt) - Date.now();
    if (!Number.isFinite(ms) || ms > 86_400_000) return;
    const id = window.setTimeout(() => setLimit(null), Math.max(0, ms) + 1000);
    return () => window.clearTimeout(id);
  }, [limit]);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`;
  };

  const ask = async (conversation: ChatMsg[], opts: { userId?: string; question?: string } = {}) => {
    const assistantId = newId();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setMessages((ms) => [...ms, { id: assistantId, role: "assistant", text: "", cards: [], state: "streaming" }]);
    setStreaming(true);
    setAnnounce("GebzemAI yanıtlıyor");
    const patch = (fn: (m: AssistantMsg) => AssistantMsg) =>
      setMessages((ms) => ms.map((m) => (m.id === assistantId && m.role === "assistant" ? fn(m) : m)));
    // Nothing was answered (limit, sign-in, bad input): take the question back into the composer.
    const takeBack = () => {
      setMessages((ms) => ms.filter((m) => m.id !== assistantId && m.id !== opts.userId));
      if (opts.userId && opts.question) {
        setInput(opts.question);
        window.requestAnimationFrame(resizeTextarea);
      }
    };

    let finished = false;
    let answer = "";
    try {
      const res = await fetch("/api/gebzemai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: buildHistory(conversation) }),
        signal: ctrl.signal,
        cache: "no-store",
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as AiErrorBody | null;
        finished = true;
        if (res.status === 429 && body && isLimitReason(body.code)) {
          takeBack();
          setLimit({ reason: body.code, resetAt: body.resetAt ?? null });
          if (body.code === "daily") setRemaining(0);
        } else if (res.status === 401) {
          takeBack();
          setNeedsLogin(true);
        } else if (res.status === 503) {
          takeBack();
          onInactive();
        } else if (res.status === 400 || res.status === 403 || res.status === 413) {
          takeBack();
          notify.warning(body?.message ?? "Bu soru gönderilemedi.");
        } else {
          patch((m) => ({ ...m, state: "error", status: undefined, error: body?.message ?? "Bir sorun oldu. Tekrar dene." }));
        }
        setAnnounce("");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let parsed: AiStreamEvent;
          try {
            parsed = JSON.parse(line) as AiStreamEvent;
          } catch {
            continue;
          }
          const ev = parsed;
          if (ev.t === "start") setRemaining(ev.remaining);
          else if (ev.t === "status") patch((m) => ({ ...m, status: ev.label }));
          else if (ev.t === "text") {
            answer += ev.d;
            patch((m) => ({ ...m, text: m.text + ev.d, status: undefined }));
          } else if (ev.t === "cards") patch((m) => ({ ...m, cards: mergeCards(m.cards, ev.items) }));
          else if (ev.t === "done") {
            finished = true;
            patch((m) => ({ ...m, state: "done", status: undefined }));
          } else if (ev.t === "error") {
            finished = true;
            patch((m) => ({ ...m, state: "error", status: undefined, error: ev.message }));
          }
        }
      }
      if (!finished) patch((m) => ({ ...m, state: "error", status: undefined, error: "Bağlantı koptu. Tekrar dene." }));
      setAnnounce(answer ? `GebzemAI: ${plain(answer)}` : "");
    } catch {
      if (ctrl.signal.aborted) patch((m) => ({ ...m, state: m.text ? "stopped" : "error", status: undefined, error: m.text ? undefined : "Durduruldu." }));
      else patch((m) => ({ ...m, state: "error", status: undefined, error: "Bağlantı sorunu oldu. Tekrar dene." }));
      setAnnounce("");
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
      setStreaming(false);
    }
  };

  const blocked = !!limit || needsLogin;

  const send = (raw: string) => {
    const text = raw.trim();
    if (!text || streaming || blocked) return;
    if (text.length > AI_MAX_INPUT_CHARS) {
      notify.warning("Soru çok uzun", `En fazla ${AI_MAX_INPUT_CHARS} karakter yazabilirsin.`);
      return;
    }
    const user: UserMsg = { id: newId(), role: "user", text };
    const conversation = [...messages, user];
    setMessages(conversation);
    setInput("");
    window.requestAnimationFrame(resizeTextarea);
    stickRef.current = true;
    void ask(conversation, { userId: user.id, question: text });
  };

  const retry = (assistantId: string) => {
    if (streaming || blocked) return;
    const index = messages.findIndex((m) => m.id === assistantId);
    if (index < 0) return;
    const conversation = messages.slice(0, index);
    if (conversation[conversation.length - 1]?.role !== "user") return;
    setMessages(conversation);
    stickRef.current = true;
    void ask(conversation);
  };

  const stop = () => abortRef.current?.abort();

  const newChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setAnnounce("");
    removeItem(STORAGE_KEY, "session");
    window.requestAnimationFrame(() => {
      resizeTextarea();
      textareaRef.current?.focus();
    });
  };

  const count = input.length;
  const canSend = !!input.trim() && !streaming && !blocked;

  return (
    <>
      <PageHeader
        title={<Title />}
        backHref={routes.home()}
        actions={
          messages.length ? (
            <Button type="button" variant="ghost" size="sm" onClick={newChat}>
              <SquarePen aria-hidden /> Yeni sohbet
            </Button>
          ) : null
        }
      />

      {/* Not a live region: streamed deltas would be read piece by piece. The finished answer is announced once below. */}
      <div role="region" aria-label="GebzemAI sohbeti" aria-busy={streaming} className="flex flex-1 flex-col gap-4 px-4 pt-4 pb-4">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
            <Hero title="Merhaba, ben GebzemAI" text="Gebze'de nöbetçi eczane, açık mekan, etkinlik ve daha fazlasını sor. Cevaplarım uygulamadaki bilgilerden gelir." />
            <ul className="mt-5 flex flex-wrap justify-center gap-2" aria-label="Örnek sorular">
              {AI_EXAMPLES.map((e) => (
                <li key={e.text}>
                  <button
                    type="button"
                    disabled={blocked}
                    onClick={() => send(e.text)}
                    className="inline-flex min-h-11 items-center rounded-full bg-card px-4 text-sm font-medium outline-none transition-colors active:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
                  >
                    {e.text}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-3xl rounded-br-lg bg-foreground px-4 py-2.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap text-background">
                  <span className="sr-only">Sen: </span>
                  {m.text}
                </p>
              </div>
            ) : (
              <AssistantMessage key={m.id} m={m} onRetry={() => retry(m.id)} retryDisabled={streaming || blocked} />
            ),
          )
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      {/* Shared dock kept in flow and stuck to the bottom: solid bg-background, no blur or line. */}
      <BottomDock inFlow className="sticky bottom-0 z-30">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          {limit ? <LimitNotice limit={limit} /> : null}
          {needsLogin ? (
            <div role="status" className="mb-2 flex items-center gap-3 rounded-2xl bg-card p-3">
              <LogIn className="size-5 shrink-0 text-primary" aria-hidden />
              <p className="min-w-0 flex-1 text-sm">Oturumun kapanmış görünüyor.</p>
              <Button asChild size="sm" className={BLACK_CTA}>
                <Link href={routes.auth.login(routes.ai())}>Giriş yap</Link>
              </Button>
            </div>
          ) : null}
          {!limit && remaining !== null && remaining <= 5 ? (
            <p className="mb-1.5 text-center text-xs text-muted-foreground">{remaining > 0 ? `Bugün ${remaining} soru hakkın kaldı` : "Bugünlük son sorunu sordun"}</p>
          ) : null}
          <div className="flex items-end gap-2 rounded-[1.75rem] bg-card p-1.5 pl-4 has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-ring/40">
            <label htmlFor="gebzemai-input" className="sr-only">
              GebzemAI&apos;ye sor
            </label>
            <textarea
              id="gebzemai-input"
              ref={textareaRef}
              rows={1}
              value={input}
              maxLength={AI_MAX_INPUT_CHARS}
              disabled={blocked}
              placeholder={blocked ? "Şu an soru gönderilemiyor" : "Gebze hakkında bir şey sor"}
              enterKeyHint="send"
              aria-describedby={count >= AI_COUNTER_FROM ? "gebzemai-count" : undefined}
              onChange={(e) => {
                setInput(e.target.value);
                resizeTextarea();
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape" && streaming) {
                  e.preventDefault();
                  stop();
                  return;
                }
                if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
                // Phones: the return key adds a line; the send button sends.
                const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
                if (touch) return;
                e.preventDefault();
                send(input);
              }}
              className="max-h-36 min-h-10 min-w-0 flex-1 resize-none bg-transparent py-2 text-base leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
            />
            {streaming ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Yanıtı durdur"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Square className="size-3.5 fill-current" aria-hidden />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                aria-label="Gönder"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background outline-none transition-opacity focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-30"
              >
                <ArrowUp className="size-5" strokeWidth={2.4} aria-hidden />
              </button>
            )}
          </div>
          {count >= AI_COUNTER_FROM ? (
            // Not live (it would be read on every keystroke); the textarea points to it with aria-describedby.
            <p id="gebzemai-count" className={cn("mt-1 pr-2 text-right text-xs tabular-nums", count >= AI_MAX_INPUT_CHARS ? "font-semibold text-destructive" : "text-muted-foreground")}>
              {count}/{AI_MAX_INPUT_CHARS}
              <span className="sr-only"> karakter</span>
            </p>
          ) : null}
          <p className="mt-2 text-center text-[11px] leading-snug text-muted-foreground">{PRIVACY}</p>
        </form>
      </BottomDock>
    </>
  );
}

function AssistantMessage({ m, onRetry, retryDisabled }: { m: AssistantMsg; onRetry: () => void; retryDisabled: boolean }) {
  const waiting = m.state === "streaming" && !m.text;
  return (
    <div className="flex items-start gap-2">
      <AiAvatar className="mt-1" />
      <div className="min-w-0 flex-1">
        <span className="sr-only">GebzemAI: </span>
        {m.text ? <div className="rounded-3xl rounded-tl-lg bg-card px-4 py-3 text-[15px] leading-relaxed break-words whitespace-pre-wrap">{plain(m.text)}</div> : null}
        {waiting ? (
          <div className="inline-flex items-center gap-2.5 rounded-3xl rounded-tl-lg bg-card px-4 py-3">
            <span className="flex gap-1" aria-hidden>
              <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.3s] motion-reduce:animate-none" />
              <span className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.15s] motion-reduce:animate-none" />
              <span className="size-1.5 animate-bounce rounded-full bg-primary motion-reduce:animate-none" />
            </span>
            <span className="text-sm text-muted-foreground">{m.status ? `${m.status}…` : "Düşünüyorum…"}</span>
          </div>
        ) : m.state === "streaming" && m.status ? (
          <p className="mt-1.5 pl-1 text-xs text-muted-foreground">{m.status}…</p>
        ) : null}
        <AiCardList cards={m.cards} className="mt-2" />
        {m.state === "stopped" ? <p className="mt-1.5 pl-1 text-xs text-muted-foreground">Durduruldu</p> : null}
        {m.state === "error" ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-card p-3">
            <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden />
            <p className="min-w-0 flex-1 text-sm">{m.error ?? "Bir sorun oldu."}</p>
            <Button type="button" size="sm" variant="secondary" onClick={onRetry} disabled={retryDisabled} className="shadow-none">
              <RotateCcw aria-hidden /> Tekrar dene
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function LimitNotice({ limit }: { limit: AiLimitState }) {
  const reset = limit.resetAt ? `${formatDayLabel(limit.resetAt)} ${formatTime(limit.resetAt)}` : null;
  const copy: Record<AiLimitReason, { title: string; body: string }> = {
    daily: { title: "Bugünlük soru hakkın doldu", body: reset ? `Yeni hakların: ${reset}.` : "Yarın yeniden sorabilirsin." },
    minute: { title: "Biraz hızlı gittin", body: "Kısa bir mola; birkaç saniye sonra yeniden sorabilirsin." },
    budget: { title: "GebzemAI bugünlük dinlenmede", body: reset ? `Bugün çok soru geldi. Yenilenme: ${reset}.` : "Bugün çok soru geldi. Yarın yeniden buradayım." },
  };
  const c = copy[limit.reason];
  return (
    <div role="status" className="mb-2 flex items-start gap-3 rounded-2xl bg-card p-3">
      <Clock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 text-left">
        <p className="text-sm font-semibold">{c.title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {c.body} Bu arada{" "}
          <Link href={routes.search()} className="font-semibold text-primary underline-offset-2 hover:underline">
            aramayı
          </Link>{" "}
          kullanabilirsin.
        </p>
      </div>
    </div>
  );
}
