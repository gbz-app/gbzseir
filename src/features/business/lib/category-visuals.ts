import { Building2, Castle, Landmark, Megaphone, Mountain, Newspaper, type LucideIcon } from "lucide-react";
import { VOCAB_ICON_NAMES, vocabIcon } from "./verticals";

/**
 * Shared pieces of the simple category vocabularies news_categories and place_categories (2026091363): row shape,
 * icons, a gradient for admin-added keys and admin ordering. Pure, safe on the server and in client components.
 */

/** A category row: key, label, lucide icon name, active. Serializable. */
export type CategoryDef = { key: string; label: string; icon: string | null; active: boolean };

/** Key format of news_categories / place_categories (the database checks the same). */
export const CATEGORY_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

// News and place icons the business vocabularies do not have.
const EXTRA_ICONS: Record<string, LucideIcon> = {
  "building-2": Building2,
  castle: Castle,
  landmark: Landmark,
  megaphone: Megaphone,
  mountain: Mountain,
  newspaper: Newspaper,
};

/** Icon names an admin can pick for a news or place category. */
export const CATEGORY_ICON_NAMES: readonly string[] = [...Object.keys(EXTRA_ICONS), ...VOCAB_ICON_NAMES];

/** Lucide icon of a category (any name of CATEGORY_ICON_NAMES); `fallback` (default Tag) for an unknown or empty one. */
export function categoryIcon(name: string | null | undefined, fallback?: LucideIcon): LucideIcon {
  return (name ? EXTRA_ICONS[name] : undefined) ?? vocabIcon(name, fallback);
}

/** Stable pick from `palette` for a key without its own gradient (admin-added categories). */
export function gradientFor(key: string, palette: readonly string[]): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/** Picker options (admin editors): the active categories in order, plus `current` when it is turned off or not listed. */
export function pickerDefs(defs: readonly CategoryDef[], current?: string | null): CategoryDef[] {
  const list = defs.filter((d) => d.active || d.key === current);
  if (current && !list.some((d) => d.key === current)) list.push({ key: current, label: current, icon: null, active: false });
  return list;
}

/** Distinct keys in the vocabulary's (admin) order; keys it does not list go last, in their given order. */
export function orderByDefs(keys: Iterable<string>, defs: readonly CategoryDef[]): string[] {
  const rank = new Map(defs.map((d, i) => [d.key, i]));
  return [...new Set(keys)].sort((a, b) => (rank.get(a) ?? defs.length) - (rank.get(b) ?? defs.length));
}
