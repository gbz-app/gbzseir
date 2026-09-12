import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { routes } from "@/core/routes";
import { MapPattern } from "@/components/maps/map-states";
import { NearbyCard } from "@/features/nearby/components/nearby-card";
import { NEARBY_AREA_CLASS } from "@/features/nearby/components/nearby-explorer-skeleton";
import { entryToItem } from "@/features/nearby/lib/guide-items";
import { entryDimValue, type ClientListConfig, type GuideChipDef, type GuideEntry } from "./list-config";

/** Moved to ./list-config (shared with the explore screen and /rehber/dizin/<slug>); re-exported for older imports. */
export type { ClientListConfig } from "./list-config";

export type GuideListFallbackProps = {
  config: ClientListConfig;
  entries: GuideEntry[];
  chips: GuideChipDef[];
};

/** Rows painted on the server (the explore screen shows 40 at a time too). */
const STEP = 40;

const BACK_BUTTON =
  "pointer-events-auto flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground outline-none transition-transform focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-95 motion-reduce:transition-none";

/** Rows of the chip chosen by the path (/rehber/noter: the Noter rows of Adalet), in the server's A-Z order. */
function presetRows(config: ClientListConfig, chips: GuideChipDef[], entries: GuideEntry[]): GuideEntry[] {
  const dim = config.chip;
  const chip = config.preset && chips.some((c) => c.value === config.preset) ? config.preset : null;
  return dim && chip ? entries.filter((e) => entryDimValue(e, dim) === chip) : entries;
}

/**
 * Server HTML and Suspense fallback of /rehber/[kategori] until the explore screen (ExploreMap) takes over on the client:
 * the map placeholder, the back button and the list sheet where the half-open sheet sits, with the title, the count and
 * the first rows of the path's chip as the same cards the screen shows (for crawlers and the first paint). Hook-free,
 * so it renders on the server.
 */
export function GuideListFallback({ config, entries, chips }: GuideListFallbackProps) {
  const rows = presetRows(config, chips, entries);
  return (
    <div className={NEARBY_AREA_CLASS}>
      <MapPattern className="absolute inset-0" />
      <div className="absolute inset-x-0 top-0 z-20 px-4 pt-2.5">
        <Link href={routes.guide.root()} aria-label="Şehir rehberine dön" className={BACK_BUTTON}>
          <ArrowLeft className="size-5" strokeWidth={2.2} aria-hidden />
        </Link>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-30 flex h-[55%] flex-col rounded-t-3xl bg-background shadow-[0_-10px_30px_-12px_rgb(0_0_0/0.25)] ring-1 ring-foreground/[0.06]">
        <div className="flex h-8 shrink-0 items-center justify-center" aria-hidden>
          <span className="h-1.5 w-11 rounded-full bg-muted-foreground/35" />
        </div>
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2.5">
          <h2 className="min-w-0 truncate text-xl leading-tight font-bold">{config.title}</h2>
          <p className="shrink-0 text-sm font-semibold text-muted-foreground tabular-nums">{rows.length} kayıt</p>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden px-4">
          {rows.length ? (
            <ul className="flex flex-col gap-3" aria-label={config.title}>
              {rows.slice(0, STEP).map((e) => (
                <li key={e.id}>
                  <NearbyCard item={entryToItem(e, null)} now={0} showDistance={false} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
