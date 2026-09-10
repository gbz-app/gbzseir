import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/features/business/lib/public-client";
import { parseEventCategory, type EventCategory } from "@/features/business/lib/verticals";

export type EventOrganizer = { id: string; slug: string; name: string; logo_url: string | null; phone: string | null };

export type EventItem = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: EventCategory;
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
};

const COLUMNS =
  "id,slug,title,description,category,starts_at,ends_at,venue_name,address,lat,lng,is_free,price_try,price_note,ticket_url,phone,cover_url,neighbourhoods(name),businesses(id,slug,name,logo_url,phone)";

type Raw = Omit<EventItem, "category" | "price_try" | "neighbourhood_name" | "business"> & {
  category: string;
  price_try: number | string | null;
  neighbourhoods: { name: string } | null;
  businesses: EventOrganizer | null;
};

function toItem(r: Raw): EventItem {
  const { neighbourhoods, businesses, ...rest } = r;
  const price = r.price_try === null ? null : Number(r.price_try);
  return {
    ...rest,
    category: parseEventCategory(r.category) ?? "diger",
    price_try: price !== null && Number.isFinite(price) ? price : null,
    neighbourhood_name: neighbourhoods?.name ?? null,
    business: businesses ?? null,
  };
}

/** Published events that have not ended yet (events without an end time stay listed for 3 hours after they start). */
export const listUpcomingEvents = cache(async (limit = 200): Promise<EventItem[]> => {
  const now = new Date();
  const startedSince = new Date(now.getTime() - 3 * 3600_000).toISOString();
  const { data, error } = await createPublicClient()
    .from("events")
    .select(COLUMNS)
    .eq("status", "published")
    .or(`ends_at.gte.${now.toISOString()},and(ends_at.is.null,starts_at.gte.${startedSince})`)
    .order("starts_at")
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Raw[]).map(toItem);
});

/** Upcoming events of one business (firm page). */
export async function listBusinessEvents(businessId: string, limit = 10): Promise<EventItem[]> {
  const now = new Date().toISOString();
  const { data, error } = await createPublicClient()
    .from("events")
    .select(COLUMNS)
    .eq("status", "published")
    .eq("business_id", businessId)
    .or(`ends_at.gte.${now},starts_at.gte.${now}`)
    .order("starts_at")
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Raw[]).map(toItem);
}

/** One published event (past events stay reachable). null = not found. */
export const getEventBySlug = cache(async (slug: string): Promise<EventItem | null> => {
  const { data, error } = await createPublicClient().from("events").select(COLUMNS).eq("slug", slug).eq("status", "published").maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toItem(data as unknown as Raw) : null;
});
