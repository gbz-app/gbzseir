"use client";

import { createClient } from "@/lib/supabase/client";
import { RPC, rpcArgs } from "@/lib/db-contract";

/**
 * Phone OTP helpers (login = signup). Phones are always E.164 (+905XXXXXXXXX).
 * Every function resolves to { error: string | null } with a friendly Turkish message instead of throwing.
 */

type AuthLikeError = { code?: string; status?: number; message?: string; name?: string } | null | undefined;

/** Turkish, user-friendly message for Supabase auth errors. */
export function authErrorMessage(err: AuthLikeError, context: "send" | "verify" = "send"): string {
  if (!err) return "Bir şeyler ters gitti. Lütfen tekrar dene.";
  const code = err.code ?? "";
  const msg = (err.message ?? "").toLowerCase();
  const wait = msg.match(/after (\d+) seconds?/);
  if (wait) return `Yeni kod isteyebilmek için ${wait[1]} saniye beklemelisin.`;
  if (code === "captcha_failed" || msg.includes("captcha")) return "Güvenlik doğrulaması geçilemedi. Sayfayı yenileyip tekrar dene.";
  if (code === "over_sms_send_rate_limit" || code === "over_request_rate_limit" || err.status === 429 || msg.includes("rate limit"))
    return "Çok fazla deneme, lütfen biraz sonra tekrar dene.";
  if (code === "otp_expired" || msg.includes("expired") || msg.includes("invalid") || code === "invalid_credentials")
    return context === "verify" ? "Kod hatalı ya da süresi dolmuş. Kontrol edip tekrar dene." : "Numara geçersiz görünüyor.";
  if (code === "sms_send_failed" || code.startsWith("hook_") || msg.includes("sms")) return "SMS gönderilemedi. Lütfen biraz sonra tekrar dene.";
  if (code === "phone_provider_disabled" || code === "otp_disabled" || code === "signup_disabled")
    return "Telefonla giriş şu an kullanılamıyor. Lütfen daha sonra tekrar dene.";
  if (code === "phone_exists") return "Bu numara başka bir hesapta kayıtlı.";
  if (code === "same_phone" || msg.includes("same")) return "Bu zaten mevcut numaran.";
  if (code === "user_banned") return "Bu hesap askıya alınmış. Destek ekibiyle iletişime geç.";
  if (code === "validation_failed" || msg.includes("phone")) return "Geçerli bir cep telefonu numarası gir.";
  if (err.name === "AuthRetryableFetchError" || msg.includes("fetch") || msg.includes("network"))
    return "Bağlantı sorunu. İnternetini kontrol edip tekrar dene.";
  return "Bir şeyler ters gitti. Lütfen tekrar dene.";
}

/** Send the login/signup code. `captchaToken` comes from the Turnstile widget (only sent when present). */
export async function sendLoginOtp(phone: string, captchaToken?: string): Promise<{ error: string | null }> {
  try {
    const { error } = await createClient().auth.signInWithOtp({
      phone,
      options: { shouldCreateUser: true, channel: "sms", ...(captchaToken ? { captchaToken } : {}) },
    });
    return { error: error ? authErrorMessage(error, "send") : null };
  } catch (e) {
    return { error: authErrorMessage(e as AuthLikeError, "send") };
  }
}

/** Verify the login/signup code. On success the session cookie is set. */
export async function verifyLoginOtp(phone: string, token: string): Promise<{ error: string | null; userId: string | null }> {
  try {
    const { data, error } = await createClient().auth.verifyOtp({ phone, token, type: "sms" });
    if (error) return { error: authErrorMessage(error, "verify"), userId: null };
    return { error: null, userId: data.user?.id ?? data.session?.user.id ?? null };
  } catch (e) {
    return { error: authErrorMessage(e as AuthLikeError, "verify"), userId: null };
  }
}

/** Start a phone number change for the signed-in user (sends a code to the NEW number). */
export async function sendPhoneChangeOtp(phone: string): Promise<{ error: string | null }> {
  try {
    const { error } = await createClient().auth.updateUser({ phone });
    return { error: error ? authErrorMessage(error, "send") : null };
  } catch (e) {
    return { error: authErrorMessage(e as AuthLikeError, "send") };
  }
}

/** Confirm the phone change with the code sent to the new number. */
export async function verifyPhoneChangeOtp(phone: string, token: string): Promise<{ error: string | null }> {
  try {
    const { error } = await createClient().auth.verifyOtp({ phone, token, type: "phone_change" });
    return { error: error ? authErrorMessage(error, "verify") : null };
  } catch (e) {
    return { error: authErrorMessage(e as AuthLikeError, "verify") };
  }
}

/**
 * DEMO MODE ONLY: read the last code captured by the Send-SMS hook (rpc get_demo_otp).
 * Tries E.164 and the digits-only form. Returns the 6-digit code or null.
 */
export async function fetchDemoOtp(phone: string): Promise<string | null> {
  const supabase = createClient();
  const candidates = Array.from(new Set([phone, phone.replace(/^\+/, "")]));
  for (const p of candidates) {
    try {
      const { data, error } = await supabase.rpc(RPC.getDemoOtp, rpcArgs.getDemoOtp(p));
      if (error || data === null || data === undefined) continue;
      const m = (typeof data === "string" ? data : JSON.stringify(data)).match(/\b\d{6}\b/);
      if (m) return m[0];
    } catch {
      /* try next form */
    }
  }
  return null;
}

/** Remember the optional marketing checkbox from /giris until the profile exists. */
export const MARKETING_CONSENT_SESSION_KEY = "gebzem.pendingMarketingConsent";
