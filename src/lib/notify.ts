import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { TABLES } from "@/lib/db-contract";
import { istanbulParts } from "@/core/time";

/**
 * Server-side notifications (public app only: needs the service role). Inserts one unsent notifications row and leaves
 * delivery to the single push path every notification uses: the notifications_push_webhook trigger calls
 * /api/notifications/push, which claims the row (claim_push_notifications) and sends the Web Push; the pg_cron job
 * gebzem-push-retry retries failed or missed sends (max 3 attempts within 6 hours, 2026091341_push_retry.sql).
 * Push payloads contain ONLY title/body/link (push services are outside Turkey: no phone numbers, addresses,
 * coordinates or names in title/body beyond what the user must see).
 */

export type NotifyInput = {
  /**
   * Machine type, e.g. 'lead_new', 'listing_approved', 'business_approved'. Service request types written by the DB
   * (texts in the SQL functions, pushed by /api/notifications/push): lead_new, lead_reopened (a slot opened again),
   * request_created, request_expired (14 days, in-app only at night), and the admin-only request_review,
   * request_no_match, request_stalled (next wave found no firm; /admin links are never pushed).
   */
  type: string;
  title: string;
  body: string;
  /** Internal path built with core/routes (opened on click). */
  link?: string | null;
  /**
   * true: between 22:00 and 08:00 Istanbul the notice is in-app only (push_sent_at set, so the sender skips it), the
   * same rule as private.is_quiet_hours() for the DB's night notices. Default: pushed at any hour.
   */
  quietAtNight?: boolean;
};

export type NotifyResult = { notificationId: string | null };

/** 22:00-08:00 Europe/Istanbul (same as private.is_quiet_hours()). */
export function isQuietHours(at: Date = new Date()): boolean {
  const hour = istanbulParts(at).hour;
  return hour < 8 || hour >= 22;
}

/** Create an in-app notification; the DB trigger pushes it to the user's devices. Never throws. */
export async function notifyUser(userId: string, input: NotifyInput): Promise<NotifyResult> {
  try {
    const { data, error } = await createAdminClient()
      .from(TABLES.notifications)
      .insert({
        user_id: userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
        // null = the trigger / retry job delivers it; a timestamp = in-app only.
        push_sent_at: input.quietAtNight && isQuietHours() ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[notify] insert failed", error.code, error.message);
      return { notificationId: null };
    }
    return { notificationId: data?.id ?? null };
  } catch (e) {
    console.error("[notify] insert failed", e);
    return { notificationId: null };
  }
}
