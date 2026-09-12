import type { Metadata, Viewport } from "next";
import { Google_Sans } from "next/font/google";
import "./globals.css";
import { APP_DESCRIPTION, APP_FULL_NAME, APP_NAME, BRAND_COLORS, SITE_URL } from "@/config/site";
import { KOCAELI_DISTRICTS } from "@/config/districts";
import { IS_ADMIN_SITE } from "@/config/app-mode";
import { ThemeScript } from "@/components/theme/theme-script";
import { AppProviders } from "@/components/providers/app-providers";
import { AppSplash } from "@/components/pwa/app-splash";
import { OrientationGuard } from "@/components/pwa/orientation-guard";
import { NoZoom } from "@/components/layout/no-zoom";

// The whole UI uses Google Sans (variable, 400-700). latin-ext is required for ğ, ş, ı, İ.
const googleSans = Google_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-google-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: APP_FULL_NAME, template: `%s | ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  keywords: ["Kocaeli", "şehir rehberi", "nöbetçi eczane", "Kocaeli ilanlar", "Kocaeli iş ilanları", "Kocaeli usta", ...KOCAELI_DISTRICTS.map((d) => d.name)],
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: APP_NAME,
    title: APP_FULL_NAME,
    description: APP_DESCRIPTION,
    url: SITE_URL,
    images: [{ url: "/icons/og-image.png", width: 1200, height: 630, alt: APP_FULL_NAME }],
  },
  twitter: { card: "summary_large_image", title: APP_FULL_NAME, description: APP_DESCRIPTION, images: ["/icons/og-image.png"] },
  // The separate admin site must never be indexed.
  ...(IS_ADMIN_SITE ? { robots: { index: false, follow: false, nocache: true } } : {}),
  // Logo icons under /icons/v2: a new folder so phones do not keep the old, week-long cached files.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/v2/icon.svg", type: "image/svg+xml" },
      { url: "/icons/v2/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/icons/v2/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // App-like: no pinch / double-tap zoom (iOS gestures are also blocked by <NoZoom />). The admin site can zoom.
  ...(IS_ADMIN_SITE ? {} : { maximumScale: 1, userScalable: false }),
  viewportFit: "cover",
  // Light only (no dark mode).
  themeColor: BRAND_COLORS.backgroundLight,
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={googleSans.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-dvh bg-background font-sans text-foreground">
        {/* Launch splash first, so it covers the page from the very first paint (public app only). */}
        {IS_ADMIN_SITE ? null : <AppSplash />}
        <AppProviders>{children}</AppProviders>
        {/* App-only behaviour; the admin site is used on desktop too. */}
        {IS_ADMIN_SITE ? null : <OrientationGuard />}
        {IS_ADMIN_SITE ? null : <NoZoom />}
      </body>
    </html>
  );
}
