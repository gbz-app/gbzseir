/**
 * Client-side platform detection. All functions are safe to call during SSR (they return false).
 */

function nav(): (Navigator & { standalone?: boolean; userAgentData?: { mobile?: boolean } }) | null {
  return typeof navigator === "undefined" ? null : (navigator as Navigator & { standalone?: boolean });
}

/** iPhone / iPod / iPad (including iPadOS that reports itself as a Mac). */
export function isIOS(): boolean {
  const n = nav();
  if (!n) return false;
  const ua = n.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && typeof n.maxTouchPoints === "number" && n.maxTouchPoints > 1;
}

export function isAndroid(): boolean {
  const n = nav();
  return !!n && /Android/i.test(n.userAgent || "");
}

/** Safari on iOS (the browser that offers "Ana Ekrana Ekle" with full PWA support). */
export function isIOSSafari(): boolean {
  const n = nav();
  if (!n || !isIOS()) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser|GSA\//.test(n.userAgent || "");
}

/** Running as an installed app (home-screen / standalone window). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
  } catch {
    /* ignore */
  }
  return nav()?.standalone === true;
}

/** Phone/tablet-like device (coarse pointer or mobile UA). Used to decide tel: vs. "show number". */
export function isMobileDevice(): boolean {
  const n = nav();
  if (!n) return false;
  if (n.userAgentData?.mobile) return true;
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(n.userAgent || "")) return true;
  try {
    return window.matchMedia("(pointer: coarse)").matches && window.matchMedia("(hover: none)").matches;
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
