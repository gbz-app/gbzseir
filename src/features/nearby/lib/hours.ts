/**
 * Business opening status from businesses.working_hours
 * ({"mon":{"open":"09:00","close":"18:00"}, ..., "sun": null}; null/missing = closed). Istanbul time.
 */
import type { Json } from "@/lib/database.types";
import { istanbulParts } from "@/core/time";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

type Slot = { open: number; close: number; openLabel: string; closeLabel: string };

function toMinutes(t: unknown): number | null {
  if (typeof t !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

function slotFor(hours: Record<string, unknown>, dayIndex: number): Slot | null {
  const raw = hours[DAY_KEYS[(dayIndex + 7) % 7]];
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const open = toMinutes(r.open);
  const close = toMinutes(r.close);
  if (open === null || close === null || open === close) return null;
  return { open, close, openLabel: String(r.open), closeLabel: String(r.close) };
}

export type OpenStatus = { open: boolean; label: string };

/**
 * Current status or null when hours are unknown (no valid day at all).
 * Handles slots that pass midnight (close < open).
 */
export function openStatus(hours: Json | null | undefined, now: number | Date, vacation?: boolean): OpenStatus | null {
  if (vacation) return { open: false, label: "Tatilde" };
  if (!hours || typeof hours !== "object" || Array.isArray(hours)) return null;
  const h = hours as Record<string, unknown>;
  const hasAny = DAY_KEYS.some((_, i) => slotFor(h, i) !== null);
  if (!hasAny) return null;

  const p = istanbulParts(now);
  const minutes = p.hour * 60 + p.minute;
  const today = slotFor(h, p.weekday);
  const yesterday = slotFor(h, p.weekday - 1);

  // Yesterday's slot that runs past midnight.
  if (yesterday && yesterday.close < yesterday.open && minutes < yesterday.close) {
    return { open: true, label: `Açık · ${yesterday.closeLabel}'e kadar` };
  }
  if (today) {
    const overnight = today.close < today.open;
    if (minutes >= today.open && (overnight || minutes < today.close)) {
      return { open: true, label: `Açık · ${today.closeLabel}'e kadar` };
    }
    if (minutes < today.open) return { open: false, label: `Kapalı · ${today.openLabel}'de açılır` };
  }
  return { open: false, label: "Kapalı" };
}
