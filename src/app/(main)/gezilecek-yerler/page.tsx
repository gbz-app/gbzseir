import type { Metadata } from "next";
import { routes } from "@/core/routes";
import { CITY } from "@/config/site";
import { getVocabularies } from "@/features/business/lib/vocabularies";
import { GuidePlacesBrowser } from "@/features/guide/components/places-browser";
import { createPublicClient } from "@/features/nearby/server/public-client";
import { getPlaces } from "@/features/nearby/server/queries";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `${CITY.name} Gezilecek Yerler`,
  description: `${CITY.name}'nin tarihi yapıları, parkları ve doğal güzellikleri: konum, açıklama ve yol tarifi.`,
  alternates: { canonical: routes.nearby.places() },
};

/** Ids per request: keeps the PostgREST "in" filter URL short (about 5 KB). */
const ID_CHUNK = 120;

/**
 * Place id -> district name (poi.district_id -> districts.name) for the card's district line, for exactly the listed
 * places (no row-limit mismatch as the Kocaeli data grows). Empty on any error; cards then fall back to the neighbourhood.
 */
async function getPlaceDistricts(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  try {
    const supabase = createPublicClient(3600, ["nearby", "poi"]);
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK));
    const [districts, ...pois] = await Promise.all([
      supabase.from("districts").select("id,name"),
      ...chunks.map((chunk) => supabase.from("poi").select("id,district_id").in("id", chunk).not("district_id", "is", null)),
    ]);
    if (districts.error || pois.some((r) => r.error)) return {};
    const names = new Map((districts.data ?? []).map((d) => [d.id, d.name]));
    const out: Record<string, string> = {};
    for (const p of pois.flatMap((r) => r.data ?? [])) {
      const name = p.district_id ? names.get(p.district_id) : undefined;
      if (name) out[p.id] = name;
    }
    return out;
  } catch {
    return {};
  }
}

/** D6 - Gezilecek yerler (category chips in the admin order of place_categories; white photo cards, no shadows). */
export default async function PlacesPage() {
  const [places, vocab] = await Promise.all([getPlaces(), getVocabularies()]);
  const districtNames = await getPlaceDistricts(places.map((p) => p.id));
  return <GuidePlacesBrowser places={places} categories={vocab.placeCategories} districtNames={districtNames} />;
}
