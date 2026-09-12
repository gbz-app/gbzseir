import type { MetadataRoute } from "next";
import { APP_DESCRIPTION, APP_FULL_NAME, APP_NAME, BRAND_COLORS } from "@/config/site";
import { routes } from "@/core/routes";
import { IS_ADMIN_SITE } from "@/config/app-mode";

export default function manifest(): MetadataRoute.Manifest {
  // The separate admin site installs as its own "Yönetim" app that opens the panel.
  if (IS_ADMIN_SITE) {
    return {
      id: "/admin",
      name: `${APP_NAME} Yönetim`,
      short_name: `${APP_NAME} Yönetim`,
      lang: "tr",
      start_url: "/admin",
      scope: "/",
      display: "standalone",
      background_color: BRAND_COLORS.backgroundLight,
      theme_color: BRAND_COLORS.backgroundLight,
      icons: [
        { src: "/icons/v2/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/v2/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      ],
    };
  }
  return {
    id: "/",
    name: APP_FULL_NAME,
    short_name: APP_NAME,
    description: APP_DESCRIPTION,
    lang: "tr",
    dir: "ltr",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Android's own launch screen (icon on this colour) runs straight into the app's splash: the logo's top lilac.
    background_color: "#D4B0FD",
    theme_color: BRAND_COLORS.backgroundLight,
    categories: ["lifestyle", "navigation", "utilities", "shopping"],
    icons: [
      { src: "/icons/v2/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/v2/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/v2/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Nöbetçi Eczane",
        short_name: "Nöbetçi",
        description: "Şu an açık nöbetçi eczaneler",
        url: routes.nearby.dutyPharmacies(),
        icons: [{ src: "/icons/shortcut-pharmacy.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "İlan Ver",
        description: "2. el ya da iş ilanı ver",
        url: routes.listings.post(),
        icons: [{ src: "/icons/shortcut-post.png", sizes: "96x96", type: "image/png" }],
      },
      {
        name: "Hizmet Al",
        description: "Usta ve hizmet talebi oluştur",
        url: routes.services.root(),
        icons: [{ src: "/icons/shortcut-service.png", sizes: "96x96", type: "image/png" }],
      },
    ],
  };
}
