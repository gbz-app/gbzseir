import { z } from "zod";

/** Any 8-4-4-4-12 hex id (seeded ids are not always RFC-4122 v4, so z.uuid() would be too strict). */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const zId = z.string().regex(UUID_RE, "Geçersiz kimlik.");

/** First Turkish message of a zod error. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Girilen bilgiler geçersiz.";
}
