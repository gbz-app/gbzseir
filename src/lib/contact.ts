"use client";

import { createClient } from "@/lib/supabase/client";
import { RPC, rpcArgs, type ContactEventKind, type ContactSubjectType } from "@/lib/db-contract";

export type { ContactEventKind, ContactSubjectType };

/**
 * Fire-and-forget contact_event logging (call clicks, phone reveals, directions).
 * Uses fetch({keepalive:true}) straight to PostgREST so the request survives a tel: navigation
 * (sendBeacon cannot carry the Authorization header). Never throws, never blocks the call.
 */
export function logContactEvent(input: { subjectType: ContactSubjectType; subjectId: string; event?: ContactEventKind }): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon || !input.subjectId) return;
  void (async () => {
    try {
      const { data } = await createClient().auth.getSession();
      const token = data.session?.access_token ?? anon;
      await fetch(`${url}/rest/v1/rpc/${RPC.logContactEvent}`, {
        method: "POST",
        keepalive: true,
        headers: { apikey: anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(rpcArgs.logContactEvent(input.subjectType, String(input.subjectId), input.event ?? "call_click")),
      });
    } catch {
      /* logging must never break calling */
    }
  })();
}
