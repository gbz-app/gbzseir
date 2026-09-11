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
 * concurrent invocations never send the same notification twice. push_sent_at is set only after a device got the push
 * (admin notices are never pushed and count as handled). Outcomes:
 * - sent: push_sent_at set.
 * - parked: the user has no live subscription. push_sent_at stays null with push_error 'no_subscription'; the row is
 *   claimed again only when the user subscribes (the push_subscriptions_flush trigger calls this route), while it is
 *   unread and younger than 24 hours (see 2026091365_service_dispatch_fix.sql).
 * - failed: push_error set, retried by the cron job, at most 3 attempts within 24 hours.
 * Subscriptions answering 404/410 are deleted.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const BATCH = 100;
/** Must match the parked rule in claim_push_notifications. */
const NO_SUBSCRIPTION = "no_subscription";

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

/**
 * Real web push services only. The push_subscriptions CHECK constraint (2026091369_security_hardening.sql) already
 * enforces this on write; checking again here means an old or hand-edited row can never make the server post elsewhere.
 */
const PUSH_HOST_RE = /^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)$/;
function isPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

/** Short, storable error text: the status code and a generic reason only, never the push service's response body. */
function errorText(e: unknown): string {
  const err = e as { statusCode?: number; message?: string };
  if (err.statusCode) return `HTTP ${err.statusCode}`;
  return (err.message || "bilinmeyen hata").toString().trim().slice(0, 120);
}

async function handle(req: Request) {
  if (!isCronAuthorized(req, "x-push-secret")) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
  // Without VAPID keys nothing is claimed, so the rows are still pending once the keys are set.
  if (!ensureVapid()) return NextResponse.json({ ok: false, error: "VAPID anahtarları eksik" }, { status: 503 });

  const admin = createAdminClient();
  const { data: claimed, error } = await admin.rpc("claim_push_notifications", { p_limit: BATCH });
  if (error) return NextResponse.json({ ok: false, error: "Bildirimler alınamadı" }, { status: 500 });
  const rows: Claimed[] = claimed ?? [];
  const totals = { claimed: rows.length, sent: 0, pushed: 0, removed: 0, parked: 0, failed: 0 };
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
        if (gone.has(s.endpoint) || !isPushEndpoint(s.endpoint)) return;
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
    // Sent only when a device got it (a retry would duplicate it there). No live subscription: park the row until the
    // user subscribes, never mark it sent.
    if (delivered > 0) return { ok: true };
    return { ok: false, error: errors[0] ?? NO_SUBSCRIPTION };
  };

  const outcomes = await Promise.all(rows.map(async (n) => ({ id: n.id, outcome: await send(n).catch((e): Outcome => ({ ok: false, error: errorText(e) })) })));
  totals.removed = gone.size;

  const sentIds = outcomes.filter((o) => o.outcome.ok).map((o) => o.id);
  const failedByError = new Map<string, string[]>();
  for (const o of outcomes) if (!o.outcome.ok) failedByError.set(o.outcome.error, [...(failedByError.get(o.outcome.error) ?? []), o.id]);
  totals.sent = sentIds.length;
  totals.parked = failedByError.get(NO_SUBSCRIPTION)?.length ?? 0;
  totals.failed = rows.length - sentIds.length - totals.parked;

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
