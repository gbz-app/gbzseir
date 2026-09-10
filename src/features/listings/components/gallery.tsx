"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { MediaRef } from "../types";
import { ListingPlaceholder } from "./listing-cards";

export type ListingGalleryProps = {
  images: MediaRef[];
  title: string;
  /** Diagonal-free ribbon on top of the photos, e.g. "Satıldı". */
  ribbon?: string | null;
  /** Category icon name for the no-photo placeholder. */
  placeholderIcon?: string | null;
  placeholderFallback?: "tag" | "briefcase";
};

function useSnapIndex(count: number) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [index, setIndex] = React.useState(0);
  const onScroll = React.useCallback(() => {
    const el = ref.current;
    if (!el || !el.clientWidth) return;
    setIndex(Math.min(Math.max(Math.round(el.scrollLeft / el.clientWidth), 0), Math.max(count - 1, 0)));
  }, [count]);
  const go = React.useCallback((i: number, smooth = true) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? "smooth" : "auto" });
  }, []);
  return { ref, index, onScroll, go };
}

const arrowClass =
  "absolute top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white shadow-md backdrop-blur transition-opacity hover:bg-black/70 disabled:opacity-0 sm:flex";

/** E3 swipe gallery (native scroll-snap) with a fullscreen viewer. */
export function ListingGallery({ images, title, ribbon, placeholderIcon, placeholderFallback = "tag" }: ListingGalleryProps) {
  const count = images.length;
  const { ref, index, onScroll, go } = useSnapIndex(count);
  const [viewer, setViewer] = React.useState<number | null>(null);

  const ribbonEl = ribbon ? (
    <span className="pointer-events-none absolute top-3 left-3 rounded-lg bg-destructive px-3 py-1 text-sm font-extrabold tracking-wide text-white uppercase shadow-md">
      {ribbon}
    </span>
  ) : null;

  if (!count) {
    return (
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        <ListingPlaceholder icon={placeholderIcon ?? null} fallback={placeholderFallback} iconClassName="size-16" />
        <p className="absolute inset-x-0 bottom-3 text-center text-xs font-medium text-muted-foreground">Fotoğraf eklenmemiş</p>
        {ribbonEl}
      </div>
    );
  }

  return (
    <div className="relative bg-muted" role="region" aria-roledescription="carousel" aria-label={`${title}: fotoğraflar`}>
      <div ref={ref} onScroll={onScroll} className="no-scrollbar flex aspect-[4/3] w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
        {images.map((img, i) => (
          <button
            key={`${img.url}-${i}`}
            type="button"
            onClick={() => setViewer(i)}
            aria-label={`Fotoğraf ${i + 1} / ${count}: tam ekran aç`}
            className="relative h-full w-full shrink-0 snap-center snap-always outline-none focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-inset"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img.url}
              alt={i === 0 ? title : `${title}, fotoğraf ${i + 1}`}
              loading={i === 0 ? "eager" : "lazy"}
              fetchPriority={i === 0 ? "high" : undefined}
              decoding="async"
              draggable={false}
              className="size-full object-contain"
            />
          </button>
        ))}
      </div>
      {count > 1 ? (
        <>
          <button type="button" className={cn(arrowClass, "left-3")} onClick={() => go(index - 1)} disabled={index === 0} aria-label="Önceki fotoğraf">
            <ChevronLeft className="size-6" />
          </button>
          <button type="button" className={cn(arrowClass, "right-3")} onClick={() => go(index + 1)} disabled={index >= count - 1} aria-label="Sonraki fotoğraf">
            <ChevronRight className="size-6" />
          </button>
        </>
      ) : null}
      <span className="pointer-events-none absolute right-3 bottom-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white tabular-nums" aria-hidden>
        {index + 1} / {count}
      </span>
      {ribbonEl}
      <Dialog open={viewer !== null} onOpenChange={(o) => (o ? null : setViewer(null))}>
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-black p-0 text-white ring-0 sm:max-w-none"
        >
          <DialogTitle className="sr-only">{title}: fotoğraflar</DialogTitle>
          {viewer !== null ? (
            <ViewerStrip
              images={images}
              title={title}
              startIndex={viewer}
              onIndexChange={(i) => {
                if (i !== index) go(i, false);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ViewerStrip({ images, title, startIndex, onIndexChange }: { images: MediaRef[]; title: string; startIndex: number; onIndexChange: (i: number) => void }) {
  const count = images.length;
  const { ref, index, onScroll, go } = useSnapIndex(count);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = startIndex * el.clientWidth;
  }, [ref, startIndex]);

  const indexRef = React.useRef(index);
  React.useEffect(() => {
    indexRef.current = index;
    onIndexChange(index);
  }, [index, onIndexChange]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(Math.min(indexRef.current + 1, count - 1));
      if (e.key === "ArrowLeft") go(Math.max(indexRef.current - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, count]);

  return (
    <>
      <div className="flex shrink-0 items-center justify-between px-2 pt-safe">
        <span className="px-3 text-sm font-semibold tabular-nums" aria-live="polite">
          {index + 1} / {count}
        </span>
        <DialogClose asChild>
          <button type="button" className="flex size-11 items-center justify-center rounded-full hover:bg-white/10" aria-label="Kapat">
            <X className="size-6" />
          </button>
        </DialogClose>
      </div>
      <div ref={ref} onScroll={onScroll} className="no-scrollbar flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-contain">
        {images.map((img, i) => (
          <div key={`${img.url}-${i}`} className="flex h-full w-full shrink-0 snap-center snap-always items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url} alt={`${title}, fotoğraf ${i + 1}`} draggable={false} decoding="async" className="max-h-full max-w-full object-contain" />
          </div>
        ))}
      </div>
      {count > 1 ? (
        <div className="flex shrink-0 items-center justify-center gap-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            onClick={() => go(index - 1)}
            disabled={index === 0}
            className="flex size-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30"
            aria-label="Önceki fotoğraf"
          >
            <ChevronLeft className="size-6" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            disabled={index >= count - 1}
            className="flex size-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30"
            aria-label="Sonraki fotoğraf"
          >
            <ChevronRight className="size-6" />
          </button>
        </div>
      ) : (
        <div className="shrink-0 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]" />
      )}
    </>
  );
}
