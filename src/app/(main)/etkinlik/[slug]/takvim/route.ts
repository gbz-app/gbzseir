import type { NextRequest } from "next/server";
import { CITY, SITE_URL } from "@/config/site";
import { districtBySlug } from "@/config/districts";
import { routes } from "@/core/routes";
import { buildEventIcs } from "@/features/events/ics";
import { getEventBySlug } from "@/features/events/queries";

function normalizeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw).trim().toLowerCase();
  } catch {
    return raw.toLowerCase();
  }
}

/** GET /etkinlik/[slug]/takvim: "Takvime ekle" file (text/calendar) of a published event; 404 for anything else. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const slug = normalizeSlug((await params).slug);
  const e = slug ? await getEventBySlug(slug).catch(() => null) : null;
  if (!e) return new Response("Etkinlik bulunamadı", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });

  const url = `${SITE_URL}${routes.events.detail(e.slug)}`;
  const district = districtBySlug(e.district_id)?.name;
  const location = [e.venue_name, e.address, district ? `${district}, ${CITY.province}` : CITY.province].filter(Boolean).join(", ");
  const body = buildEventIcs(
    { id: e.id, title: e.title, description: e.description, starts_at: e.starts_at, ends_at: e.ends_at, location, lat: e.lat, lng: e.lng, url },
    new URL(SITE_URL).host,
  );
  const file = e.slug.replace(/[^a-z0-9-]/g, "").slice(0, 80) || "etkinlik";
  return new Response(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      // inline: iOS Safari opens its "Add to Calendar" sheet (attachment only offers a download); Chrome/Firefox
      // still download text/calendar under this file name.
      "Content-Disposition": `inline; filename="${file}.ics"`,
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=600",
      "X-Robots-Tag": "noindex",
    },
  });
}
