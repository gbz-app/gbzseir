import Link from "next/link";
import { routes } from "@/core/routes";
import { LEGAL_LABELS, LEGAL_PATHS, type LegalSlug } from "@/features/legal/meta";

const ORDER: LegalSlug[] = ["kvkk", "kosullar", "gizlilik", "cerez", "acik-riza"];

const LINK =
  "inline-flex min-h-9 items-center rounded-full px-2.5 outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50";

/** Small footer of /yardim: legal texts and data sources. */
export function SupportFooter() {
  return (
    <footer className="pt-1">
      <nav aria-label="Yasal metinler">
        <ul className="flex flex-wrap justify-center gap-x-0.5 gap-y-0.5 text-[13px] font-medium text-muted-foreground">
          {ORDER.map((s) => (
            <li key={s}>
              <Link href={LEGAL_PATHS[s]} className={LINK}>
                {LEGAL_LABELS[s]}
              </Link>
            </li>
          ))}
          <li>
            <Link href={routes.content.sources()} className={LINK}>
              Kaynaklar
            </Link>
          </li>
        </ul>
      </nav>
    </footer>
  );
}
