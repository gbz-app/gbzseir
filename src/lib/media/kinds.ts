/**
 * Media kinds, limits, object keys and URL helpers shared by the browser and the server (pure, no secrets).
 *
 * Two public stores:
 * - Supabase Storage bucket `media`: https://<project>.supabase.co/storage/v1/object/public/media/<uid>/...
 * - Cloudflare R2 (when configured): NEXT_PUBLIC_MEDIA_BASE_URL/<uid>/listings/<yyyy>/<uuid>.<ext>
 * Every user file lives under the user's own <uid>/ folder; isOwnMediaUrl and the SQL helper
 * private.own_media_url (migration 2026091374) apply the same rule.
 */

export type MediaKind = "listing-photo" | "listing-video" | "listing-poster";
export type MediaProviderId = "r2" | "supabase";

export type MediaKindRule = { types: readonly string[]; maxBytes: number; label: string };

const MB = 1024 * 1024;

export const MEDIA_KINDS: Record<MediaKind, MediaKindRule> = {
  "listing-photo": { types: ["image/jpeg", "image/png", "image/webp"], maxBytes: 5 * MB, label: "Fotoğraf" },
  "listing-video": { types: ["video/mp4", "video/quicktime", "video/webm"], maxBytes: 100 * MB, label: "Video" },
  "listing-poster": { types: ["image/jpeg"], maxBytes: 1 * MB, label: "Video kapağı" },
};

export const VIDEO_MAX_BYTES = MEDIA_KINDS["listing-video"].maxBytes;
/** Longest allowed clip. Container durations run a few ms long (60.02 s for a 60 s clip), hence the tolerance. */
export const VIDEO_MAX_SECONDS = 60;
export const VIDEO_DURATION_TOLERANCE = 0.5;

export const MEDIA_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export function isMediaKind(value: unknown): value is MediaKind {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(MEDIA_KINDS, value);
}

/** Turkish error when the kind / type / size combination is not allowed, else null. */
export function mediaUploadError(kind: MediaKind, contentType: string, size: number): string | null {
  const rule = MEDIA_KINDS[kind];
  if (!rule.types.includes(contentType)) return `${rule.label} için bu dosya türü desteklenmiyor.`;
  if (!Number.isSafeInteger(size) || size <= 0) return "Dosya boş görünüyor.";
  if (size > rule.maxBytes) return `${rule.label} en fazla ${Math.round(rule.maxBytes / MB)} MB olabilir.`;
  return null;
}

/** <uid>/listings/<yyyy>/<uuid>.<ext> (all three kinds live next to each other; the uuid is new per object). */
export function buildMediaKey(userId: string, contentType: string, id: string, now = new Date()): string {
  const ext = MEDIA_EXT[contentType];
  if (!ext) throw new Error("unsupported content type");
  return `${userId}/listings/${now.getUTCFullYear()}/${id}.${ext}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
/** Keys the upload route hands out (and the only ones set_listing_video accepts). */
export const MEDIA_KEY_RE = new RegExp(`^(${UUID})/listings/\\d{4}/${UUID}\\.(jpg|png|webp|mp4|mov|webm)$`);
const SAFE_REST_RE = /^[A-Za-z0-9_-][A-Za-z0-9._/-]*$/;

function trimBase(value: string | undefined | null): string | null {
  const v = (value ?? "").trim().replace(/\/+$/, "");
  return /^https:\/\/[a-z0-9.-]+(\/[A-Za-z0-9._-]+)*$/i.test(v) ? v : null;
}

/** Public base of the R2 bucket (https://pub-xxxx.r2.dev), or null while R2 is not configured. */
export function mediaPublicBase(): string | null {
  return trimBase(process.env.NEXT_PUBLIC_MEDIA_BASE_URL);
}

/** Public prefix of the Supabase `media` bucket (no trailing slash). */
export function supabaseMediaBase(): string | null {
  const url = trimBase(process.env.NEXT_PUBLIC_SUPABASE_URL);
  return url ? `${url}/storage/v1/object/public/media` : null;
}

export type ParsedMediaUrl = { provider: MediaProviderId; key: string };

/** Which of our stores a URL points at and its object key; null for anything else. Never throws. */
export function parseMediaUrl(url: string | null | undefined): ParsedMediaUrl | null {
  if (typeof url !== "string" || url.length > 1000 || url.includes("..") || url.includes("\\") || /[?#%]/.test(url)) return null;
  const stores: Array<[MediaProviderId, string | null]> = [
    ["r2", mediaPublicBase()],
    ["supabase", supabaseMediaBase()],
  ];
  for (const [provider, base] of stores) {
    if (!base || !url.startsWith(`${base}/`)) continue;
    const key = url.slice(base.length + 1);
    return SAFE_REST_RE.test(key) ? { provider, key } : null;
  }
  return null;
}

/** True when the URL is a file in one of our stores under the user's own folder. */
export function isOwnMediaUrl(url: string | null | undefined, userId: string | null | undefined): boolean {
  if (!userId) return false;
  const parsed = parseMediaUrl(url);
  return !!parsed && parsed.key.startsWith(`${userId}/`) && parsed.key.length > userId.length + 1;
}

/** Public URL of an object key in a store (null when that store is not configured). */
export function mediaPublicUrl(provider: MediaProviderId, key: string): string | null {
  const base = provider === "r2" ? mediaPublicBase() : supabaseMediaBase();
  return base ? `${base}/${key}` : null;
}

/** "0:24" / "1:00" */
export function formatVideoDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return "";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
