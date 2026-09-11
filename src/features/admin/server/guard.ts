import "server-only";
import { createClient, type ServerSupabase } from "@/lib/supabase/server";
import { getCurrentUser, getProfile } from "@/lib/auth/server";
import { IS_ADMIN_SITE } from "@/config/app-mode";
import { trackPublicRefresh } from "@/lib/revalidate-public";
import { fail, type ActionResult } from "../lib/action-result";

/**
 * Admin Server Action plumbing. Every action re-checks the session (actions are public POST endpoints) and
 * works with the admin's own session, so RLS / is_admin() stay the real security boundary.
 */

export type AdminContext = { supabase: ServerSupabase; userId: string };

export async function getAdminContext(): Promise<AdminContext | null> {
  // Admin actions only run on the separate admin site (their ids are compiled into the public app too).
  if (!IS_ADMIN_SITE) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") return null;
  return { supabase: await createClient(), userId: user.id };
}

/**
 * Saved, but revalidatePublic() could not reach the public app: its pages refresh on their normal schedule (up to 1 h).
 * Follows the success toast, so it does not repeat "Kaydedildi" (also fits deletes).
 */
const PUBLIC_REFRESH_WARNING = "Uygulama hemen yenilenemedi; değişiklik uygulamada bir saate kadar geç görünebilir.";

/**
 * Run an admin action: auth check, then the body; unexpected errors become a Turkish message. A public refresh that
 * failed inside the body adds a warning to the success result.
 */
export async function withAdmin<T>(fn: (ctx: AdminContext) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  let ctx: AdminContext | null = null;
  try {
    ctx = await getAdminContext();
  } catch {
    return fail("Oturum doğrulanamadı. Sayfayı yenileyip tekrar dene.", "session");
  }
  if (!ctx) return fail("Bu işlem için yönetici yetkisi gerekiyor.", "forbidden");
  const admin = ctx;
  try {
    const { result, refreshFailed } = await trackPublicRefresh(() => fn(admin));
    return refreshFailed && result.ok ? { ...result, warning: PUBLIC_REFRESH_WARNING } : result;
  } catch (e) {
    console.error("[admin action]", e);
    return fail("Beklenmeyen bir hata oluştu. Tekrar dene.", "unexpected");
  }
}

type PgError = { message?: string; code?: string; hint?: string | null; details?: string | null } | null | undefined;

/** Turkish message for a PostgREST / RPC error. RPCs raise Turkish text with a machine hint. */
export function dbErrorMessage(error: PgError, fallback = "İşlem tamamlanamadı. Tekrar dene."): string {
  if (!error) return fallback;
  if (error.hint && error.message) return error.message;
  switch (error.code) {
    case "23505":
      return "Bu değer zaten kullanılıyor; benzersiz olmalı.";
    case "23514":
      return "Girilen değer veritabanı kurallarına uymuyor.";
    case "23503":
      return "İlgili kayıt bulunamadı ya da bu kayıt başka kayıtlarda kullanılıyor.";
    case "23502":
      return "Zorunlu bir alan boş bırakılmış.";
    case "22P02":
    case "22023":
      return "Geçersiz değer gönderildi.";
    case "42501":
      return "Bu işlem için yetkin yok.";
    case "PGRST116":
      return "Kayıt bulunamadı.";
    default:
      console.error("[admin db]", error.code, error.message);
      return fallback;
  }
}

export function dbFail(error: PgError, fallback?: string): { ok: false; error: string; hint?: string } {
  return fail(dbErrorMessage(error, fallback), error?.hint ?? error?.code ?? undefined);
}
