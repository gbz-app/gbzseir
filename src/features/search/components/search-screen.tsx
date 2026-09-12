"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Clock, Loader2, Search, SearchX, TrendingUp, WifiOff, X, type LucideIcon } from "lucide-react";
import { routes } from "@/core/routes";
import { trLower } from "@/core/tr";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import type { NewsCategoryDef } from "@/features/content/articles/meta";
import type { PlaceCategoryDef } from "@/features/nearby/config";
import { matchShortcuts } from "../categories";
import { displayTerm } from "../popular";
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_MAX,
  SEARCH_MIN,
  cleanQuery,
  isLoggableTerm,
  resultCount,
  toSearchResults,
  type SearchAnswer,
  type SearchGroup,
  type SearchResults,
} from "../query";
import { addRecentSearch, clearRecentSearches, useRecentSearches } from "../recent";
import { SearchResultsList, SearchSkeleton } from "./search-results";

/** Rows per group asked from the RPC while typing (4 are shown; ads are split into ilanlar / iş ilanları). */
const LIVE_LIMIT = 6;
/** Results stay on screen this long without a new keystroke: the search counts as done. */
const COMMIT_IDLE_MS = 2500;

/** The query a text searches for ("" below the minimum). */
function effective(text: string | null | undefined): string {
  const q = cleanQuery(text);
  return q.length >= SEARCH_MIN ? q : "";
}

/** Terms already counted in this tab (module scope, so a remount after "back" does not count them again). */
const countedTerms = new Set<string>();

/** A finished search: kept in "Son aramaların" and counted once (anonymous daily totals, rpc log_search). */
function commitSearch(term: string): void {
  const t = cleanQuery(term);
  if (!isLoggableTerm(t)) return;
  addRecentSearch(t);
  const key = trLower(t);
  if (countedTerms.has(key)) return;
  countedTerms.add(key);
  void createClient()
    .rpc("log_search", { p_term: t })
    .then(
      () => undefined,
      () => undefined,
    );
}

/** The last ?q= this screen wrote itself: its echo through useSearchParams must not overwrite newer typing. */
let writtenQ: string | null = null;

/** Keep ?q= shareable without a server round trip (Next syncs useSearchParams with the native history API). */
function replaceUrl(q: string): void {
  writtenQ = q;
  const target = q ? routes.search(q) : routes.search();
  if (`${window.location.pathname}${window.location.search}` !== target) window.history.replaceState(null, "", target);
}

async function fetchResults(q: string): Promise<SearchResults | null> {
  try {
    const { data, error } = await createClient().rpc("global_search", { p_q: q, p_limit: LIVE_LIMIT });
    return error ? null : toSearchResults(data);
  } catch {
    return null;
  }
}

function TermChips({ terms, icon: Icon, onPick, center }: { terms: readonly string[]; icon: LucideIcon; onPick: (t: string) => void; center?: boolean }) {
  return (
    <ul className={cn("flex flex-wrap gap-2", center && "justify-center")}>
      {terms.map((t, i) => (
        <li key={`${i}:${t}`} className="max-w-full">
          <button
            type="button"
            onClick={() => onPick(t)}
            className="inline-flex h-10 max-w-full items-center gap-1.5 rounded-full bg-card px-4 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.98]"
          >
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{t}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export type SearchScreenProps = {
  /** ?q= of the server render. */
  initialQ: string;
  /** Server results for initialQ (direct ?q= visits, shared links). */
  initial: SearchAnswer | null;
  /** ?tur=: one group with every row. */
  focus?: SearchGroup;
  popular: string[];
  newsCategories?: readonly NewsCategoryDef[];
  placeCategories?: readonly PlaceCategoryDef[];
};

/**
 * J1 - Arama: big input on top; before typing only recent + popular searches (owner: no categories / popular places here); while typing
 * (250 ms debounce, 2+ letters) instant shortcuts and grouped global_search results right under the input.
 */
export function SearchScreen({ initialQ, initial, focus, popular, newsCategories, placeCategories }: SearchScreenProps) {
  const urlQ = effective(useSearchParams().get("q"));
  const [text, setText] = React.useState(() => urlQ || initialQ);
  const [answer, setAnswer] = React.useState<SearchAnswer | null>(initial);

  // A new server answer (navigation to another ?q= / ?tur=) replaces the local one.
  const [seenInitial, setSeenInitial] = React.useState(initial);
  if (seenInitial !== initial) {
    setSeenInitial(initial);
    if (initial) setAnswer(initial);
  }
  // The URL changed without us (bottom nav "Arama", back / forward): follow it.
  const [seenUrlQ, setSeenUrlQ] = React.useState(urlQ);
  if (seenUrlQ !== urlQ) {
    setSeenUrlQ(urlQ);
    // Our own replaceState comes back later (Next applies it in a transition): typing may have moved on since.
    if (urlQ !== writtenQ && urlQ !== effective(text)) setText(urlQ);
  }

  const q = effective(text);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const seq = React.useRef(0);
  const answerQ = answer?.q;

  // Live search: every change invalidates the requests in flight; late answers are dropped.
  React.useEffect(() => {
    const id = ++seq.current;
    if (!q || answerQ === q) return;
    const timer = window.setTimeout(() => {
      void fetchResults(q).then((data) => {
        if (seq.current !== id || effective(inputRef.current?.value) !== q) return;
        setAnswer({ q, data });
        if (data) replaceUrl(q);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [q, answerQ]);

  // A direct ?q= visit (home search, shared link) is a finished search.
  const mountQ = React.useRef(q);
  React.useEffect(() => {
    if (mountQ.current) commitSearch(mountQ.current);
  }, []);

  const current = answer && answer.q === q ? answer : null;
  const committable = current?.data && resultCount(current.data) > 0 ? current.q : "";
  React.useEffect(() => {
    if (!committable) return;
    const timer = window.setTimeout(() => commitSearch(committable), COMMIT_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [committable]);

  const recent = useRecentSearches();
  const popularTerms = React.useMemo(() => popular.map(displayTerm), [popular]);
  const shortcuts = React.useMemo(() => matchShortcuts(q), [q]);

  const pending = !!q && !current;
  const data = current?.data ?? (pending ? (answer?.data ?? null) : null);
  const focusGroup = focus && q === effective(initialQ) ? focus : undefined;
  const failed = !!current && !current.data;
  const empty = !!current?.data && !focusGroup && !shortcuts.length && resultCount(current.data) === 0;
  const oneLetter = !q && cleanQuery(text).length > 0;

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value.slice(0, SEARCH_MAX);
    setText(next);
    if (!effective(next)) replaceUrl("");
  };
  const runTerm = (term: string) => {
    const t = cleanQuery(term);
    setText(t);
    if (effective(t)) {
      replaceUrl(t);
      commitSearch(t);
    }
    window.scrollTo({ top: 0 });
  };
  const clear = () => {
    setText("");
    replaceUrl("");
    inputRef.current?.focus();
  };
  const onPick = () => {
    if (q) commitSearch(q);
  };

  return (
    <>
      <PageHeader title="Ara" backHref={routes.home()}>
        <form
          role="search"
          action={routes.search()}
          method="get"
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            if (!q) return;
            commitSearch(q);
            replaceUrl(q);
            inputRef.current?.blur();
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.75} aria-hidden />
          <input
            ref={inputRef}
            name="q"
            type="search"
            value={text}
            onChange={onChange}
            // Opens the keyboard on a fresh /ara (bottom nav "Arama"), not on a shared ?q= link.
            autoFocus={!initialQ}
            placeholder="Eczane, usta, kafe ya da etkinlik ara"
            aria-label="Ara"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={SEARCH_MAX}
            className="h-13 w-full rounded-full bg-card pr-22 pl-12 text-base outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-search-cancel-button]:appearance-none"
          />
          <div className="absolute inset-y-0 right-1 flex items-center">
            {pending ? <Loader2 className="mr-1 size-4 animate-spin text-muted-foreground" aria-hidden /> : null}
            {text ? (
              <button
                type="button"
                onClick={clear}
                aria-label="Aramayı temizle"
                className="flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-5" aria-hidden />
              </button>
            ) : null}
          </div>
        </form>
      </PageHeader>

      <p className="sr-only" role="status">
        {pending ? "Aranıyor" : current?.data ? `${resultCount(current.data)} sonuç bulundu` : ""}
      </p>

      <div className="flex flex-col gap-7 px-4 pt-4 pb-8">
        {!q ? (
          <>
            {oneLetter ? <p className="-mb-3 text-sm text-muted-foreground">Aramak için en az 2 harf yaz.</p> : null}
            {recent.length ? (
              <section aria-labelledby="ara-son">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h2 id="ara-son" className="text-lg font-semibold">
                    Son aramaların
                  </h2>
                  <button
                    type="button"
                    onClick={clearRecentSearches}
                    className="-mr-2 inline-flex min-h-11 items-center px-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Temizle
                  </button>
                </div>
                <TermChips terms={recent} icon={Clock} onPick={runTerm} />
              </section>
            ) : null}
            {popularTerms.length ? (
              <section aria-labelledby="ara-populer">
                <h2 id="ara-populer" className="mb-3 text-lg font-semibold">
                  Popüler aramalar
                </h2>
                <TermChips terms={popularTerms} icon={TrendingUp} onPick={runTerm} />
              </section>
            ) : null}
          </>
        ) : failed ? (
          <EmptyState
            compact
            icon={WifiOff}
            title="Arama yapılamadı"
            description="Bağlantını kontrol edip tekrar dene."
            action={
              <button
                type="button"
                onClick={() => setAnswer(null)}
                className="inline-flex h-11 items-center rounded-full bg-foreground px-5 text-sm font-semibold text-background transition-opacity hover:opacity-90"
              >
                Tekrar dene
              </button>
            }
          />
        ) : empty ? (
          <div className="flex flex-col gap-2">
            <EmptyState
              compact
              icon={SearchX}
              title={`“${q}” için sonuç bulamadık`}
              description="Yazımı kontrol et ya da daha kısa bir kelime dene. Belki bunlardan biri:"
            />
            <TermChips center terms={popularTerms.slice(0, 8)} icon={TrendingUp} onPick={runTerm} />
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {data || shortcuts.length ? (
              <div className={cn("transition-opacity", pending && data && "opacity-60")}>
                <SearchResultsList
                  q={q}
                  data={data}
                  focus={focusGroup}
                  shortcuts={shortcuts}
                  newsCategories={newsCategories}
                  placeCategories={placeCategories}
                  onPick={onPick}
                />
              </div>
            ) : null}
            {pending && !data ? <SearchSkeleton /> : null}
          </div>
        )}
      </div>
    </>
  );
}
