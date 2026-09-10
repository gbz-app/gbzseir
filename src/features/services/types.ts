/**
 * Types of the services module (service_categories rows and the JSON payloads of the service RPCs).
 * Shapes follow docs/contracts/db-contract.md; RPCs return `Json`, these types narrow them.
 */
import type { FlowAnswerValue } from "@/core/flow";

export type WhenType = "acil" | "bu_hafta" | "tarih" | "esnek";

export type RequestStatus = "admin_review" | "open" | "filled" | "closed_hired" | "closed_cancelled" | "expired" | "no_match";

export type LeadStatus = "sent" | "seen" | "accepted" | "declined" | "closed_full" | "removed_by_customer";

/** Row of service_categories (subset used by the UI). */
export type ServiceCategory = {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  synonyms: string[];
  sort: number;
  popular: boolean;
  max_providers: number;
  auto_dispatch: boolean;
};

/** Top-level category with its active sub-categories. */
export type ServiceParent = ServiceCategory & { children: ServiceCategory[] };

export type ServiceCatalog = {
  parents: ServiceParent[];
  /** All active sub-categories (with their parent), sorted by parent then sort. */
  subs: Array<ServiceCategory & { parent: ServiceCategory }>;
};

/** One answer resolved by the DB (private.resolve_answers). */
export type ResolvedAnswer = {
  id: string;
  title: string;
  type: string;
  value: FlowAnswerValue;
  display: string | null;
};

/** Firm that accepted a request (get_request_for_customer.providers). */
export type ProviderView = {
  lead_id: string;
  status: "accepted";
  offer_price_try: number | null;
  offer_note: string | null;
  accepted_at: string | null;
  business: {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    rating_avg: number | null;
    rating_count: number | null;
    verification_level: number;
    phone: string | null;
    category_label: string | null;
  };
};

/** get_request_for_customer payload. */
export type CustomerRequestView = {
  request: {
    id: string;
    public_code: string;
    status: RequestStatus;
    category: { id: string; name: string; slug: string; icon: string | null; parent_name: string | null; parent_slug: string | null };
    neighbourhood: { id: string; name: string; district: string | null } | null;
    address_note: string | null;
    when_type: WhenType;
    when_date: string | null;
    note: string | null;
    photos: string[];
    hide_phone: boolean;
    answers: ResolvedAnswer[];
    accepted_count: number;
    max_providers: number;
    sent_count: number;
    hired_business_id: string | null;
    created_at: string;
    closed_at: string | null;
  };
  providers: ProviderView[];
  review: { id: string; rating: number; comment: string | null; reply: string | null; created_at: string } | null;
};

/** get_lead_detail payload. */
export type LeadDetailView = {
  lead: {
    id: string;
    business_id: string;
    status: LeadStatus;
    offer_price_try: number | null;
    offer_note: string | null;
    wave_no: number;
    seen_at: string | null;
    accepted_at: string | null;
    created_at: string;
  };
  request: {
    id: string;
    status: RequestStatus;
    category: { id: string; name: string; slug: string; icon: string | null; parent_name: string | null };
    neighbourhood: { id: string; name: string; district: string | null; lat: number | null; lng: number | null } | null;
    when_type: WhenType;
    when_date: string | null;
    note: string | null;
    photos: string[];
    answers: ResolvedAnswer[];
    accepted_count: number;
    max_providers: number;
    address_note: string | null;
    created_at: string;
  };
  customer: { display_name: string | null; phone: string | null; hide_phone: boolean };
  can_accept: boolean;
};

/** Row of the my_leads view (all columns are nullable in the generated view type). */
export type MyLeadRow = {
  id: string;
  request_id: string;
  business_id: string;
  status: LeadStatus;
  offer_price_try: number | null;
  offer_note: string | null;
  wave_no: number | null;
  seen_at: string | null;
  accepted_at: string | null;
  created_at: string;
  request_status: RequestStatus;
  when_type: WhenType;
  when_date: string | null;
  accepted_count: number;
  max_providers: number;
  request_created_at: string;
  category_id: string;
  category_name: string;
  category_slug: string;
  category_icon: string | null;
  neighbourhood_id: string | null;
  neighbourhood_name: string | null;
  photo_count: number;
  has_note: boolean;
};

export type SubmitRequestResult = { id: string; public_code: string; status: RequestStatus; lead_count: number };

export type AcceptLeadResult =
  | {
      ok: true;
      customer_name: string;
      customer_phone: string | null;
      hide_phone: boolean;
      accepted_count: number;
      max_providers: number;
      already?: true;
    }
  | { ok: false; reason: "full" | "closed" | "removed" | "declined" | "business_not_approved" | "not_found" };

export type OkResult<R extends string = string> = { ok: true; [k: string]: unknown } | { ok: false; reason: R };
