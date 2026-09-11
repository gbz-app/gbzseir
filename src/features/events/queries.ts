import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/features/business/lib/public-client";
import { getVocabularies } from "@/features/business/lib/vocabularies";
import { DEFAULT_EVENT_CATEGORY, eventCategoryInfo, parseEventCategory, type EventCategory, type EventCategoryDef } from "@/features/business/lib/verticals";

/** is_demo: sample organizer, its phone is a placeholder. verification_level >= 1: "Onaylı" tick. */
export type EventOrganizer = { id: string; slug: string; name: string; logo_url: string | null; phone: string | null; is_demo?: boolean; verification_level?: number | null };

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
  /** Public phone (business events and city events). A normal user's number is never here (reveal_event_phone). */
  phone: string | null;
  cover_url: string | null;
  neighbourhood_name: string | null;
  business: EventOrganizer | null;
  /** Sample (seed) event: labelled "Örnek", no call button, no JSON-LD. */
  is_demo: boolean;
  /** Short name of the person who created a user event ("Ayşe Y."). */
  organizer_name: string | null;
  /** A user event with a contact phone (shown to signed-in users with "Numarayı göster"). */
  has_contact_phone: boolean;
  /** The event takes place at this business (may differ from the organizer). */
  venue_business_id: string | null;
};

const COLUMNS =
  "id,slug,title,description,category,starts_at,ends_at,venue_name,address,lat,lng,is_free,price_try,price_note,ticket_url,phone,cover_url,is_demo,organizer_name,has_contact_phone,venue_business_id,neighbourhoods(name),businesses(id,slug,name,logo_url,phone,is_demo,verification_level)";

type Raw = Omit<EventItem, "category" | "category_label" | "category_icon" | "price_try" | "neighbourhood_name" | "business" | "has_contact_phone"> & {
  category: string;
  price_try: number | string | null;
  has_contact_phone: boolean | null;
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
    organizer_name: r.organizer_name ?? null,
    has_contact_phone: r.has_contact_phone === true,
    venue_business_id: r.venue_business_id ?? null,
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

/** Published events that ended in the last 90 days, newest first (/etkinlikler/gecmis). */
export const listPastEvents = cache(async (limit = 60): Promise<EventItem[]> => {
  const now = new Date();
  const startedBefore = new Date(now.getTime() - 3 * 3600_000).toISOString();
  const since = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const [{ data, error }, vocab] = await Promise.all([
    createPublicClient()
      .from("events")
      .select(COLUMNS)
      .eq("status", "published")
      .or(`ends_at.lt.${now.toISOString()},and(ends_at.is.null,starts_at.lt.${startedBefore})`)
      .gte("starts_at", since)
      .order("starts_at", { ascending: false })
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

/** The public business an event takes place at (name + link on the event page). null = none / not public. */
export const getVenueBusiness = cache(async (id: string): Promise<{ slug: string; name: string } | null> => {
  const { data } = await createPublicClient().from("businesses").select("slug,name").eq("id", id).eq("status", "approved").maybeSingle();
  return data?.slug ? { slug: data.slug, name: data.name } : null;
});
