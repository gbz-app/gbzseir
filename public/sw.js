/* eslint-disable */
/**
 * Hand-written service worker (no Serwist). Bump VERSION whenever this file changes:
 * the page then shows "Yeni sürüm hazır - Yenile" and the new worker takes over after SKIP_WAITING.
 *
 * Rules:
 * - Navigations: network-first (3 s timeout) -> cached page (public pages only) -> /offline.
 * - Static assets (/_next/static, fonts, /icons): cache-first. Images: stale-while-revalidate (LRU).
 * - Public data under /data/* (e.g. /data/nobetci-eczane.json): stale-while-revalidate.
 * - NEVER cached: /api/*, auth pages, personal pages, any request with an Authorization header,
 *   cross-origin requests (Supabase, maps), RSC payloads, non-GET requests.
 * - A page can opt out of caching with the response header "X-SW-Cache: no".
 */
const VERSION = "v5-2026-09-11";
const PREFIX = "gebzem";
const STATIC_CACHE = `${PREFIX}-static-${VERSION}`;
const PAGES_CACHE = `${PREFIX}-pages-${VERSION}`;
const DATA_CACHE = `${PREFIX}-data-${VERSION}`;
const IMAGE_CACHE = `${PREFIX}-img-${VERSION}`;
const OFFLINE_URL = "/offline";
const NAV_TIMEOUT_MS = 3000;

const PRECACHE = [
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/badge-72.png",
  "/icons/icon.svg",
];

/** Public pages that may be kept for offline use (never personal pages). */
const PUBLIC_PAGES = [
  /^\/$/,
  /^\/nobetci-eczane\/?$/,
  /^\/yakinimda\/?$/,
  /^\/eczane\/[^/]+\/?$/,
  /^\/cami\/[^/]+\/?$/,
  /^\/durak\/[^/]+\/?$/,
  /^\/gezilecek-yerler(\/[^/]+)?\/?$/,
  /^\/ilanlar\/?$/,
  /^\/is-ilanlari\/?$/,
  /^\/ilan\/[^/]+\/?$/,
  /^\/is-ilani\/[^/]+\/?$/,
  /^\/hizmetler(\/[^/]+)?\/?$/,
  /^\/firmalar\/?$/,
  /^\/firma\/[^/]+\/?$/,
  /^\/kesfet\/[^/]+\/?$/,
  /^\/etkinlikler\/?$/,
  /^\/etkinlik\/[^/]+\/?$/,
  /^\/menu\/[^/]+\/?$/,
  /^\/haberler\/?$/,
  /^\/duyurular\/?$/,
  /^\/kaynaklar\/?$/,
  /^\/yasal\/[^/]+\/?$/,
];
// /yardim shows the signed-in user's own support messages, so it is never kept offline.
const NEVER_CACHE = [/^\/api\//, /^\/auth\//, /^\/giris/, /^\/admin/, /^\/profil/, /^\/isletme/, /^\/talep\//, /^\/ilan-ver/, /^\/hizmet-talebi/, /^\/yardim/];
const SWR_DATA = [/^\/data\//];
const LIMITS = { [PAGES_CACHE]: 60, [DATA_CACHE]: 60, [IMAGE_CACHE]: 150 };
const DROP_PARAMS = ["source", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await Promise.all(PRECACHE.map((u) => cache.add(new Request(u, { cache: "reload" })).catch(() => undefined)));
      try {
        const res = await fetch(new Request(OFFLINE_URL, { cache: "reload" }));
        if (res.ok) {
          const html = await res.clone().text();
          await cache.put(OFFLINE_URL, res);
          const assets = new Set();
          for (const m of html.matchAll(/(?:href|src)="(\/_next\/static\/[^"]+)"/g)) assets.add(m[1]);
          await Promise.all(Array.from(assets).map((a) => cache.add(a).catch(() => undefined)));
        }
      } catch (_) {
        /* offline during install: fallback text response is used */
      }
    })(),
  );
  // No automatic skipWaiting: the page asks the user first (message SKIP_WAITING).
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, PAGES_CACHE, DATA_CACHE, IMAGE_CACHE]);
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(`${PREFIX}-`) && !keep.has(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  if (type === "SKIP_WAITING") self.skipWaiting();
  // Sent on sign-out: forget cached pages/data of this device.
  if (type === "CLEAR_PAGES") event.waitUntil(Promise.all([caches.delete(PAGES_CACHE), caches.delete(DATA_CACHE)]));
});

function cacheKeyFor(url) {
  const u = new URL(url);
  for (const p of DROP_PARAMS) u.searchParams.delete(p);
  u.hash = "";
  return u.toString();
}

async function trim(cacheName) {
  const max = LIMITS[cacheName];
  if (!max) return;
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

async function offlineFallback() {
  const hit = await caches.match(OFFLINE_URL, { ignoreVary: true });
  return (
    hit ||
    new Response("<!doctype html><meta charset=utf-8><title>Çevrimdışı</title><p style=\"font-family:sans-serif;padding:2rem\">İnternet bağlantın yok. Bağlantın gelince tekrar dene.</p>", {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })
  );
}

function cacheable(res) {
  return res && res.ok && res.type === "basic" && (res.headers.get("X-SW-Cache") || "").toLowerCase() !== "no";
}

async function handleNavigation(event, url) {
  const isPublic = PUBLIC_PAGES.some((r) => r.test(url.pathname)) && !NEVER_CACHE.some((r) => r.test(url.pathname));
  if (!isPublic) {
    try {
      return await fetch(event.request);
    } catch (_) {
      return offlineFallback();
    }
  }
  const key = cacheKeyFor(url.href);
  const cache = await caches.open(PAGES_CACHE);
  const network = fetch(event.request).then((res) => {
    if (cacheable(res)) {
      const copy = res.clone();
      event.waitUntil(cache.put(key, copy).then(() => trim(PAGES_CACHE)));
    }
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(() => resolve("timeout"), NAV_TIMEOUT_MS));
  try {
    const winner = await Promise.race([network, timeout]);
    if (winner !== "timeout") return winner;
    const cached = await cache.match(key, { ignoreVary: true });
    if (cached) {
      network.catch(() => undefined);
      return cached;
    }
    return await network;
  } catch (_) {
    const cached = await cache.match(key, { ignoreVary: true });
    return cached || offlineFallback();
  }
}

async function cacheFirst(event, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(event.request);
  if (hit) return hit;
  const res = await fetch(event.request);
  if (res.ok && res.type === "basic") event.waitUntil(cache.put(event.request, res.clone()));
  return res;
}

async function staleWhileRevalidate(event, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(event.request, { ignoreVary: true });
  const network = fetch(event.request)
    .then((res) => {
      if (res.ok && res.type === "basic") event.waitUntil(cache.put(event.request, res.clone()).then(() => trim(cacheName)));
      return res;
    })
    .catch(() => hit || Response.error());
  if (hit) {
    event.waitUntil(network.then(() => undefined, () => undefined));
    return hit;
  }
  return network;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.headers.has("authorization")) return;
  if (req.headers.get("RSC") === "1" || url.searchParams.has("_rsc") || req.headers.has("next-router-prefetch")) return;

  if (req.mode === "navigate") {
    event.respondWith(handleNavigation(event, url));
    return;
  }
  if (NEVER_CACHE.some((r) => r.test(url.pathname))) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || /\.(?:woff2?|ttf|otf)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(event, STATIC_CACHE));
    return;
  }
  if (url.pathname.startsWith("/_next/image") || /\.(?:png|jpe?g|webp|gif|svg|ico)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(event, IMAGE_CACHE));
    return;
  }
  if (SWR_DATA.some((r) => r.test(url.pathname))) {
    event.respondWith(staleWhileRevalidate(event, DATA_CACHE));
    return;
  }
  if (url.pathname === "/manifest.webmanifest") {
    event.respondWith(staleWhileRevalidate(event, STATIC_CACHE));
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Bildirim";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-72.png",
    lang: "tr",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { link: data.link || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let target = new URL((event.notification.data && event.notification.data.link) || "/", self.location.origin);
  if (target.origin !== self.location.origin) target = new URL("/", self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(target.href);
            } catch (_) {
              /* cross-scope navigation not allowed */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
