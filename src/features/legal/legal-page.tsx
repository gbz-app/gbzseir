import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FileClock, Scale } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { formatDate } from "@/core/format";
import { routes } from "@/core/routes";
import { LegalBody } from "./legal-body";
import { LEGAL_DESCRIPTIONS, LEGAL_LABELS, LEGAL_PATHS, LEGAL_SLUGS, type LegalSlug } from "./meta";
import { getPublishedLegalText } from "./queries";

export function legalMetadata(slug: LegalSlug): Metadata {
  return { title: LEGAL_LABELS[slug], description: LEGAL_DESCRIPTIONS[slug], alternates: { canonical: LEGAL_PATHS[slug] } };
}

/** One /yasal page: the latest published version, a draft note while it waits for legal review, links to the others. */
export async function LegalPage({ slug }: { slug: LegalSlug }) {
  const doc = await getPublishedLegalText(slug);
  const others = LEGAL_SLUGS.filter((s) => s !== slug);

  return (
    <>
      <PageHeader title={doc?.title ?? LEGAL_LABELS[slug]} backHref={routes.home()} />
      <div className="flex flex-col gap-4 px-4 pt-4 pb-nav">
        {doc ? (
          <article className="rounded-3xl bg-card p-5">
            <header className="mb-4 flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">
                Sürüm {doc.version} · Yürürlük {formatDate(doc.publishedAt, { month: "long", year: true })}
              </p>
              {doc.pendingReview ? (
                <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-highlight-soft px-3 py-1 text-xs font-semibold text-highlight-foreground">
                  <FileClock className="size-3.5 shrink-0" aria-hidden /> Taslak - hukuki inceleme bekliyor
                </p>
              ) : null}
            </header>
            <LegalBody body={doc.body} />
          </article>
        ) : (
          <div className="rounded-3xl bg-card">
            <EmptyState icon={Scale} title="Metin hazırlanıyor" description="Bu metnin güncel sürümü kısa süre içinde burada olacak." />
          </div>
        )}

        <nav aria-label="Diğer yasal metinler" className="rounded-3xl bg-card p-2">
          <p className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground">Diğer yasal metinler</p>
          <ul>
            {others.map((s) => (
              <li key={s}>
                <Link
                  href={LEGAL_PATHS[s]}
                  className="flex items-center gap-3 rounded-2xl px-3 py-3 text-[15px] font-medium outline-none transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="min-w-0 flex-1">{LEGAL_LABELS[s]}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  );
}
