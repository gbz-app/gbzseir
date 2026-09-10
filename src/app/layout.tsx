import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { APP_DESCRIPTION, APP_FULL_NAME, APP_NAME, BRAND_COLORS, SITE_URL } from "@/config/site";
import { ThemeScript } from "@/components/theme/theme-script";
import { AppProviders } from "@/components/providers/app-providers";
import { OnboardingPreScript } from "@/features/onboarding/onboarding-pre-script";

// latin-ext is required for ğ, ş, ı, İ.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: APP_FULL_NAME, template: `%s | ${APP_NAME}` },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  keywords: ["Gebze", "nöbetçi eczane", "Gebze ilanlar", "Gebze iş ilanları", "Gebze usta", "Kocaeli", "şehir rehberi"],
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
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND_COLORS.backgroundLight },
    { media: "(prefers-color-scheme: dark)", color: BRAND_COLORS.backgroundDark },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={jakarta.variable} suppressHydrationWarning>
      <head>
        <ThemeScript />
        <OnboardingPreScript />
      </head>
      <body className="min-h-dvh bg-background font-sans text-foreground">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
