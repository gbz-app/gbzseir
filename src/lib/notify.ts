import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/db-contract";

/**
 * Server-side notifications: in-app row (notifications table) + Web Push to every subscription of the user.
 * Push payloads contain ONLY title/body/link (push services are outside Turkey: no phone numbers, addresses,
 * coordinates or names in title/body beyond what the user must see).
 */

export type NotifyInput = {
  /** Machine type, e.g. 'lead_new', 'listing_approved', 'business_approved'. */
  type: string;
  title: string;
  body: string;
  /** Internal path built with core/routes (opened on click). */
  link?: string | null;
};

export type NotifyResult = { notificationId: string | null; pushed: number; removed: number; failed: number };

let vapidReady: boolean | null = null;
function ensureVapid(): boolean {
  if (vapidReady !== null) return vapidReady;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:info@aksedigital.com";
  if (!pub || !priv) {
    vapidReady = false;
    return false;
  }
  webpush.setVapidDetails(subject, pub, priv);
  vapidReady = true;
  return true;
}

type SubRow = { id?: string; endpoint: string; p256dh: string; auth: string };

/** Send a push to all subscriptions of a user; removes gone (404/410) subscriptions. */
export async function sendPushToUser(userId: string, payload: { title: string; body: string; link?: string | null; tag?: string }) {
  const result = { pushed: 0, removed: 0, failed: 0 };
  if (!ensureVapid()) return result;
  const admin = createAdminClient();
  const { data, error } = await admin.from(TABLES.pushSubscriptions).select("id, endpoint, p256dh, auth").eq("user_id", userId);
  if (error || !data?.length) return result;
  const body = JSON.stringify({ title: payload.title, body: payload.body, link: payload.link ?? "/", tag: payload.tag });
  await Promise.all(
    (data as SubRow[]).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          TTL: 60 * 60 * 24,
          urgency: "normal",
        });
        result.pushed++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from(TABLES.pushSubscriptions).delete().eq("endpoint", s.endpoint);
          result.removed++;
        } else {
          result.failed++;
        }
      }
    }),
  );
  return result;
}

/** Create an in-app notification and push it to the user's devices. Never throws. */
export async function notifyUser(userId: string, input: NotifyInput): Promise<NotifyResult> {
  let notificationId: string | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from(TABLES.notifications)
      // push_sent_at is set because this function pushes itself below; otherwise the notifications_push_webhook
      // trigger (-> /api/notifications/push) would send the same notification a second time.
      .insert({ user_id: userId, type: input.type, title: input.title, body: input.body, link: input.link ?? null, push_sent_at: new Date().toISOString() })
      .select("id")
      .single();
    notificationId = (data as { id?: string } | null)?.id ?? null;
  } catch {
    /* keep going: push is best effort too */
  }
  try {
    const push = await sendPushToUser(userId, { title: input.title, body: input.body, link: input.link, tag: input.type });
    return { notificationId, ...push };
  } catch {
    return { notificationId, pushed: 0, removed: 0, failed: 1 };
  }
}
