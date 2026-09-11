/** Event statuses, labels and DB error messages (pure TS, client and server). */

export type EventStatus = "draft" | "pending_review" | "published" | "rejected" | "cancelled";

export const EVENT_STATUSES: readonly EventStatus[] = ["published", "pending_review", "rejected", "draft", "cancelled"];

export function parseEventStatus(value: unknown): EventStatus {
  return typeof value === "string" && (EVENT_STATUSES as readonly string[]).includes(value) ? (value as EventStatus) : "draft";
}

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  published: "Yayında",
  pending_review: "Onay bekliyor",
  rejected: "Reddedildi",
  draft: "Taslak",
  cancelled: "İptal edildi",
};

/** Badge colours (light + dark). */
export const EVENT_STATUS_TONES: Record<EventStatus, string> = {
  published: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  pending_review: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  draft: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

/** private.events_before_write / RLS error hints -> Turkish text. */
const ERROR_MESSAGES: Record<string, string> = {
  event_pending_cap: "Onay bekleyen en fazla 3 etkinliğin olabilir. Önce onaylanmalarını bekle.",
  event_active_cap: "Yaklaşan etkinlik sınırına ulaştın. Eski bir etkinliğini silip tekrar dene.",
  event_daily_cap: "Son 24 saatte çok fazla etkinlik eklendi. Biraz sonra tekrar dene.",
  invalid_dates: "Tarihi kontrol et: etkinlik geçmişte olamaz ve en fazla 60 gün sürebilir.",
  invalid_cover: "Kapak fotoğrafını yeniden yükle.",
  invalid_ticket_url: "Bilet bağlantısı https:// ile başlamalı.",
  invalid_venue: "Seçtiğin işletme artık yayında değil. Başka bir yer seç.",
  admin_hidden: "Bu etkinlik yönetici tarafından yayından kaldırıldı. Düzenleyip yeniden onaya gönderebilirsin.",
  login_required: "Oturumun kapanmış. Tekrar giriş yap.",
};

export function eventErrorMessage(error: { hint?: string | null; code?: string | null } | null | undefined, fallback = "Etkinlik kaydedilemedi, tekrar dene."): string {
  if (!error) return fallback;
  if (error.hint && ERROR_MESSAGES[error.hint]) return ERROR_MESSAGES[error.hint];
  if (error.code === "42501") return "Bu işlem için yetkin yok. Hesabın kısıtlanmış olabilir.";
  return fallback;
}

/** Ended: the end time passed, or 3 hours after the start when there is no end (same rule as the public list). */
export function isEventPast(e: { starts_at: string; ends_at: string | null }, now: number): boolean {
  const end = e.ends_at ? new Date(e.ends_at).getTime() : new Date(e.starts_at).getTime() + 3 * 3600_000;
  return end < now;
}
