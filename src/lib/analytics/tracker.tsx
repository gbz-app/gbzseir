"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * First-party, cookie-less usage analytics (KVKK-friendly: pathname only, no query strings, no IP, no fingerprint).
 * - A session id lives in localStorage and rotates after 30 minutes of inactivity.
 * - Every route change -> track_page_view; a heartbeat every minute while visible -> "online now" + duration.
 * - PWA installs: the `appinstalled` event (Android/desktop) and the first standalone launch (iOS).
 * Admin pages are never tracked (also filtered in the RPC).
 */

const SESSION_KEY = "gebzem.analytics.session";
const INSTALL_KEY = "gebzem.analytics.installed";
const IDLE_MS = 30 * 60_000;

type Stored = { id: string; last: number };

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
}

function sessionId(): string {
  const now = Date.now();
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const s = raw ? (JSON.parse(raw) as Stored) : null;
    const id = s && now - s.last < IDLE_MS ? s.id : newId();
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id, last: now }));
    return id;
  } catch {
    return newId();
  }
}

function touch(id: string) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ id, last: Date.now() }));
  } catch {
    /* private mode */
  }
}

function isStandalone(): boolean {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function deviceMeta() {
  const ua = navigator.userAgent;
  const isTablet = /iPad|Tablet|(Android(?!.*Mobile))/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const device = isTablet ? "tablet" : /Mobi|Android|iPhone|iPod/i.test(ua) ? "mobile" : "desktop";
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac OS X/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "Diğer";
  const browser = /SamsungBrowser/i.test(ua) ? "Samsung" : /Edg\//i.test(ua) ? "Edge" : /OPR\//i.test(ua) ? "Opera" : /Firefox|FxiOS/i.test(ua) ? "Firefox" : /CriOS|Chrome/i.test(ua) ? "Chrome" : /Safari/i.test(ua) ? "Safari" : "Diğer";
  let ref: string | null = null;
  try {
    const r = document.referrer ? new URL(document.referrer) : null;
    ref = r && r.host !== window.location.host ? r.host.replace(/^www\./, "") : null;
  } catch {
    ref = null;
  }
  return { device, os, browser, ref, standalone: isStandalone() };
}

function installPlatform(): "pwa_android" | "pwa_ios" | "pwa_desktop" {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "pwa_android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "pwa_ios";
  return "pwa_desktop";
}

export function AnalyticsTracker() {
  const pathname = usePathname();
  const supabase = React.useMemo(() => createClient(), []);
  const firstRef = React.useRef(true);

  // Page views
  React.useEffect(() => {
    if (!pathname || pathname.startsWith("/admin") || pathname === "/offline") return;
    const id = sessionId();
    const meta = firstRef.current ? deviceMeta() : { standalone: isStandalone() };
    firstRef.current = false;
    void supabase.rpc("track_page_view", { p_session: id, p_path: pathname, p_meta: meta }).then(
      () => undefined,
      () => undefined,
    );
  }, [pathname, supabase]);

  // Heartbeat + installs
  React.useEffect(() => {
    const beat = () => {
      if (document.visibilityState !== "visible" || window.location.pathname.startsWith("/admin")) return;
      const id = sessionId();
      touch(id);
      void supabase.rpc("track_heartbeat", { p_session: id }).then(
        () => undefined,
        () => undefined,
      );
    };
    const timer = window.setInterval(beat, 60_000);
    document.addEventListener("visibilitychange", beat);

    const install = (source: "appinstalled" | "standalone") => {
      try {
        if (localStorage.getItem(INSTALL_KEY)) return;
        localStorage.setItem(INSTALL_KEY, new Date().toISOString());
      } catch {
        /* ignore */
      }
      void supabase.rpc("track_install", { p_session: sessionId(), p_platform: installPlatform(), p_source: source }).then(
        () => undefined,
        () => undefined,
      );
    };
    const onInstalled = () => install("appinstalled");
    window.addEventListener("appinstalled", onInstalled);
    if (isStandalone()) install("standalone");

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [supabase]);

  return null;
}
