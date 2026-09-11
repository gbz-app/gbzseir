"use client";

import { createClient } from "@/lib/supabase/client";
import { TABLES } from "@/lib/db-contract";
import { isIOS, isStandalone } from "@/lib/platform";

/**
 * Web Push (client). Permission is requested ONLY inside subscribePush(), which must be called from a
 * user gesture (button tap). On iOS push works only in the installed (home-screen) app.
 */

export type PushState = "unsupported" | "ios-needs-install" | "default" | "granted" | "denied";

export type SubscribeResult =
  | { ok: true }
  | { ok: false; reason: "unsupported" | "ios-needs-install" | "denied" | "no-sw" | "not-signed-in" | "misconfigured" | "error"; message: string };

function supported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Current capability/permission state (sync). */
export function getPushState(): PushState {
  if (typeof window === "undefined") return "unsupported";
  if (isIOS() && !isStandalone()) return "ios-needs-install";
  if (!supported()) return "unsupported";
  return Notification.permission as "default" | "granted" | "denied";
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function readyRegistration(timeoutMs = 4000): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing?.active) return existing;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
  ]);
}

/** True if this browser has a push subscription (and, when signed in, it is saved for this account). */
export async function isPushSubscribed(): Promise<boolean> {
  if (!supported()) return false;
  const reg = await readyRegistration(1500);
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return false;
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getSession();
  if (!auth.session) return true;
  const { data, error } = await supabase.from(TABLES.pushSubscriptions).select("id").eq("endpoint", sub.endpoint).maybeSingle();
  return error ? true : !!data;
}

/** Ask permission (user gesture!), subscribe and save the subscription to push_subscriptions. */
export async function subscribePush(): Promise<SubscribeResult> {
  const state = getPushState();
  if (state === "ios-needs-install")
    return { ok: false, reason: "ios-needs-install", message: "iPhone'da bildirimler için önce uygulamayı ana ekrana eklemelisin." };
  if (state === "unsupported") return { ok: false, reason: "unsupported", message: "Bu tarayıcı bildirimleri desteklemiyor." };
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapid) return { ok: false, reason: "misconfigured", message: "Bildirimler henüz yapılandırılmadı." };

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, reason: "not-signed-in", message: "Bildirim almak için giriş yapmalısın." };

  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted")
    return { ok: false, reason: "denied", message: "Bildirim izni verilmedi. Tarayıcı ayarlarından açabilirsin." };

  const reg = await readyRegistration();
  if (!reg) return { ok: false, reason: "no-sw", message: "Bildirim servisi hazır değil. Sayfayı yenileyip tekrar dene." };

  const uid = auth.user.id;
  const fresh = () => reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid) });
  const save = (sub: PushSubscription) => {
    const json = sub.toJSON();
    return supabase.from(TABLES.pushSubscriptions).upsert(
      {
        user_id: uid,
        endpoint: sub.endpoint,
        p256dh: json.keys?.p256dh ?? "",
        auth: json.keys?.auth ?? "",
        user_agent: navigator.userAgent.slice(0, 300),
      },
      { onConflict: "endpoint" },
    );
  };

  try {
    let sub = (await reg.pushManager.getSubscription()) ?? (await fresh());
    let { error } = await save(sub);
    if (error) {
      // The endpoint may still belong to another account that used this device: start over with a new one.
      await sub.unsubscribe().catch(() => undefined);
      sub = await fresh();
      ({ error } = await save(sub));
    }
    if (error) return { ok: false, reason: "error", message: "Abonelik kaydedilemedi. Lütfen tekrar dene." };
    return { ok: true };
  } catch {
    return { ok: false, reason: "error", message: "Bildirimlere abone olunamadı. Lütfen tekrar dene." };
  }
}

/**
 * Stop pushes on this device: deletes the DB row (needs the session, so call it before signing out),
 * then the browser subscription. A row left by a failed delete dies with the endpoint (sender prunes 404/410).
 * Resolves true when this device no longer receives pushes.
 */
export async function unsubscribePush(): Promise<boolean> {
  if (!supported()) return true;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return true;
    await createClient().from(TABLES.pushSubscriptions).delete().eq("endpoint", sub.endpoint);
    return await sub.unsubscribe();
  } catch {
    return false;
  }
}
