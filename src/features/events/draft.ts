/** Event wizard draft (pure TS: the server page builds it for edits, the wizard keeps it in localStorage). */
import { formatPhoneInputTR } from "@/core/phone";
import { amountInput, istanbulParts } from "@/features/business/lib/form-utils";
import type { OwnerEvent } from "./owner-event";

/** `organizer` value of an event created in the user's own name (not as a business). */
export const SELF = "self";

export type EventPin = { lat: number; lng: number };
export type EventCover = { url: string; path: string | null };

export type EventDraft = {
  /** SELF, a business id, or null while not chosen yet. */
  organizer: string | null;
  category: string | null;
  title: string;
  description: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  /** "business": at the organizer business; "custom": a place entered by hand. */
  place: "business" | "custom";
  venueName: string;
  address: string;
  pin: EventPin | null;
  /** District slug (districts.id) of a custom place; a confirmed pin sets it. Missing in drafts saved before the Kocaeli update. */
  districtId: string | null;
  cover: EventCover | null;
  /** null = not chosen yet. */
  paid: boolean | null;
  price: string;
  priceNote: string;
  ticketUrl: string;
  /** Contact phone of a user event, as typed. */
  phone: string;
};

export function emptyEventDraft(organizer: string | null): EventDraft {
  return {
    organizer,
    category: null,
    title: "",
    description: "",
    startDate: "",
    startTime: "20:00",
    endDate: "",
    endTime: "",
    place: organizer && organizer !== SELF ? "business" : "custom",
    venueName: "",
    address: "",
    pin: null,
    districtId: null,
    cover: null,
    paid: null,
    price: "",
    priceNote: "",
    ticketUrl: "",
    phone: "",
  };
}

/** Draft of an existing event (edit mode). `phone`: its contact phone (reveal_event_phone as the owner). */
export function draftFromEvent(e: OwnerEvent, phone: string | null): EventDraft {
  const start = istanbulParts(e.starts_at);
  const end = e.ends_at ? istanbulParts(e.ends_at) : null;
  const atBusiness = !!e.business_id && e.venue_business_id === e.business_id;
  return {
    organizer: e.business_id ?? SELF,
    category: e.category,
    title: e.title,
    description: e.description ?? "",
    startDate: start.date,
    startTime: start.time,
    endDate: end && end.date !== start.date ? end.date : "",
    endTime: end?.time ?? "",
    place: atBusiness ? "business" : "custom",
    venueName: atBusiness ? "" : (e.venue_name ?? ""),
    address: atBusiness ? "" : (e.address ?? ""),
    pin: !atBusiness && e.lat != null && e.lng != null ? { lat: e.lat, lng: e.lng } : null,
    districtId: atBusiness ? null : e.district_id,
    cover: e.cover_url ? { url: e.cover_url, path: null } : null,
    paid: !e.is_free,
    price: amountInput(e.price_try),
    priceNote: e.price_note ?? "",
    ticketUrl: e.ticket_url ?? "",
    phone: phone ? formatPhoneInputTR(phone) : "",
  };
}
