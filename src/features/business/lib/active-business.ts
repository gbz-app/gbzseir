/** Which of the owner's businesses the panel (/isletme) shows. Pure TS: shared by server code and route handlers. */

/** httpOnly cookie holding the id of the active business (validated against the owned list on every read). */
export const ACTIVE_BUSINESS_COOKIE = "gbz_biz";
export const ACTIVE_BUSINESS_MAX_AGE = 60 * 60 * 24 * 365;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isBusinessId = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/** The remembered business when the user still owns it, else the first approved one, else the first (oldest). */
export function pickActiveBusiness<T extends { id: string; status: string }>(list: T[], rememberedId: string | null | undefined): T | null {
  return list.find((b) => b.id === rememberedId) ?? list.find((b) => b.status === "approved") ?? list[0] ?? null;
}

export const activeBusinessCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: ACTIVE_BUSINESS_MAX_AGE,
};
