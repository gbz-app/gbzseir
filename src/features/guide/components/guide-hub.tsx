"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, Loader2, Search, SearchX, X, type LucideIcon } from "lucide-react";
import { canGoBack } from "@/lib/navigation-history";
import { routes } from "@/core/routes";
import { trNormalize } from "@/core/tr";
import { EmptyState } from "@/components/shared/empty-state";
import { GUIDE_SECTIONS, categorySlug, guideIcon } from "@/features/guide/lib/constants";
import type { InstitutionCategoryDef } from "@/features/guide/lib/types";
import { resolveGuideList, GUIDE_EXTRA_LIST_SLUGS, type GuideEntry } from "./list-config";
import { GuideCard } from "./guide-card";

/** Round back button of the hub (history back, else home). */
export function HubBackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      aria-label="Geri"
      onClick={() => (canGoBack() ? router.back() : router.push(routes.home()))}
      className="flex size-11 items-center justify-center rounded-full bg-foreground/[0.06] outline-none hover:bg-foreground/10 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <ArrowLeft className="size-5" strokeWidth={2.2} aria-hidden />
    </button>
  );
}

type CategoryHit = { key: string; label: string; hint: string; href: string; icon: LucideIcon; count: number; haystack: string };

const MAX_RECORDS = 30;

type IndexState = { status: "idle" | "loading" | "ready" | "error"; entries: GuideEntry[] };

/**
 * Hub search: filters the guide categories (lists, sections, institution categories) at once and, from the second
 * letter, the records (the /rehber/dizin index is fetched once). While searching, the hub content (`children`) is
 * hidden.
 */
export function GuideHubSearch({
  counts,
  institutionDefs,
  children,
}: {
  /** List slug or institution category key -> visible rows. */
  counts: Record<string, number>;
  institutionDefs: readonly InstitutionCategoryDef[];
  children: React.ReactNode;
}) {
  const [query, setQuery] = React.useState("");
  const [index, setIndex] = React.useState<IndexState>({ status: "idle", entries: [] });
  const inputRef = React.useRef<HTMLInputElement>(null);
  const words = React.useMemo(() => trNormalize(query).split(" ").filter(Boolean), [query]);
  const searching = words.length > 0;

  const categories = React.useMemo<CategoryHit[]>(() => {
    const out: CategoryHit[] = [];
    const add = (hit: Omit<CategoryHit, "haystack">, extra = "") => {
      if (out.some((h) => h.href === hit.href)) return;
      out.push({ ...hit, haystack: trNormalize(`${hit.label} ${hit.hint} ${extra}`) });
    };
    for (const slug of GUIDE_EXTRA_LIST_SLUGS) {
      const cfg = resolveGuideList(slug, institutionDefs);
      if (cfg) add({ key: slug, label: cfg.title, hint: cfg.description, href: routes.guide.category(slug), icon: cfg.icon, count: counts[slug] ?? 0 });
    }
    for (const s of GUIDE_SECTIONS) add({ key: s.slug, label: s.title, hint: s.description, href: routes.guide.category(s.slug), icon: s.icon, count: counts[s.slug] ?? 0 }, s.label);
    for (const d of institutionDefs) {
      add({ key: d.key, label: d.label, hint: "Resmî kurum", href: routes.guide.category(categorySlug(d.key)), icon: guideIcon(d.icon), count: counts[d.key] ?? 0 });
    }
    return out.filter((c) => c.count > 0);
  }, [counts, institutionDefs]);

  const categoryHits = searching ? categories.filter((c) => words.every((w) => c.haystack.includes(w))).slice(0, 8) : [];
  const recordHits = React.useMemo(
    () => (searching && index.status === "ready" ? index.entries.filter((e) => words.every((w) => e.q.includes(w))) : []),
    [searching, index, words],
  );

  const loadIndex = React.useCallback(() => {
    setIndex((s) => (s.status === "idle" || s.status === "error" ? { status: "loading", entries: [] } : s));
    fetch(routes.guide.index())
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { ok: boolean; entries: GuideEntry[] }) => setIndex({ status: data.entries?.length ? "ready" : "error", entries: data.entries ?? [] }))
      .catch(() => setIndex({ status: "error", entries: [] }));
  }, []);

  const onChange = (v: string) => {
    setQuery(v.slice(0, 80));
    if (v.trim().length >= 2 && index.status === "idle") loadIndex();
  };

  return (
    <>
      <div role="search" className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Kurum, okul, ATM ya da yer ara"
          aria-label="Şehir rehberinde ara"
          enterKeyHint="search"
          autoComplete="off"
          className="h-13 w-full rounded-full bg-card pr-12 pl-12 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Aramayı temizle"
            className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      {searching ? (
        <div className="flex flex-col gap-6" aria-live="polite">
          {categoryHits.length ? (
            <section>
              <h2 className="mb-2.5 text-base font-semibold">Kategoriler</h2>
              <ul className="flex flex-col gap-2">
                {categoryHits.map((c) => (
                  <li key={c.href}>
                    <Link
                      href={c.href}
                      className="flex min-h-14 items-center gap-3 rounded-2xl bg-card px-3 py-2.5 outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary">
                        <c.icon className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">{c.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">{c.hint}</span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-muted-foreground tabular-nums">{c.count}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {query.trim().length >= 2 ? (
            <section>
              <h2 className="mb-2.5 text-base font-semibold">Kayıtlar</h2>
              {index.status === "loading" || index.status === "idle" ? (
                <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Aranıyor…
                </p>
              ) : index.status === "error" ? (
                <p className="px-1 text-sm text-muted-foreground">
                  Kayıtlar şu an aranamadı.{" "}
                  <button type="button" onClick={loadIndex} className="font-semibold text-primary underline underline-offset-2">
                    Tekrar dene
                  </button>
                </p>
              ) : recordHits.length ? (
                <>
                  <ul className="flex flex-col gap-2.5">
                    {recordHits.slice(0, MAX_RECORDS).map((e) => (
                      <li key={e.id}>
                        <GuideCard entry={e} />
                      </li>
                    ))}
                  </ul>
                  {recordHits.length > MAX_RECORDS ? (
                    <p className="mt-3 px-1 text-xs text-muted-foreground">
                      {recordHits.length - MAX_RECORDS} kayıt daha var. Aramayı daraltmayı dene.
                    </p>
                  ) : null}
                </>
              ) : categoryHits.length ? (
                <p className="px-1 text-sm text-muted-foreground">Bu isimde kayıt yok; yukarıdaki kategorilere bakabilirsin.</p>
              ) : null}
            </section>
          ) : null}

          {!categoryHits.length && (index.status === "ready" || query.trim().length < 2) && !recordHits.length ? (
            <EmptyState
              compact
              icon={SearchX}
              tone="default"
              title="Sonuç bulunamadı"
              description={query.trim().length < 2 ? "Biraz daha yaz." : `"${query.trim()}" için sonuç yok. Farklı bir kelime dene.`}
            />
          ) : null}
        </div>
      ) : (
        children
      )}
    </>
  );
}
