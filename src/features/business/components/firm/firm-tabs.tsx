"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type FirmTab = {
  /** Also the URL hash ("#yorumlar"); in-page links to it switch the tab. */
  id: string;
  label: string;
  count?: number;
  content: React.ReactNode;
};

// The active tab lives in the URL hash (no navigation, survives reloads / shared links).
const HASH_EVENT = "firm-tabs:hash";

function subscribeHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  window.addEventListener(HASH_EVENT, onChange);
  return () => {
    window.removeEventListener("hashchange", onChange);
    window.removeEventListener(HASH_EVENT, onChange);
  };
}

/** A malformed escape (e.g. "#%") must not crash the page: fall back to the raw hash, which matches no tab. */
const readHash = () => {
  const raw = window.location.hash.slice(1);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};
const serverHash = () => "";

function writeHash(id: string) {
  const { pathname, search } = window.location;
  window.history.replaceState(null, "", id ? `${pathname}${search}#${id}` : `${pathname}${search}`);
  window.dispatchEvent(new Event(HASH_EVENT));
}

/**
 * Sticky tab bar + panels of the firm page. Every panel is server-rendered and stays in the HTML (SEO);
 * inactive ones only get the `hidden` attribute. The first tab is the default (no hash).
 */
export function FirmTabs({ tabs, className }: { tabs: FirmTab[]; className?: string }) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const hash = React.useSyncExternalStore(subscribeHash, readHash, serverHash);
  const ids = tabs.map((t) => t.id);
  const idsKey = ids.join(",");
  const active = ids.includes(hash) ? hash : ids[0];

  const select = React.useCallback(
    (id: string, scroll: "if-needed" | "always" = "if-needed") => {
      writeHash(id === idsKey.split(",")[0] ? "" : id);
      // Keep the tab bar at the top so the new panel starts at its beginning.
      const root = rootRef.current;
      if (root && (scroll === "always" || root.getBoundingClientRect().top < 0)) {
        root.scrollIntoView({ block: "start", behavior: scroll === "always" ? "smooth" : "auto" });
      }
    },
    [idsKey],
  );

  // In-page links like the rating tiles (href="#yorumlar") switch the tab instead of jumping.
  React.useEffect(() => {
    const known = idsKey.split(",");
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.('a[href^="#"]');
      const id = link?.getAttribute("href")?.slice(1);
      if (!id || !known.includes(id)) return;
      e.preventDefault();
      select(id, "always");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [idsKey, select]);

  // Opened with a tab hash (shared link, back from login): bring the tab bar into view once.
  React.useEffect(() => {
    const id = readHash();
    if (id && id !== idsKey.split(",")[0] && idsKey.split(",").includes(id)) rootRef.current?.scrollIntoView({ block: "start" });
  }, [idsKey]);

  // Keep the active pill visible when the bar scrolls horizontally.
  React.useEffect(() => {
    const list = listRef.current;
    const btn = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !btn) return;
    const left = btn.offsetLeft - 20;
    const right = btn.offsetLeft + btn.offsetWidth + 20 - list.clientWidth;
    if (left < list.scrollLeft) list.scrollTo({ left, behavior: "smooth" });
    else if (right > list.scrollLeft) list.scrollTo({ left: right, behavior: "smooth" });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = ids.indexOf(active);
    const next =
      e.key === "ArrowRight" ? ids[(i + 1) % ids.length] : e.key === "ArrowLeft" ? ids[(i - 1 + ids.length) % ids.length] : e.key === "Home" ? ids[0] : e.key === "End" ? ids[ids.length - 1] : null;
    if (!next) return;
    e.preventDefault();
    select(next);
    listRef.current?.querySelector<HTMLElement>(`#sekme-${next}-dugme`)?.focus();
  };

  return (
    <div ref={rootRef} className={className}>
      <div className="sticky top-0 z-20 -mx-5 bg-background px-5 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] pb-2">
        <div ref={listRef} role="tablist" aria-label="Firma bölümleri" onKeyDown={onKeyDown} className="no-scrollbar relative flex gap-1.5 overflow-x-auto">
          {tabs.map((t) => {
            const selected = t.id === active;
            return (
              <button
                key={t.id}
                id={`sekme-${t.id}-dugme`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={`sekme-${t.id}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(t.id)}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected ? "bg-foreground text-background" : "bg-card text-foreground/75 hover:text-foreground",
                )}
              >
                {t.label}
                {t.count ? <span className={cn("text-xs tabular-nums", selected ? "text-background/70" : "text-muted-foreground")}>{t.count}</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      {tabs.map((t) => (
        <div key={t.id} id={`sekme-${t.id}`} role="tabpanel" aria-labelledby={`sekme-${t.id}-dugme`} hidden={t.id !== active} className="pt-5">
          {t.content}
        </div>
      ))}
    </div>
  );
}
