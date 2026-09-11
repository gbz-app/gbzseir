import type { MetadataRoute } from "next";
import { IS_ADMIN_SITE } from "@/config/app-mode";
import { SITE_URL } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  // The separate admin site must never be indexed.
  if (IS_ADMIN_SITE) return { rules: [{ userAgent: "*", disallow: "/" }] };
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/giris", "/profil", "/isletme", "/talep/", "/ilan-ver", "/hizmet-talebi", "/offline", "/ara"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
