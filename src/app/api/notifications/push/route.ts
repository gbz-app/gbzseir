import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/notify";

/**
 * Web Push sender for `notifications` rows (services module).
 *
 * Called by the DB trigger `notifications_push_webhook` through pg_net after every notifications insert
 * (secret in header `x-push-secret`, stored in Supabase Vault as 'gebzem_push_webhook_secret' = CRON_SECRET).
 * A Vercel Cron (GET with `Authorization: Bearer <CRON_SECRET>`) may also call it as a safety net.
 *
 * Rows with push_sent_at IS NULL from the last 30 minutes are claimed atomically (UPDATE ... WHERE push_sent_at
 * IS NULL RETURNING), so concurrent invocations never send the same notification twice.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const WINDOW_MS = 30 * 60 * 1000;
const BATCH = 100;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = req.headers.get("x-push-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });

  const admin = createAdminClient();
  const since = new Date(Date.now() - WINDOW_MS).toISOString();
  const { data: pending, error } = await admin
    .from("notifications")
    .select("id")
    .is("push_sent_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) return NextResponse.json({ ok: false, error: "Bildirimler okunamadı" }, { status: 500 });
  if (!pending?.length) return NextResponse.json({ ok: true, claimed: 0, pushed: 0, removed: 0, failed: 0 }, { headers: { "Cache-Control": "no-store" } });

  const { data: claimed, error: claimError } = await admin
    .from("notifications")
    .update({ push_sent_at: new Date().toISOString() })
    .in(
      "id",
      pending.map((p) => p.id),
    )
    .is("push_sent_at", null)
    .select("id, user_id, type, title, body, link");
  if (claimError) return NextResponse.json({ ok: false, error: "Bildirimler işaretlenemedi" }, { status: 500 });

  const totals = { pushed: 0, removed: 0, failed: 0 };
  await Promise.all(
    (claimed ?? []).map(async (n) => {
      // Admin notices live in the separate admin site's dashboard; never push them to the app.
      if (n.link?.startsWith("/admin")) return;
      try {
        const r = await sendPushToUser(n.user_id, { title: n.title, body: n.body ?? "", link: n.link, tag: `${n.type}-${n.id}` });
        totals.pushed += r.pushed;
        totals.removed += r.removed;
        totals.failed += r.failed;
      } catch {
        totals.failed += 1;
      }
    }),
  );

  return NextResponse.json({ ok: true, claimed: claimed?.length ?? 0, ...totals }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = handle;
export const GET = handle;
