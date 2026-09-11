import type { NextConfig } from "next";

const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://fboythglcjofakbskstg.supabase.co").hostname;
  } catch {
    return "fboythglcjofakbskstg.supabase.co";
  }
})();
const supabaseOrigin = `https://${supabaseHost}`;

/** Public host of the Cloudflare R2 media bucket (NEXT_PUBLIC_MEDIA_BASE_URL, e.g. https://pub-xxxx.r2.dev), when set. */
const mediaHost = (() => {
  try {
    const raw = process.env.NEXT_PUBLIC_MEDIA_BASE_URL;
    const url = raw ? new URL(raw) : null;
    return url && url.protocol === "https:" ? url.hostname : null;
  } catch {
    return null;
  }
})();
/** CSP sources for R2 media: the configured host plus any r2.dev public bucket (CSP wildcards only cover whole labels). */
const mediaSources = [...new Set([mediaHost ? `https://${mediaHost}` : null, "https://*.r2.dev"].filter(Boolean))].join(" ");

/** Enforced now: only directives that cannot break anything that loads today (no <object>/<embed>, no <base>, same-origin framing). */
const CSP_ENFORCED = "object-src 'none'; base-uri 'self'; frame-ancestors 'self'";

/**
 * Report-only (violations are logged in the browser console) until the map, business location picker, login (Turnstile),
 * QR menu and admin pages run clean; then promote it, admin site first, and replace 'unsafe-inline' scripts with a nonce
 * set in src/proxy.ts.
 * - Supabase: REST/Auth/Storage over https, Realtime over wss; stored images are on this host (media bucket).
 * - Cloudflare R2 (media adapter): photos, listing videos and posters from the public bucket host (img-src,
 *   media-src); the browser PUTs uploads to <account>.r2.cloudflarestorage.com with a presigned URL (connect-src).
 * - Maps: Google Maps JavaScript API only (no OpenStreetMap / OpenFreeMap tiles since 2026-09-11): scripts, tiles and
 *   fonts from *.googleapis.com / *.gstatic.com, some requests to *.google.com. Google's CSP guide also lists
 *   'unsafe-eval' for a few map features: decide on it (security trade-off) before this policy is enforced.
 * - Cloudflare Turnstile (script + iframe), Open-Meteo, Vercel preview toolbar (vercel.live).
 */
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' blob: https://challenges.cloudflare.com https://maps.googleapis.com https://*.googleapis.com https://*.gstatic.com https://vercel.live",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  `img-src 'self' data: blob: ${supabaseOrigin} ${mediaSources} https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://*.gstatic.com https://*.google.com`,
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' ${supabaseOrigin} wss://${supabaseHost} https://*.r2.cloudflarestorage.com https://api.open-meteo.com https://maps.googleapis.com https://*.googleapis.com https://*.gstatic.com https://*.google.com https://challenges.cloudflare.com https://vercel.live`,
  "worker-src 'self' blob:",
  "frame-src 'self' https://challenges.cloudflare.com https://*.google.com https://vercel.live",
  `media-src 'self' blob: ${supabaseOrigin} ${mediaSources}`,
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // A stray package-lock.json in the user folder confuses workspace-root detection; pin it to this project.
  turbopack: { root: process.cwd() },
  images: {
    // User media: the public Supabase Storage bucket "media", and the Cloudflare R2 public bucket (media adapter).
    remotePatterns: [
      { protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/**" },
      { protocol: "https", hostname: "pub-*.r2.dev", pathname: "/**" },
      ...(mediaHost && !mediaHost.endsWith(".r2.dev") ? [{ protocol: "https" as const, hostname: mediaHost, pathname: "/**" }] : []),
    ],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), interest-cohort=()" },
          { key: "Content-Security-Policy", value: CSP_ENFORCED },
          { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
          // The separate admin site (NEXT_PUBLIC_APP_MODE=admin) is never indexed, static files included.
          ...(process.env.NEXT_PUBLIC_APP_MODE === "admin" ? [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] : []),
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
    ];
  },
};

export default nextConfig;
