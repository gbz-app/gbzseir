/**
 * GebzemAI shared shapes and limits (pure TS, safe on the client and the server).
 * The route (/api/gebzemai) streams newline-delimited JSON: one AiStreamEvent per line.
 */
import { routes } from "@/core/routes";

/** Longest question a user may send (characters). */
export const AI_MAX_INPUT_CHARS = 1500;
/** Counter appears near the limit. */
export const AI_COUNTER_FROM = 1200;
/** Messages sent as history (user + assistant texts, kept client-side only). */
export const AI_HISTORY_LIMIT = 10;
/** Assistant texts are cut to this length when sent back as history. */
export const AI_HISTORY_ASSISTANT_CHARS = 3000;
/** All history text sent to the model in one turn (characters, server-side cap); the oldest messages go first. */
export const AI_HISTORY_TOTAL_CHARS = 12_000;
/** Cards shown under one answer. */
export const AI_MAX_CARDS = 12;

/** Example questions (intro chips). `href` is the app page used while GebzemAI is off. */
export const AI_EXAMPLES: ReadonlyArray<{ text: string; href: string }> = [
  { text: "Bugün nöbetçi eczane hangisi?", href: routes.nearby.dutyPharmacies() },
  { text: "Yakınımda açık kafe", href: routes.businesses.vertical("kafe") },
  { text: "Bu hafta hangi etkinlikler var?", href: routes.events.root() },
  { text: "Gebze'de taksi durağı", href: routes.nearby.root("taksi") },
  { text: "Su tesisatçısı lazım", href: routes.search("tesisatçı") },
  { text: "Tarihi yerler neler?", href: routes.nearby.places() },
];

/** Icon of a result card (mapped to a Lucide icon on the client). */
export type AiCardIcon =
  | "duty"
  | "pharmacy"
  | "mosque"
  | "bus_stop"
  | "taxi"
  | "atm"
  | "place"
  | "business"
  | "food"
  | "cafe"
  | "hotel"
  | "service"
  | "shop"
  | "health"
  | "event"
  | "news"
  | "fuel"
  | "ev_charge"
  | "institution";

/** What a call is logged against (log_contact_event). */
export type AiCallSubject = "business" | "poi" | "event";

/** A tappable result card under an answer. Built on the server from tool results, never from model text. */
export type AiCard = {
  /** Unique key (kind:id). */
  id: string;
  icon: AiCardIcon;
  title: string;
  /** One line under the title. */
  subtitle?: string;
  /** In-app path ("/eczane/x") or, for news headlines only, an https URL of the source site. */
  href: string;
  external?: boolean;
  /** Small label: "Örnek veri", "Açık", "Tatilde". */
  badge?: string;
  /** Call button (real, non-sample phone numbers only). */
  call?: { phone: string; subjectType: AiCallSubject; subjectId: string };
};

/** Why a turn cannot start (ai_begin_turn / ai_status). */
export type AiLimitReason = "daily" | "minute" | "budget";
export type AiBlockReason = AiLimitReason | "disabled" | "banned" | "auth";

export type AiStreamEvent =
  /** Turn accepted: remaining questions today. */
  | { t: "start"; remaining: number; dailyLimit: number }
  /** A tool is running ("Nöbetçi eczanelere bakıyorum"). */
  | { t: "status"; label: string }
  /** Answer text delta. */
  | { t: "text"; d: string }
  /** Result cards of one tool call. */
  | { t: "cards"; items: AiCard[] }
  | { t: "done"; stop: string }
  | { t: "error"; code: AiErrorCode; message: string };

export type AiErrorCode = "busy" | "network" | "timeout" | "not_active" | "server" | "refused";

/** JSON body of a non-streamed error answer (4xx / 5xx). */
export type AiErrorBody = {
  ok: false;
  code: AiBlockReason | "bad_request" | "too_long" | "not_active" | "server" | "forbidden";
  message: string;
  /** ISO time the limit resets (daily / minute / budget). */
  resetAt?: string | null;
  dailyLimit?: number;
};

/** One history item sent to the route. */
export type AiHistoryItem = { role: "user" | "assistant"; text: string };
