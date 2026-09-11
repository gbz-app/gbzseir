"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export type GalleryPhoto = { id: string; url: string };

const GRID_VISIBLE = 7;

/**
 * Business photos. `strip`: horizontal row; `grid`: first photo wide + 2 columns ("+N" on the last tile).
 * Tapping a photo opens a full-screen viewer with previous/next (arrow keys and swipe).
 */
export function FirmGallery({ photos, name, layout = "strip" }: { photos: GalleryPhoto[]; name: string; layout?: "strip" | "grid" }) {
  const [index, setIndex] = React.useState<number | null>(null);
  const count = photos.length;
  const go = React.useCallback((delta: number) => setIndex((i) => (i === null ? i : (i + delta + count) % count)), [count]);
  const touchX = React.useRef<number | null>(null);

  if (count === 0) return null;
  const current = index !== null ? photos[index] : null;

  const tile = (p: GalleryPhoto, i: number, className: string, overlay?: React.ReactNode) => (
    <button
      type="button"
      onClick={() => setIndex(i)}
      aria-label={`Fotoğraf ${i + 1} / ${count}: büyüt`}
      className={cn("relative block w-full overflow-hidden rounded-2xl bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.url} alt={`${name} fotoğraf ${i + 1}`} loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-300 hover:scale-[1.03]" />
      {overlay}
    </button>
  );

  return (
    <>
      {layout === "grid" ? (
        <ul className="grid grid-cols-2 gap-2">
          {photos.slice(0, GRID_VISIBLE).map((p, i) => {
            const more = i === GRID_VISIBLE - 1 && count > GRID_VISIBLE ? count - GRID_VISIBLE : 0;
            return (
              <li key={p.id} className={i === 0 ? "col-span-2" : undefined}>
                {tile(
                  p,
                  i,
                  i === 0 ? "aspect-[16/9]" : "aspect-square",
                  more ? <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xl font-semibold text-white">+{more}</span> : null,
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="no-scrollbar -mx-4 flex snap-x gap-2 overflow-x-auto scroll-px-4 px-4 pb-1">
          {photos.map((p, i) => (
            <li key={p.id} className="w-56 shrink-0 snap-start">
              {tile(p, i, "aspect-[4/3]")}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={index !== null} onOpenChange={(o) => !o && setIndex(null)}>
        <DialogContent
          showCloseButton={false}
          className="max-w-[calc(100%-1rem)] gap-0 overflow-hidden border-none bg-black p-0 text-white sm:max-w-3xl"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") go(1);
            if (e.key === "ArrowLeft") go(-1);
          }}
        >
          <DialogTitle className="sr-only">{name} fotoğrafları</DialogTitle>
          <DialogDescription className="sr-only">Önceki ve sonraki fotoğraf için okları kullan ya da kaydır.</DialogDescription>
          {current ? (
            <div
              className="relative flex max-h-[85dvh] min-h-64 items-center justify-center"
              onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
              onTouchEnd={(e) => {
                const start = touchX.current;
                const end = e.changedTouches[0]?.clientX;
                touchX.current = null;
                if (start == null || end == null || Math.abs(end - start) < 40) return;
                go(end < start ? 1 : -1);
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={current.url} alt={`${name} fotoğraf ${(index ?? 0) + 1}`} className="max-h-[85dvh] w-full object-contain" />
              <span className="absolute top-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold tabular-nums">
                {(index ?? 0) + 1} / {count}
              </span>
              <button
                type="button"
                onClick={() => setIndex(null)}
                aria-label="Kapat"
                className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-full bg-black/60 hover:bg-black/80"
              >
                <X className="size-5" />
              </button>
              {count > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => go(-1)}
                    aria-label="Önceki fotoğraf"
                    className="absolute top-1/2 left-2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 hover:bg-black/80"
                  >
                    <ChevronLeft className="size-6" />
                  </button>
                  <button
                    type="button"
                    onClick={() => go(1)}
                    aria-label="Sonraki fotoğraf"
                    className="absolute top-1/2 right-2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 hover:bg-black/80"
                  >
                    <ChevronRight className="size-6" />
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
