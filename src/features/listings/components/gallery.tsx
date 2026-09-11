"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Play, Video, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatVideoDuration } from "@/lib/media/kinds";
import type { MediaRef, VideoRef } from "../types";
import { ListingPlaceholder } from "./listing-cards";

export type ListingGalleryProps = {
  images: MediaRef[];
  /** Optional listing video: shown as the second slide (the cover stays a photo). */
  video?: VideoRef | null;
  title: string;
  /** Ribbon on top of the photos, e.g. "Satıldı". */
  ribbon?: string | null;
  /** Category icon name for the no-photo placeholder. */
  placeholderIcon?: string | null;
  placeholderFallback?: "tag" | "briefcase";
  /** Round buttons on top of the photos (back, share, favorite, menu). */
  overlay?: React.ReactNode;
  className?: string;
};

type Slide = { kind: "image"; url: string } | { kind: "video"; url: string; posterUrl: string | null; durationS: number };

function buildSlides(images: MediaRef[], video: VideoRef | null | undefined): Slide[] {
  const slides: Slide[] = images.map((img) => ({ kind: "image", url: img.url }));
  if (video?.url) slides.splice(Math.min(1, slides.length), 0, { kind: "video", url: video.url, posterUrl: video.posterUrl, durationS: video.durationS });
  return slides;
}

function slideLabel(slides: Slide[], i: number): string {
  const s = slides[i];
  return s?.kind === "video" ? "Video" : `Fotoğraf ${slides.slice(0, i + 1).filter((x) => x.kind === "image").length}`;
}

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
  "absolute top-1/2 hidden size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition-opacity hover:bg-black/60 disabled:opacity-0 sm:flex";

/**
 * Full-bleed swipe hero of a 2. el listing (native scroll-snap; a tap opens the fullscreen viewer). The detail sheet
 * overlaps its bottom edge, so the dots and the ribbon sit 3 rem above it. The video (if any) is the second slide:
 * poster + big play button here, a native <video> (preload none) in the viewer.
 */
export function ListingGallery({ images, video, title, ribbon, placeholderIcon, placeholderFallback = "tag", overlay, className }: ListingGalleryProps) {
  const slides = React.useMemo(() => buildSlides(images, video), [images, video]);
  const count = slides.length;
  const hasVideo = slides.some((s) => s.kind === "video");
  const { ref, index, onScroll, go } = useSnapIndex(count);
  const [viewer, setViewer] = React.useState<number | null>(null);
  const label = `${title}: fotoğraflar${hasVideo ? " ve video" : ""}`;

  return (
    <div
      className={cn("relative h-[min(56vh,27rem)] min-h-80 w-full overflow-hidden bg-muted", className)}
      role={count ? "region" : undefined}
      aria-roledescription={count ? "carousel" : undefined}
      aria-label={count ? label : undefined}
    >
      {count ? (
        <div ref={ref} onScroll={onScroll} className="no-scrollbar flex h-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
          {slides.map((s, i) =>
            s.kind === "video" ? (
              <button
                key={`video-${s.url}`}
                type="button"
                onClick={() => setViewer(i)}
                aria-label={`Videoyu oynat${s.durationS > 0 ? `, ${formatVideoDuration(s.durationS)}` : ""}`}
                className="relative h-full w-full shrink-0 snap-center snap-always bg-black outline-none focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-inset"
              >
                {s.posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.posterUrl} alt="" loading="lazy" decoding="async" draggable={false} className="size-full object-cover" />
                ) : null}
                <span className="absolute inset-0 m-auto flex size-18 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md" aria-hidden>
                  <Play className="size-8 translate-x-0.5 fill-current" />
                </span>
                <span className="absolute right-4 bottom-12 inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-xs font-semibold text-white tabular-nums" aria-hidden>
                  <Video className="size-3.5" /> {formatVideoDuration(s.durationS)}
                </span>
              </button>
            ) : (
              <button
                key={`${s.url}-${i}`}
                type="button"
                onClick={() => setViewer(i)}
                aria-label={`${slideLabel(slides, i)} / ${count}: tam ekran aç`}
                className="relative h-full w-full shrink-0 snap-center snap-always outline-none focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-inset"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.url}
                  alt={i === 0 ? title : `${title}, ${slideLabel(slides, i).toLocaleLowerCase("tr-TR")}`}
                  loading={i === 0 ? "eager" : "lazy"}
                  fetchPriority={i === 0 ? "high" : undefined}
                  decoding="async"
                  draggable={false}
                  className="size-full object-cover"
                />
              </button>
            ),
          )}
        </div>
      ) : (
        <>
          <ListingPlaceholder icon={placeholderIcon ?? null} fallback={placeholderFallback} iconClassName="size-16" />
          <p className="absolute inset-x-0 bottom-12 text-center text-xs font-medium text-muted-foreground">Fotoğraf eklenmemiş</p>
        </>
      )}

      {overlay ? <span className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-linear-to-b from-black/35 to-transparent" aria-hidden /> : null}

      {count > 1 ? (
        <>
          <button type="button" className={cn(arrowClass, "left-3")} onClick={() => go(index - 1)} disabled={index === 0} aria-label="Önceki">
            <ChevronLeft className="size-6" />
          </button>
          <button type="button" className={cn(arrowClass, "right-3")} onClick={() => go(index + 1)} disabled={index >= count - 1} aria-label="Sonraki">
            <ChevronRight className="size-6" />
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-12 flex justify-center gap-1.5" aria-hidden>
            {slides.map((s, i) => (
              <span key={`${s.kind}-${s.url}-${i}`} className={cn("h-1.5 rounded-full bg-white/70 transition-all", i === index ? "w-5 bg-white" : "w-1.5")} />
            ))}
          </div>
        </>
      ) : null}

      {ribbon ? (
        <span className="pointer-events-none absolute bottom-12 left-4 rounded-full bg-destructive px-3 py-1 text-sm font-bold tracking-wide text-white uppercase">
          {ribbon}
        </span>
      ) : null}

      {overlay ? <div className="absolute inset-x-0 top-0 px-4 pt-[calc(env(safe-area-inset-top,0px)+0.75rem)]">{overlay}</div> : null}

      {count ? (
        <Dialog open={viewer !== null} onOpenChange={(o) => (o ? null : setViewer(null))}>
          <DialogContent
            showCloseButton={false}
            aria-describedby={undefined}
            className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-black p-0 text-white ring-0 sm:max-w-none"
          >
            <DialogTitle className="sr-only">{label}</DialogTitle>
            {viewer !== null ? (
              <ViewerStrip
                slides={slides}
                title={title}
                startIndex={viewer}
                onIndexChange={(i) => {
                  if (i !== index) go(i, false);
                }}
              />
            ) : null}
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function ViewerStrip({ slides, title, startIndex, onIndexChange }: { slides: Slide[]; title: string; startIndex: number; onIndexChange: (i: number) => void }) {
  const count = slides.length;
  const { ref, index, onScroll, go } = useSnapIndex(count);
  const videoRefs = React.useRef(new Map<number, HTMLVideoElement>());

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollLeft = startIndex * el.clientWidth;
  }, [ref, startIndex]);

  // Opened by tapping the video slide: start playing (the tap is the user gesture; ignored if the browser refuses).
  React.useEffect(() => {
    if (slides[startIndex]?.kind === "video") void videoRefs.current.get(startIndex)?.play().catch(() => undefined);
    // Only on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const indexRef = React.useRef(index);
  React.useEffect(() => {
    indexRef.current = index;
    onIndexChange(index);
    // Swiped away from the video: stop it.
    for (const [i, el] of videoRefs.current) if (i !== index && !el.paused) el.pause();
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
        {slides.map((s, i) => (
          <div key={`${s.kind}-${s.url}-${i}`} className="flex h-full w-full shrink-0 snap-center snap-always items-center justify-center">
            {s.kind === "video" ? (
              <video
                ref={(el) => {
                  if (el) videoRefs.current.set(i, el);
                  else videoRefs.current.delete(i);
                }}
                src={s.url}
                poster={s.posterUrl ?? undefined}
                controls
                playsInline
                preload="none"
                aria-label={`${title}: video`}
                className="max-h-full max-w-full bg-black"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.url} alt={`${title}, ${slideLabel(slides, i).toLocaleLowerCase("tr-TR")}`} draggable={false} decoding="async" className="max-h-full max-w-full object-contain" />
            )}
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
            aria-label="Önceki"
          >
            <ChevronLeft className="size-6" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            disabled={index >= count - 1}
            className="flex size-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30"
            aria-label="Sonraki"
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
