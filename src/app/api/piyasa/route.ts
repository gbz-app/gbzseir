import { NextResponse } from "next/server";
import { getMarkets } from "@/features/markets/server";

// Upstream calls are cached in the data cache; the response itself is cached by the CDN for 10 minutes.
export const dynamic = "force-dynamic";

/** GET /api/piyasa: Dolar, Euro, Sterlin and gram altın with daily/weekly/monthly/yearly series. */
export async function GET() {
  try {
    const data = await getMarkets();
    if (!data.quotes.some((q) => q.price !== null)) {
      return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
