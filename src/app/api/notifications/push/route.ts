import { NextResponse } from "next/server";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/db-contract";
import { isCronAuthorized } from "@/lib/server/cron-auth";

/**
 * Web Push sender for `notifications` rows (services module).
 *
 * Called by the DB trigger `notifications_push_webhook` through pg_net after every notifications insert, and every
 * 10 minutes by the pg_cron job `gebzem-push-retry` as a safety net (secret in header `x-push-secret`, stored in
 * Supabase Vault as 'gebzem_push_webhook_secret' = CRON_SECRET). A Vercel Cron (Bearer CRON_SECRET) may also call it.
 *
 * Rows are claimed with the claim_push_notifications RPC (attempts + 1 and a 5 minute lease, FOR UPDATE SKIP LOCKED), so
 * concurrent invocations never send the same notification twice. push_sent_at is set only after the push went out
 * (or there was nothing to deliver); a failed row keeps it null with push_error and is retried, at most 3 attempts.
 * Subscriptions answering 404/410 are deleted.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BATCH = 100;

type Claimed = { id: string; user_id: string; type: string; title: string; body: string | null; link: string | null; push_attempts: number };
type Sub = { endpoint: string; p256dh: string; auth: string };
type Outcome = { ok: true } | { ok: false; error: string };

type Admin = ReturnType<typeof createAdminClient>;
const markRows = (admin: Admin, ids: string[], patch: { push_sent_at?: string; push_error: string | null }) =>
  admin.from(TABLES.notifications).update(patch).in("id", ids);

let vapidReady: boolean | null = null;
function ensureVapid(): boolean {
  if (vapidReady !== null) return vapidReady;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return (vapidReady = false);
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:info@aksedigital.com", pub, priv);
    return (vapidReady = true);
  } catch {
    console.error("[push] invalid VAPID keys");
    return (vapidReady = false);
  }
}

/** Short, storable error text (push services put no personal data in their answers). */
function errorText(e: unknown): string {
  const err = e as { statusCode?: number; body?: string; message?: string };
  const detail = (err.body || err.message || "bilinmeyen hata").toString().trim();
  return (err.statusCode ? `HTTP ${err.statusCode}: ${detail}` : detail).slice(0, 300);
}

async function handle(req: Request) {
  if (!isCronAuthorized(req, "x-push-secret")) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
  // Without VAPID keys nothing is claimed, so the rows are still pending once the keys are set.
  if (!ensureVapid()) return NextResponse.json({ ok: false, error: "VAPID anahtarları eksik" }, { status: 503 });

  const admin = createAdminClient();
  const { data: claimed, error } = await admin.rpc("claim_push_notifications", { p_limit: BATCH });
  if (error) return NextResponse.json({ ok: false, error: "Bildirimler alınamadı" }, { status: 500 });
  const rows: Claimed[] = claimed ?? [];
  const totals = { claimed: rows.length, sent: 0, pushed: 0, removed: 0, failed: 0 };
  if (!rows.length) return NextResponse.json({ ok: true, ...totals }, { headers: { "Cache-Control": "no-store" } });

  const userIds = [...new Set(rows.map((n) => n.user_id))];
  const { data: subRows, error: subError } = await admin.from(TABLES.pushSubscriptions).select("user_id, endpoint, p256dh, auth").in("user_id", userIds);
  const subsByUser = new Map<string, Sub[]>();
  for (const s of subRows ?? []) subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s]);
  const gone = new Set<string>();

  const send = async (n: Claimed): Promise<Outcome> => {
    // Admin notices live in the separate admin site's dashboard; never push them to the app.
    if (n.link?.startsWith("/admin")) return { ok: true };
    if (subError) return { ok: false, error: "Abonelikler okunamadı" };
    const payload = JSON.stringify({ title: n.title, body: n.body ?? "", link: n.link ?? "/", tag: `${n.type}-${n.id}` });
    let delivered = 0;
    const errors: string[] = [];
    await Promise.all(
      (subsByUser.get(n.user_id) ?? []).map(async (s) => {
        if (gone.has(s.endpoint)) return;
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
            TTL: 60 * 60 * 24,
            urgency: "normal",
            // A hanging push service must not eat the whole function time (the claim lease retries it anyway).
            timeout: 10_000,
          });
          delivered += 1;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            if (!gone.has(s.endpoint)) {
              gone.add(s.endpoint);
              await admin.from(TABLES.pushSubscriptions).delete().eq("endpoint", s.endpoint);
            }
          } else {
            errors.push(errorText(e));
          }
        }
      }),
    );
    totals.pushed += delivered;
    // Sent when a device got it; no (live) subscription means there is nothing to deliver.
    return delivered > 0 || !errors.length ? { ok: true } : { ok: false, error: errors[0] };
  };

  const outcomes = await Promise.all(rows.map(async (n) => ({ id: n.id, outcome: await send(n).catch((e): Outcome => ({ ok: false, error: errorText(e) })) })));
  totals.removed = gone.size;

  const sentIds = outcomes.filter((o) => o.outcome.ok).map((o) => o.id);
  const failedByError = new Map<string, string[]>();
  for (const o of outcomes) if (!o.outcome.ok) failedByError.set(o.outcome.error, [...(failedByError.get(o.outcome.error) ?? []), o.id]);
  totals.sent = sentIds.length;
  totals.failed = rows.length - sentIds.length;

  const writes = [
    ...(sentIds.length ? [markRows(admin, sentIds, { push_sent_at: new Date().toISOString(), push_error: null })] : []),
    ...[...failedByError].map(([err, ids]) => markRows(admin, ids, { push_error: err })),
  ];
  const results = await Promise.all(writes);
  if (results.some((r) => r.error)) return NextResponse.json({ ok: false, error: "Bildirim durumu kaydedilemedi", ...totals }, { status: 500 });

  if (totals.failed) console.error(`[push] ${totals.failed} notification(s) not delivered, will retry (max 3 attempts)`);
  return NextResponse.json({ ok: true, ...totals }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = handle;
export const GET = handle;
