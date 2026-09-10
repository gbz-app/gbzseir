import type { Metadata } from "next";
import { APP_NAME } from "@/config/site";

const OG_IMAGE = { url: "/icons/og-image.png", width: 1200, height: 630, alt: APP_NAME };

/**
 * Page metadata for content pages. Next merges metadata shallowly, so openGraph/twitter are rebuilt in full
 * (site name, locale and image are kept from the root layout's defaults).
 */
export function contentMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  const fullTitle = `${title} | ${APP_NAME}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "tr_TR",
      siteName: APP_NAME,
      title: fullTitle,
      description,
      url: path,
      images: [OG_IMAGE],
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [OG_IMAGE.url] },
  };
}
