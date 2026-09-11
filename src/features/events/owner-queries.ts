import "server-only";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_EVENT_CATEGORY, parseEventCategory, type EventCategory } from "@/features/business/lib/verticals";

export type EventStatus = "draft" | "published" | "cancelled";

export type OwnerEvent = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: EventCategory;
  starts_at: string;
  ends_at: string | null;
  venue_name: string | null;
  address: string | null;
  is_free: boolean;
  price_try: number | null;
  price_note: string | null;
  ticket_url: string | null;
  cover_url: string | null;
  status: EventStatus;
};

export const OWNER_EVENT_COLUMNS = "id,slug,title,description,category,starts_at,ends_at,venue_name,address,is_free,price_try,price_note,ticket_url,cover_url,status";

type Raw = Omit<OwnerEvent, "category" | "price_try" | "status"> & { category: string; price_try: unknown; status: string };

export function toOwnerEvent(r: Raw): OwnerEvent {
  const price = r.price_try === null || r.price_try === undefined ? null : Number(r.price_try);
  return {
    ...r,
    category: parseEventCategory(r.category) ?? DEFAULT_EVENT_CATEGORY,
    price_try: price !== null && Number.isFinite(price) ? price : null,
    status: r.status === "draft" || r.status === "cancelled" ? r.status : "published",
  };
}

/** All events of the owner's business (drafts and cancelled included; RLS lets the owner read them). */
export async function getOwnerEvents(businessId: string): Promise<OwnerEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").select(OWNER_EVENT_COLUMNS).eq("business_id", businessId).order("starts_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Raw[]).map(toOwnerEvent);
}
