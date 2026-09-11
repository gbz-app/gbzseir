"use client";

import * as React from "react";
import { Loader2, Play, RefreshCw, Trash2, Video, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { Progress } from "@/components/ui/progress";
import { formatVideoDuration, VIDEO_MAX_SECONDS } from "@/lib/media/kinds";
import { discardUploadedMedia, MediaUploadError, uploadMedia, type MediaConfig } from "@/lib/media/client";
import { ACCEPTED_VIDEO_TYPES, prepareVideo, VideoPrepError } from "@/lib/media/video";
import type { ClassifiedVideoDraft } from "../wizard-drafts";

type Phase = { kind: "idle" } | { kind: "preparing" } | { kind: "uploading"; progress: number; preview: string | null };

export type ListingVideoFieldProps = {
  value: ClassifiedVideoDraft | null;
  onChange: (video: ClassifiedVideoDraft | null) => void;
  /** Media adapter config (null while loading). Video needs R2. */
  config: MediaConfig | null;
  /** The video already saved on the listing (edit mode): never deleted from here, the save replaces it. */
  persistedUrl: string | null;
  onBusyChange?: (busy: boolean) => void;
};

const TITLE = `Video ekle (isteğe bağlı, en fazla ${VIDEO_MAX_SECONDS} sn)`;
const tile = "flex w-full items-center gap-3 rounded-2xl bg-card p-3 text-left";
const iconBubble = "flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-soft text-primary";
const pillButton =
  "inline-flex h-10 items-center gap-1.5 rounded-full bg-muted px-4 text-sm font-semibold transition-colors hover:bg-muted/70 disabled:opacity-50 outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * One optional listing video: pick -> location metadata removed in place (MP4/MOV) -> poster frame -> presigned PUT
 * with a progress bar -> replace / remove. Disabled with "Video yakında" while media is not on R2.
 */
export function ListingVideoField({ value, onChange, config, persistedUrl, onBusyChange }: ListingVideoFieldProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const valueRef = React.useRef(value);
  React.useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const [phase, setPhase] = React.useState<Phase>({ kind: "idle" });
  const busy = phase.kind !== "idle";

  React.useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  React.useEffect(() => () => abortRef.current?.abort(), []);

  /** Files of a video that was uploaded here and never saved on the listing. */
  const discard = React.useCallback(
    (v: ClassifiedVideoDraft | null) => {
      if (v && v.url !== persistedUrl) void discardUploadedMedia([v.url, v.posterUrl]);
    },
    [persistedUrl],
  );

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setPhase({ kind: "preparing" });
    let preview: string | null = null;
    let posterUrl: string | null = null;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const prepared = await prepareVideo(file);
      preview = prepared.poster ? URL.createObjectURL(prepared.poster) : null;
      setPhase({ kind: "uploading", progress: 0, preview });
      if (prepared.poster) posterUrl = (await uploadMedia("listing-poster", prepared.poster, { signal: controller.signal })).url;
      const uploaded = await uploadMedia("listing-video", prepared.blob, {
        signal: controller.signal,
        onProgress: (p) => setPhase({ kind: "uploading", progress: Math.round(p * 100), preview }),
      });
      const previous = valueRef.current;
      const next: ClassifiedVideoDraft = {
        url: uploaded.url,
        posterUrl,
        durationS: Math.round(prepared.durationS * 100) / 100,
        width: prepared.width,
        height: prepared.height,
      };
      valueRef.current = next;
      onChange(next);
      discard(previous);
      notify.success("Video eklendi", prepared.removed.length ? "Konum bilgisi videodan silindi." : undefined);
    } catch (e) {
      if (posterUrl) void discardUploadedMedia([posterUrl]);
      if (e instanceof MediaUploadError && e.code === "aborted") notify.info("Video yüklemesi iptal edildi");
      else if (e instanceof VideoPrepError || e instanceof MediaUploadError) notify.error("Video eklenemedi", e.message);
      else notify.error("Video eklenemedi", "Bir sorun oldu. Tekrar dene.");
    } finally {
      if (preview) URL.revokeObjectURL(preview);
      abortRef.current = null;
      setPhase({ kind: "idle" });
    }
  };

  const remove = () => {
    const previous = valueRef.current;
    valueRef.current = null;
    onChange(null);
    discard(previous);
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPTED_VIDEO_TYPES}
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        void onPick(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );

  const available = config?.video === true;

  if (!available) {
    return (
      <div className={cn(tile, "opacity-80")} aria-disabled="true">
        <span className={cn(iconBubble, "bg-muted text-muted-foreground")}>
          {config ? <Video className="size-6" aria-hidden /> : <Loader2 className="size-5 animate-spin" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-muted-foreground">{TITLE}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">İlanına kısa bir video ekleyebileceksin.</span>
        </span>
        {config ? <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">Video yakında</span> : null}
      </div>
    );
  }

  if (phase.kind !== "idle") {
    const uploading = phase.kind === "uploading";
    return (
      <div className={cn(tile, "flex-col items-stretch")} aria-live="polite" aria-busy="true">
        <div className="flex items-center gap-3">
          {uploading && phase.preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={phase.preview} alt="" className="size-12 shrink-0 rounded-xl bg-black object-cover" />
          ) : (
            <span className={iconBubble}>
              <Loader2 className="size-5 animate-spin" aria-hidden />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">{uploading ? `Video yükleniyor %${phase.progress}` : "Video hazırlanıyor…"}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{uploading ? "Bu ekranda kal, birazdan biter." : "Konum bilgisi siliniyor, kapak hazırlanıyor."}</span>
          </span>
          {uploading ? (
            <button type="button" onClick={() => abortRef.current?.abort()} className={cn(pillButton, "px-3")} aria-label="Yüklemeyi iptal et">
              <X className="size-4" aria-hidden /> İptal
            </button>
          ) : null}
        </div>
        {uploading ? <Progress value={phase.progress} className="mt-3 h-1.5" aria-label="Video yükleme durumu" /> : null}
      </div>
    );
  }

  if (value) {
    return (
      <div className={cn(tile, "items-start")}>
        {fileInput}
        <div className="relative aspect-video w-32 shrink-0 overflow-hidden rounded-xl bg-black">
          {value.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.posterUrl} alt="" className="size-full object-cover" />
          ) : null}
          <span className="absolute inset-0 m-auto flex size-9 items-center justify-center rounded-full bg-black/55 text-white" aria-hidden>
            <Play className="size-4 translate-x-px fill-current" />
          </span>
          <span className="absolute right-1 bottom-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-bold text-white tabular-nums">
            {formatVideoDuration(value.durationS)}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Video eklendi</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Fotoğraflardan sonra ikinci sırada görünür.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={pillButton} onClick={() => inputRef.current?.click()}>
              <RefreshCw className="size-4" aria-hidden /> Değiştir
            </button>
            <button type="button" className={cn(pillButton, "text-destructive")} onClick={remove}>
              <Trash2 className="size-4" aria-hidden /> Kaldır
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {fileInput}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(tile, "min-h-18 transition-colors hover:bg-card/80 outline-none focus-visible:ring-3 focus-visible:ring-ring/50")}
      >
        <span className={iconBubble}>
          <Video className="size-6" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{TITLE}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">MP4 ya da MOV, en fazla 100 MB. Konum bilgisi otomatik silinir.</span>
        </span>
      </button>
    </>
  );
}
