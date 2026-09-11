import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RPC, type RevealPhoneResult } from "@/lib/db-contract";
import { OWNER_EVENT_COLUMNS, toOwnerEvent, type OwnerEvent } from "./owner-event";

export { OWNER_EVENT_COLUMNS, toOwnerEvent, type OwnerEvent } from "./owner-event";
export type { EventStatus } from "./status";

type Raw = Parameters<typeof toOwnerEvent>[0];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** All events of the owner's business (every status; RLS lets the owner read them). */
export async function getOwnerEvents(businessId: string): Promise<OwnerEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").select(OWNER_EVENT_COLUMNS).eq("business_id", businessId).order("starts_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Raw[]).map(toOwnerEvent);
}

/** Events the user created in their own name (not as a business). */
export async function getMyUserEvents(userId: string): Promise<OwnerEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select(OWNER_EVENT_COLUMNS)
    .eq("created_by", userId)
    .is("business_id", null)
    .order("starts_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Raw[]).map(toOwnerEvent);
}

/** One event the signed-in user may edit (RLS: creator, owner of its business, admin). null = not found. */
export async function getEditableEvent(id: string): Promise<OwnerEvent | null> {
  if (!UUID.test(id)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("events").select(OWNER_EVENT_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toOwnerEvent(data as unknown as Raw) : null;
}

/** Contact phone of the user's own event (the column is not readable through the API; the owner's reveal is not logged). */
export async function getOwnEventContactPhone(id: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(RPC.revealEventPhone, { p_event: id });
  const res = data as RevealPhoneResult | null;
  return !error && res?.ok ? res.phone : null;
}
