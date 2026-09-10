import { NextResponse } from "next/server";
import { getForecast } from "@/features/weather/server";

export const dynamic = "force-dynamic";

/** GET /api/hava: current weather + 5-day forecast for Gebze. */
export async function GET() {
  try {
    const data = await getForecast();
    return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" } });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
