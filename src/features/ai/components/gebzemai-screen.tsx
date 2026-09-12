"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowUp, Clock, Info, LogIn, MessageCirclePlus, Plus, RotateCcw, Square, TrendingUp, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BottomDock } from "@/components/shared/bottom-dock";
import { routes } from "@/core/routes";
import { formatDayLabel, formatTime } from "@/core/format";
import { nameWords } from "@/core/name";
import { useAuth } from "@/lib/auth/auth-provider";
import { ACCEPTED_IMAGE_TYPES, processImage } from "@/lib/images";
import { canGoBack } from "@/lib/navigation-history";
import { notify } from "@/lib/notify";
import { readJSON, removeItem, writeJSON } from "@/lib/storage";
import { useIsClient } from "@/lib/use-is-client";
import { AiCardList } from "./ai-cards";
import { AiAvatar } from "./ai-intro";
import { AiPrivacyText } from "./ai-privacy";
import {
  AI_COUNTER_FROM,
  AI_HISTORY_ASSISTANT_CHARS,
  AI_HISTORY_LIMIT,
  AI_IMAGE_DATA_URL,
  AI_MAX_CARDS,
  AI_MAX_IMAGE_CHARS,
  AI_MAX_INPUT_CHARS,
  type AiCard,
  type AiErrorBody,
  type AiHistoryItem,
  type AiLimitReason,
  type AiStreamEvent,
} from "../lib/types";

export type GebzemAiMode = "inactive" | "guest" | "chat";
export type AiLimitState = { reason: AiLimitReason; resetAt: string | null };

/** A photo picked for the question: the sent image and a small preview, both data URLs (memory only). */
type PickedImage = { dataUrl: string; thumbUrl: string };
type UserMsg = { id: string; role: "user"; text: string; image?: PickedImage };
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

/** Chat of this tab (sessionStorage: survives opening a card and coming back, gone when the tab closes). Photos are not kept. */
const STORAGE_KEY = "gebzemai:chat:v1";
/** A guest's question, kept for the chat after sign-in (this tab only). */
const DRAFT_KEY = "gebzemai:draft";
const MAX_STORED = 30;
const TEXTAREA_MAX_PX = 144;
/** Sent with a photo when nothing is typed. */
const PHOTO_ONLY_QUESTION = "Bu fotoğrafla ilgili yardımcı olur musun?";
const PLACEHOLDER = "GebzemAI'a sorun";
const PRIVACY = <AiPrivacyText />;
const BLACK_CTA = "bg-foreground text-background shadow-none hover:bg-foreground/90";
/** The white composer card. */
const COMPOSER_CARD = "rounded-[1.75rem] bg-card px-3 pt-3 pb-3 [&_textarea]:px-1";
const SEND_BUTTON = "flex size-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Typed one after another under the greeting: five short example questions (owner, 12.09), each with a page to open. */
type Suggestion = { text: string; href: string };
const SUGGESTIONS: readonly Suggestion[] = [
  { text: "Gebze'de en iyi kebapçı", href: routes.search("kebap") },
  { text: "Şu an açık nöbetçi eczane", href: routes.nearby.dutyPharmacies() },
  { text: "Bu hafta sonu etkinlikler", href: routes.events.root() },
  { text: "En yakın taksi durağı", href: routes.nearby.root("taksi") },
  { text: "Gebze'de kahvaltı mekânları", href: routes.search("kahvaltı") },
];

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

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Fotoğraf okunamadı."));
    reader.readAsDataURL(blob);
  });
}

// ---------------------------------------------------------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------------------------------------------------------

/**
 * Back, centred title, "new chat" (a bubble with a plus) always on the right. See-through over the page background until
 * the chat starts (`solid`); then a plain bg-background band (no line) so the messages scrolling underneath are cut off.
 */
function AiHeader({ onNewChat, solid = false }: { onNewChat?: () => void; solid?: boolean }) {
  const router = useRouter();
  const goBack = () => (canGoBack() ? router.back() : router.push(routes.home()));
  return (
    <header className={cn("sticky top-0 z-40 pt-safe", solid ? "bg-background" : "bg-transparent")}>
      <div className="grid h-(--topbar-h) grid-cols-[2.75rem_1fr_2.75rem] items-center gap-1 px-2">
        {/* Bare icons, no circle behind them. */}
        <Button variant="ghost" size="icon" className="rounded-full hover:bg-transparent active:opacity-60" onClick={goBack} aria-label="Geri">
          <ArrowLeft className="size-6" strokeWidth={2.6} />
        </Button>
        <h1 className="truncate text-center text-xl leading-tight font-bold">GebzemAI</h1>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full hover:bg-transparent active:opacity-60"
          onClick={onNewChat}
          disabled={!onNewChat}
          aria-label="Yeni sohbet"
        >
          <MessageCirclePlus className="size-6" strokeWidth={2.2} />
        </Button>
      </div>
    </header>
  );
}

/** Soft purple light rising from the bottom of the screen, behind the composer. Decorative. */
function AiGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-[55dvh] bg-[radial-gradient(130%_75%_at_50%_100%,color-mix(in_oklab,var(--primary)_24%,transparent),transparent_72%)]"
    />
  );
}

function Welcome({ name, children }: { name?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 py-10 text-center">
      <h2 className="max-w-[20rem] text-[28px] leading-[1.2] font-bold tracking-tight text-balance">
        {name ? `${name}, sana hangi konuda yardımcı olabilirim?` : "Sana hangi konuda yardımcı olabilirim?"}
      </h2>
      {children}
    </div>
  );
}

/** Types a suggestion, holds it, deletes it and types the next one. Reduced motion: whole suggestions in turn. */
function useTypewriter(items: readonly { text: string }[]): { index: number; shown: string } {
  const [state, setState] = React.useState({ index: 0, len: 0, deleting: false });
  React.useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const full = items[state.index].text;
    const following = (state.index + 1) % items.length;
    let next = state;
    let delay: number;
    if (reduced) {
      if (state.len < full.length) [next, delay] = [{ ...state, len: full.length }, 0];
      else [next, delay] = [{ index: following, len: items[following].text.length, deleting: false }, 3500];
    } else if (!state.deleting) {
      if (state.len < full.length) [next, delay] = [{ ...state, len: state.len + 1 }, 55];
      else [next, delay] = [{ ...state, deleting: true }, 1800];
    } else if (state.len > 0) [next, delay] = [{ ...state, len: state.len - 1 }, 28];
    else [next, delay] = [{ index: following, len: 0, deleting: false }, 400];
    const id = window.setTimeout(() => setState(next), delay);
    return () => window.clearTimeout(id);
  }, [state, items]);
  return { index: state.index, shown: items[state.index].text.slice(0, state.len) };
}

/** The typed suggestion: sends it in the chat, or opens `hrefFor` (sign-in, the matching page) in the other modes. */
function TypedSuggestion({ onPick, hrefFor }: { onPick?: (text: string) => void; hrefFor?: (s: Suggestion) => string }) {
  const { index, shown } = useTypewriter(SUGGESTIONS);
  const s = SUGGESTIONS[index];
  const cls =
    "inline-flex min-h-11 max-w-full items-center gap-2 rounded-full px-3 text-[17px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50";
  const label = `Örnek soru: ${s.text}`;
  const inner = (
    <>
      <TrendingUp className="size-5 shrink-0" strokeWidth={2} aria-hidden />
      <span className="truncate" aria-hidden>
        {shown}
      </span>
      <span className="-ml-1.5 h-6 w-[1.5px] shrink-0 animate-pulse bg-current motion-reduce:hidden" aria-hidden />
    </>
  );
  if (hrefFor) {
    return (
      <Link href={hrefFor(s)} aria-label={label} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" disabled={!onPick} onClick={() => onPick?.(s.text)} aria-label={label} className={cn(cls, "disabled:opacity-50")}>
      {inner}
    </button>
  );
}

/** "Bu sohbet kaydedilmiyor." above the composer; a tap shows where the messages go (provider line). */
function PrivacyNote() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="mb-2 px-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-full text-[13px] text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Info className="size-4 shrink-0" aria-hidden /> Bu sohbet kaydedilmiyor.
      </button>
      {open ? <p className="pb-1 pl-[1.375rem] text-xs leading-snug text-muted-foreground">{PRIVACY}</p> : null}
    </div>
  );
}

type ComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** "+": adds a photo in the chat (sign-in / a notice in the other modes). */
  onPlus: () => void;
  canSend: boolean;
  disabled?: boolean;
  placeholder?: string;
  streaming?: boolean;
  onStop?: () => void;
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** Picked photo, shown above the text. */
  preview?: React.ReactNode;
  describedBy?: string;
};

/**
 * White card: the question (grows up to TEXTAREA_MAX_PX), then two 40 px circles the same distance from the card's
 * edges: "+" on grey on the left, black send / stop on the right.
 */
function Composer({ value, onChange, onSubmit, onPlus, canSend, disabled, placeholder = PLACEHOLDER, streaming, onStop, inputRef, preview, describedBy }: ComposerProps) {
  const ownRef = React.useRef<HTMLTextAreaElement>(null);
  const ref = inputRef ?? ownRef;
  // Also when the value is set from outside (a question taken back into the composer).
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, TEXTAREA_MAX_PX)}px`;
  }, [value, ref]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className={cn(COMPOSER_CARD, "has-[textarea:focus-visible]:ring-2 has-[textarea:focus-visible]:ring-ring/40")}
    >
      {preview}
      <label htmlFor="gebzemai-input" className="sr-only">
        GebzemAI&apos;a sor
      </label>
      <textarea
        id="gebzemai-input"
        ref={ref}
        rows={1}
        value={value}
        maxLength={AI_MAX_INPUT_CHARS}
        disabled={disabled}
        placeholder={placeholder}
        enterKeyHint="send"
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && streaming) {
            e.preventDefault();
            onStop?.();
            return;
          }
          if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
          // Phones: the return key adds a line; the send button sends.
          const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
          if (touch) return;
          e.preventDefault();
          onSubmit();
        }}
        className="block max-h-36 min-h-7 w-full resize-none bg-transparent py-0.5 text-base leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
      />
      <div className="mt-1.5 flex items-center justify-between">
        <button
          type="button"
          onClick={onPlus}
          aria-label="Fotoğraf ekle"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground outline-none transition-colors hover:bg-muted/70 focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Plus className="size-5" strokeWidth={2.2} aria-hidden />
        </button>
        {streaming ? (
          <button type="button" onClick={onStop} aria-label="Yanıtı durdur" className={SEND_BUTTON}>
            <Square className="size-3.5 fill-current" aria-hidden />
          </button>
        ) : (
          <button type="submit" disabled={!canSend} aria-label="Gönder" className={cn(SEND_BUTTON, "transition-opacity disabled:opacity-30")}>
            <ArrowUp className="size-5" strokeWidth={2.4} aria-hidden />
          </button>
        )}
      </div>
    </form>
  );
}

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
  // The composer takes the bottom menu's place here: toasts show above it, not on top of it (ui/sonner --toast-bottom).
  React.useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--toast-bottom", "calc(env(safe-area-inset-bottom, 0px) + 7.5rem)");
    return () => {
      root.style.removeProperty("--toast-bottom");
    };
  }, []);
  if (current === "inactive") return <InactiveView />;
  if (current === "guest") return <GuestView />;
  return <ChatGate initialLimit={initialLimit} initialRemaining={initialRemaining} onInactive={() => setCurrent("inactive")} />;
}

/** Key missing or switched off: same screen; the question can be typed, sending (or "+") says GebzemAI is not on yet. */
function InactiveView() {
  const { profile } = useAuth();
  const firstName = nameWords(profile?.full_name)[0];
  const [value, setValue] = React.useState("");
  const notYet = () => notify.info("GebzemAI henüz aktif değil", "Yakında buradan sorabileceksin. Şimdilik aradığını aramada bulabilirsin.");
  return (
    <>
      <AiGlow />
      <AiHeader onNewChat={() => setValue("")} />
      <div className="relative z-10 flex flex-1 flex-col px-4">
        <Welcome name={firstName}>
          <TypedSuggestion hrefFor={(s) => s.href} />
        </Welcome>
      </div>
      <BottomDock inFlow className="sticky bottom-0 z-30 bg-transparent">
        <PrivacyNote />
        <Composer value={value} onChange={setValue} onSubmit={notYet} onPlus={notYet} canSend={!!value.trim()} />
      </BottomDock>
    </>
  );
}

/** Guests type the question here; sending (or "+") signs in and the question waits in the chat. */
function GuestView() {
  const router = useRouter();
  const login = routes.auth.login(routes.ai());
  const [value, setValue] = React.useState("");
  const signIn = () => {
    const text = value.trim();
    if (text) writeJSON(DRAFT_KEY, text.slice(0, AI_MAX_INPUT_CHARS), "session");
    router.push(login);
  };
  return (
    <>
      <AiGlow />
      <AiHeader onNewChat={() => setValue("")} />
      <div className="relative z-10 flex flex-1 flex-col px-4">
        <Welcome>
          <TypedSuggestion hrefFor={() => login} />
        </Welcome>
      </div>
      <BottomDock inFlow className="sticky bottom-0 z-30 bg-transparent">
        <PrivacyNote />
        <Composer value={value} onChange={setValue} onSubmit={signIn} onPlus={signIn} canSend={!!value.trim()} />
      </BottomDock>
    </>
  );
}

/** The chat reads sessionStorage, so it mounts only on the client (no hydration mismatch). */
function ChatGate(props: { initialLimit: AiLimitState | null; initialRemaining: number | null; onInactive: () => void }) {
  const isClient = useIsClient();
  if (!isClient) {
    return (
      <>
        <AiGlow />
        <AiHeader />
        <div className="flex-1" />
        <BottomDock inFlow className="sticky bottom-0 z-30 bg-transparent">
          <div className="mb-2 h-8" />
          <div className="h-[5.75rem] rounded-[1.75rem] bg-card" />
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
  const { profile } = useAuth();
  const firstName = nameWords(profile?.full_name)[0];
  const [messages, setMessages] = React.useState<ChatMsg[]>(loadStored);
  // A question typed before signing in (GuestView) comes back here once.
  const [input, setInput] = React.useState(() => {
    const draft = readJSON<unknown>(DRAFT_KEY, "", "session");
    return typeof draft === "string" ? draft.slice(0, AI_MAX_INPUT_CHARS) : "";
  });
  const [image, setImage] = React.useState<PickedImage | null>(null);
  const [imageBusy, setImageBusy] = React.useState(false);
  const [streaming, setStreaming] = React.useState(false);
  const [limit, setLimit] = React.useState<AiLimitState | null>(initialLimit);
  const [remaining, setRemaining] = React.useState<number | null>(initialRemaining);
  const [needsLogin, setNeedsLogin] = React.useState(false);
  const [announce, setAnnounce] = React.useState("");
  const abortRef = React.useRef<AbortController | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const stickRef = React.useRef(true);

  React.useEffect(() => removeItem(DRAFT_KEY, "session"), []);

  // Keep the chat of this tab (not while an answer is still streaming); photos stay in memory only.
  React.useEffect(() => {
    if (streaming) return;
    if (messages.length) {
      const stored = messages.slice(-MAX_STORED).map((m) => (m.role === "user" ? { id: m.id, role: m.role, text: m.text } : m));
      writeJSON(STORAGE_KEY, { v: 1, messages: stored }, "session");
    } else removeItem(STORAGE_KEY, "session");
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

  /** Resized and re-encoded on the phone (metadata and location dropped) before it is attached. */
  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setImageBusy(true);
    try {
      const { full, thumb } = await processImage(file, { maxSize: 1024, thumbSize: 320, quality: 0.75 });
      const [dataUrl, thumbUrl] = await Promise.all([blobToDataUrl(full.blob), blobToDataUrl(thumb.blob)]);
      if (dataUrl.length > AI_MAX_IMAGE_CHARS || !AI_IMAGE_DATA_URL.test(dataUrl)) throw new Error("Bu fotoğraf gönderilemiyor. Başka bir fotoğraf dene.");
      setImage({ dataUrl, thumbUrl });
    } catch (e) {
      notify.warning("Fotoğraf eklenemedi", e instanceof Error ? e.message : undefined);
    } finally {
      setImageBusy(false);
    }
  };

  const ask = async (conversation: ChatMsg[], opts: { userId?: string; question?: string; image?: PickedImage } = {}) => {
    const assistantId = newId();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setMessages((ms) => [...ms, { id: assistantId, role: "assistant", text: "", cards: [], state: "streaming" }]);
    setStreaming(true);
    setAnnounce("GebzemAI yanıtlıyor");
    const patch = (fn: (m: AssistantMsg) => AssistantMsg) =>
      setMessages((ms) => ms.map((m) => (m.id === assistantId && m.role === "assistant" ? fn(m) : m)));
    // Nothing was answered (limit, sign-in, bad input): take the question and its photo back into the composer.
    const takeBack = () => {
      setMessages((ms) => ms.filter((m) => m.id !== assistantId && m.id !== opts.userId));
      if (opts.userId && opts.question) {
        setInput(opts.question === PHOTO_ONLY_QUESTION && opts.image ? "" : opts.question);
        if (opts.image) setImage(opts.image);
      }
    };

    let finished = false;
    let answer = "";
    try {
      const res = await fetch("/api/gebzemai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: buildHistory(conversation), ...(opts.image ? { image: opts.image.dataUrl } : {}) }),
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
    const text = raw.trim() || (image ? PHOTO_ONLY_QUESTION : "");
    if (!text || streaming || blocked || imageBusy) return;
    if (text.length > AI_MAX_INPUT_CHARS) {
      notify.warning("Soru çok uzun", `En fazla ${AI_MAX_INPUT_CHARS} karakter yazabilirsin.`);
      return;
    }
    const user: UserMsg = { id: newId(), role: "user", text, ...(image ? { image } : {}) };
    const conversation = [...messages, user];
    setMessages(conversation);
    setInput("");
    setImage(null);
    stickRef.current = true;
    void ask(conversation, { userId: user.id, question: text, image: image ?? undefined });
  };

  const retry = (assistantId: string) => {
    if (streaming || blocked) return;
    const index = messages.findIndex((m) => m.id === assistantId);
    if (index < 0) return;
    const conversation = messages.slice(0, index);
    const question = conversation[conversation.length - 1];
    if (question?.role !== "user") return;
    setMessages(conversation);
    stickRef.current = true;
    void ask(conversation, { image: question.image });
  };

  const stop = () => abortRef.current?.abort();

  const newChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setInput("");
    setImage(null);
    setAnnounce("");
    removeItem(STORAGE_KEY, "session");
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const count = input.length;
  const canSend = (!!input.trim() || !!image) && !streaming && !blocked && !imageBusy;
  const empty = messages.length === 0;

  const preview =
    image || imageBusy ? (
      <div className="mb-2 flex">
        <span className="relative size-16 overflow-hidden rounded-xl bg-muted">
          {image ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.thumbUrl} alt="Eklenen fotoğraf" className="size-full object-cover" />
              <button
                type="button"
                onClick={() => setImage(null)}
                aria-label="Fotoğrafı kaldır"
                className="absolute top-1 right-1 flex size-7 items-center justify-center rounded-full bg-foreground/70 text-background outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <X className="size-4" aria-hidden />
              </button>
            </>
          ) : (
            <span className="absolute inset-0 animate-pulse bg-muted-foreground/15 motion-reduce:animate-none" aria-label="Fotoğraf hazırlanıyor" role="status" />
          )}
        </span>
      </div>
    ) : null;

  return (
    <>
      <AiGlow />
      <AiHeader onNewChat={newChat} solid={!empty} />

      {/* Not a live region: streamed deltas would be read piece by piece. The finished answer is announced once below. */}
      <div role="region" aria-label="GebzemAI sohbeti" aria-busy={streaming} className="relative z-10 flex flex-1 flex-col gap-4 px-4 pt-4 pb-4">
        {empty ? (
          <Welcome name={firstName}>
            <TypedSuggestion onPick={blocked ? undefined : send} />
          </Welcome>
        ) : (
          messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex flex-col items-end gap-1.5">
                {m.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.image.thumbUrl} alt="Gönderdiğin fotoğraf" className="max-h-48 max-w-[70%] rounded-2xl object-cover" />
                ) : null}
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

      {/* Shared dock kept in flow and stuck to the bottom: see-through over the glow until the chat starts, then solid. */}
      <BottomDock inFlow className={cn("sticky bottom-0 z-30", empty && "bg-transparent")}>
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
        <PrivacyNote />
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            void pickImage(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Composer
          inputRef={textareaRef}
          value={input}
          onChange={setInput}
          onSubmit={() => send(input)}
          onPlus={() => {
            if (!blocked && !streaming) fileRef.current?.click();
          }}
          canSend={canSend}
          disabled={blocked}
          placeholder={blocked ? "Şu an soru gönderilemiyor" : PLACEHOLDER}
          streaming={streaming}
          onStop={stop}
          preview={preview}
          describedBy={count >= AI_COUNTER_FROM ? "gebzemai-count" : undefined}
        />
        {count >= AI_COUNTER_FROM ? (
          // Not live (it would be read on every keystroke); the textarea points to it with aria-describedby.
          <p id="gebzemai-count" className={cn("mt-1 pr-2 text-right text-xs tabular-nums", count >= AI_MAX_INPUT_CHARS ? "font-semibold text-destructive" : "text-muted-foreground")}>
            {count}/{AI_MAX_INPUT_CHARS}
            <span className="sr-only"> karakter</span>
          </p>
        ) : null}
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
