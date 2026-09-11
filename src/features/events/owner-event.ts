/** An event as its creator / owner / an admin sees it (pure TS; the rows come from RLS-protected reads). */
import { DEFAULT_EVENT_CATEGORY, parseEventCategory, type EventCategory } from "@/features/business/lib/verticals";
import { parseEventStatus, type EventStatus } from "./status";

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
  lat: number | null;
  lng: number | null;
  /** District slug (districts.id). */
  district_id: string | null;
  venue_business_id: string | null;
  business_id: string | null;
  created_by: string | null;
  is_free: boolean;
  price_try: number | null;
  price_note: string | null;
  ticket_url: string | null;
  cover_url: string | null;
  status: EventStatus;
  has_contact_phone: boolean;
  rejection_reason: string | null;
  admin_hidden: boolean;
  is_demo: boolean;
};

/** Never contact_phone: that column is not readable through the API (reveal_event_phone). */
export const OWNER_EVENT_COLUMNS =
  "id,slug,title,description,category,starts_at,ends_at,venue_name,address,lat,lng,district_id,venue_business_id,business_id,created_by,is_free,price_try,price_note,ticket_url,cover_url,status,has_contact_phone,rejection_reason,admin_hidden,is_demo";

type Raw = Omit<OwnerEvent, "category" | "price_try" | "status" | "has_contact_phone" | "admin_hidden" | "is_demo"> & {
  category: string;
  price_try: unknown;
  status: string;
  has_contact_phone?: boolean | null;
  admin_hidden?: boolean | null;
  is_demo?: boolean | null;
};

export function toOwnerEvent(r: Raw): OwnerEvent {
  const price = r.price_try === null || r.price_try === undefined ? null : Number(r.price_try);
  return {
    ...r,
    slug: r.slug ?? "",
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    district_id: r.district_id ?? null,
    venue_business_id: r.venue_business_id ?? null,
    business_id: r.business_id ?? null,
    created_by: r.created_by ?? null,
    rejection_reason: r.rejection_reason ?? null,
    category: parseEventCategory(r.category) ?? DEFAULT_EVENT_CATEGORY,
    price_try: price !== null && Number.isFinite(price) ? price : null,
    status: parseEventStatus(r.status),
    has_contact_phone: r.has_contact_phone === true,
    admin_hidden: r.admin_hidden === true,
    is_demo: r.is_demo === true,
  };
}
