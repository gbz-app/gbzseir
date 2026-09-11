import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * Shared-secret check for cron and DB webhook routes. The secret is CRON_SECRET (Vercel env); the pg_net callers read
 * the same value from Supabase Vault ('gebzem_push_webhook_secret'). Accepts the given header or
 * `Authorization: Bearer <CRON_SECRET>` (Vercel Cron).
 */
export function isCronAuthorized(req: Request, header = "x-cron-secret"): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = req.headers.get(header) ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
