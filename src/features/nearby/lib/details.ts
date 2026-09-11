/**
 * Safe parsers for poi.details (jsonb). Unknown shapes never throw.
 */
import type { Json } from "@/lib/database.types";
import { CATEGORY_KEY_RE } from "@/features/business/lib/category-visuals";
import type { PlaceDetails, PlacePhoto, StopDetails } from "../types";

function obj(details: Json | null | undefined): Record<string, Json | undefined> {
  return details && typeof details === "object" && !Array.isArray(details) ? (details as Record<string, Json | undefined>) : {};
}

function str(v: Json | undefined): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t ? t : null;
  }
  if (typeof v === "number") return String(v);
  return null;
}

function parsePhotos(v: Json | undefined): PlacePhoto[] {
  if (!Array.isArray(v)) return [];
  const out: PlacePhoto[] = [];
  for (const p of v) {
    if (typeof p === "string" && /^https?:\/\//.test(p)) out.push({ url: p, alt: null, credit: null });
    else if (p && typeof p === "object" && !Array.isArray(p)) {
      const o = p as Record<string, Json | undefined>;
      const url = str(o.url) ?? str(o.src);
      if (!url || !/^https?:\/\//.test(url)) continue;
      // Guide imports (Wikimedia Commons) carry author, licence and the file page next to the credit line.
      const author = str(o.author);
      const licence = str(o.licence) ?? str(o.license);
      const page = str(o.source_page);
      out.push({
        url,
        alt: str(o.alt) ?? str(o.caption),
        credit: str(o.credit) ?? str(o.attribution) ?? ([author, licence].filter(Boolean).join(" · ") || null),
        author,
        licence,
        sourcePage: page && /^https?:\/\//.test(page) ? page : null,
      });
    }
  }
  return out;
}

export function parsePlaceDetails(details: Json | null | undefined): PlaceDetails {
  const d = obj(details);
  const cat = str(d.category);
  const sub = str(d.subkind);
  return {
    // Any well-formed key, admin-added ones too (the poi_place_category trigger checks it exists); "diger" otherwise.
    category: cat && CATEGORY_KEY_RE.test(cat) ? cat : "diger",
    subkind: sub && CATEGORY_KEY_RE.test(sub) ? sub : null,
    description: str(d.description),
    curated: d.curated === true,
    photos: parsePhotos(d.photos),
    hours: str(d.hours) ?? str(d.opening_hours),
    fee: str(d.fee),
    wikidata: str(d.wikidata),
  };
}

export function parseStopDetails(details: Json | null | undefined): StopDetails {
  const d = obj(details);
  const lines = Array.isArray(d.lines)
    ? Array.from(new Set(d.lines.map((l) => str(l as Json)).filter((l): l is string => !!l))).sort((a, b) =>
        a.localeCompare(b, "tr-TR", { numeric: true }),
      )
    : [];
  return {
    lines,
    stopCode: str(d.stop_code),
    shelter: typeof d.shelter === "boolean" ? d.shelter : null,
  };
}

/** "Ücretsiz" / "free" / "0" -> true (for schema.org isAccessibleForFree). */
export function isFreeEntry(fee: string | null | undefined): boolean {
  if (!fee) return false;
  return /^(ücretsiz|ucretsiz|free|yok|0)$/i.test(fee.trim());
}
