import type { Metadata } from "next";
import { routes } from "@/core/routes";
import { CITY } from "@/config/site";
import { getVocabularies } from "@/features/business/lib/vocabularies";
import { PlacesBrowser } from "@/features/nearby/components/places-browser";
import { getPlaces } from "@/features/nearby/server/queries";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `${CITY.name} Gezilecek Yerler`,
  description: `${CITY.name}'nin tarihi yapıları, parkları ve doğal güzellikleri: konum, açıklama ve yol tarifi.`,
  alternates: { canonical: routes.nearby.places() },
};

/** D6 - Gezilecek yerler (category chips in the admin order of place_categories). */
export default async function PlacesPage() {
  const [places, vocab] = await Promise.all([getPlaces(), getVocabularies()]);
  return <PlacesBrowser places={places} categories={vocab.placeCategories} />;
}
