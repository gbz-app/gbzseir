import { buildChipDefs, loadGuideList } from "@/features/guide/components/entries";
import { resolveGuideList, toClientListConfig } from "@/features/guide/components/list-config";
import { getGuideCounts, getInstitutionCategories } from "@/features/guide/lib/queries";

/** Longest slug looked up (same limit as the /rehber/[kategori] page). */
const MAX_SLUG = 60;

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
const CACHED = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600", "X-Robots-Tag": "noindex" };

function decode(v: string): string {
  try {
    return decodeURIComponent(v).trim().toLowerCase();
  } catch {
    return v.trim().toLowerCase();
  }
}

/**
 * GET /rehber/dizin/<slug>: every row of one guide list as JSON, for the explore screen when it switches to a guide list
 * the page did not render (Keşfet chips, or another list opened from /rehber/[kategori]). `slug` is anything
 * /rehber/<slug> accepts: a combined list (kurumlar, okullar...), a GUIDE_SECTIONS slug, or an institution category slug
 * (nufus: the kamu list with config.preset "nufus"). Same data as the page: every row (data cache, 1 h), the chip
 * definitions and, for ATM / Şube, both counts. Unknown slugs answer 404. A full answer is cached by the CDN for 5 min
 * (stale for an hour while it refreshes); a partial one (a failed page, `truncated`: past loadGuideList's row cap, or
 * missing ATM / Şube counts) is never cached.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ kategori: string }> }) {
  const slug = decode((await params).kategori);
  const cfg = slug && slug.length <= MAX_SLUG ? resolveGuideList(slug, await getInstitutionCategories()) : null;
  if (!cfg) return Response.json({ ok: false, error: "not_found" }, { status: 404, headers: NO_STORE });

  try {
    const [{ entries, ok, truncated, labels }, counts] = await Promise.all([
      loadGuideList(cfg),
      cfg.bankSwitch ? getGuideCounts() : Promise.resolve(null),
    ]);
    const bankCounts = counts?.ok ? { atm: counts.byKind.atm ?? 0, bank: counts.byKind.bank ?? 0 } : undefined;
    const complete = ok && !truncated && (!cfg.bankSwitch || !!bankCounts);
    return Response.json(
      { ok, truncated, config: toClientListConfig(cfg), entries, chips: buildChipDefs(cfg, entries, labels), bankCounts },
      { headers: complete ? CACHED : NO_STORE },
    );
  } catch (e) {
    console.error("[guide] dataset failed:", slug, e instanceof Error ? e.message : e);
    return Response.json({ ok: false, error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
}
