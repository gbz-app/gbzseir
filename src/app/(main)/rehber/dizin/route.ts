import { loadGuideIndex } from "@/features/guide/components/entries";

/**
 * GET /rehber/dizin: every visible guide row as a small JSON index for the /rehber search box (fetched once, on the
 * second typed letter). The rows come from the data cache (1 h); the response is cached by the CDN for an hour.
 */
export async function GET() {
  const { entries, ok } = await loadGuideIndex();
  return Response.json(
    { ok, entries },
    { headers: { "Cache-Control": ok ? "public, s-maxage=3600, stale-while-revalidate=86400" : "no-store" } },
  );
}
