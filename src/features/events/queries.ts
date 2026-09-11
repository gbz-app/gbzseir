import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/features/business/lib/public-client";
import { getVocabularies } from "@/features/business/lib/vocabularies";
import { DEFAULT_EVENT_CATEGORY, eventCategoryInfo, parseEventCategory, type EventCategory, type EventCategoryDef } from "@/features/business/lib/verticals";

/** is_demo: sample organizer, its phone is a placeholder. */
export type EventOrganizer = { id: string; slug: string; name: string; logo_url: string | null; phone: string | null; is_demo?: boolean };

export type EventItem = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: EventCategory;
  /** Label and lucide icon name of the category (event_categories). */
  category_label: string;
  category_icon: string | null;
  starts_at: string;
  ends_at: string | null;
  venue_name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  is_free: boolean;
  price_try: number | null;
  price_note: string | null;
  ticket_url: string | null;
  phone: string | null;
  cover_url: string | null;
  neighbourhood_name: string | null;
  business: EventOrganizer | null;
  /** Sample (seed) event: labelled "Örnek", no call button, no JSON-LD. */
  is_demo: boolean;
};

const COLUMNS =
  "id,slug,title,description,category,starts_at,ends_at,venue_name,address,lat,lng,is_free,price_try,price_note,ticket_url,phone,cover_url,is_demo,neighbourhoods(name),businesses(id,slug,name,logo_url,phone,is_demo)";

type Raw = Omit<EventItem, "category" | "category_label" | "category_icon" | "price_try" | "neighbourhood_name" | "business"> & {
  category: string;
  price_try: number | string | null;
  neighbourhoods: { name: string } | null;
  businesses: EventOrganizer | null;
};

function toItem(r: Raw, categories: readonly EventCategoryDef[]): EventItem {
  const { neighbourhoods, businesses, ...rest } = r;
  const price = r.price_try === null ? null : Number(r.price_try);
  const category = parseEventCategory(r.category) ?? DEFAULT_EVENT_CATEGORY;
  const def = categories.find((c) => c.key === category);
  return {
    ...rest,
    category,
    category_label: def?.label ?? eventCategoryInfo(category, categories).label,
    category_icon: def?.icon ?? null,
    price_try: price !== null && Number.isFinite(price) ? price : null,
    neighbourhood_name: neighbourhoods?.name ?? null,
    business: businesses ?? null,
    is_demo: r.is_demo === true,
  };
}

/** Published events that have not ended yet (events without an end time stay listed for 3 hours after they start). */
export const listUpcomingEvents = cache(async (limit = 200): Promise<EventItem[]> => {
  const now = new Date();
  const startedSince = new Date(now.getTime() - 3 * 3600_000).toISOString();
  const [{ data, error }, vocab] = await Promise.all([
    createPublicClient()
      .from("events")
      .select(COLUMNS)
      .eq("status", "published")
      .or(`ends_at.gte.${now.toISOString()},and(ends_at.is.null,starts_at.gte.${startedSince})`)
      .order("starts_at")
      .limit(limit),
    getVocabularies(),
  ]);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Raw[]).map((r) => toItem(r, vocab.eventCategories));
});

/** Upcoming events of one business (firm page). */
export async function listBusinessEvents(businessId: string, limit = 10): Promise<EventItem[]> {
  const now = new Date().toISOString();
  const [{ data, error }, vocab] = await Promise.all([
    createPublicClient()
      .from("events")
      .select(COLUMNS)
      .eq("status", "published")
      .eq("business_id", businessId)
      .or(`ends_at.gte.${now},starts_at.gte.${now}`)
      .order("starts_at")
      .limit(limit),
    getVocabularies(),
  ]);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Raw[]).map((r) => toItem(r, vocab.eventCategories));
}

/** One published event (past events stay reachable). null = not found. */
export const getEventBySlug = cache(async (slug: string): Promise<EventItem | null> => {
  const [{ data, error }, vocab] = await Promise.all([
    createPublicClient().from("events").select(COLUMNS).eq("slug", slug).eq("status", "published").maybeSingle(),
    getVocabularies(),
  ]);
  if (error) throw new Error(error.message);
  return data ? toItem(data as unknown as Raw, vocab.eventCategories) : null;
});
