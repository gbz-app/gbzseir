"use client";

import * as React from "react";
import { ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { STORAGE_BUCKETS } from "@/lib/db-contract";
import { useAuth } from "@/lib/auth/auth-provider";
import { ACCEPTED_IMAGE_TYPES, processImage, uuid } from "@/lib/images";
import { notify } from "@/lib/notify";
import type { EventCover } from "../draft";

/**
 * Landscape event cover: resized on the device (<= 1600 px, WebP, EXIF/GPS stripped) and uploaded to
 * media/<uid>/events/<uuid>.webp. A replaced file is kept: a saved event may still show it until the edit is saved.
 */
export function EventCoverPicker({
  value,
  onChange,
  onUploadingChange,
}: {
  value: EventCover | null;
  onChange: (value: EventCover | null) => void;
  onUploadingChange?: (uploading: boolean) => void;
}) {
  const { user } = useAuth();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const busy = preview !== null;

  const upload = async (file: File) => {
    if (!user) return;
    const local = URL.createObjectURL(file);
    setPreview(local);
    onUploadingChange?.(true);
    try {
      const processed = await processImage(file, { maxSize: 1600, thumbSize: 320 });
      const path = `${user.id}/events/${uuid()}.${processed.full.ext}`;
      const bucket = createClient().storage.from(STORAGE_BUCKETS.media);
      const { error } = await bucket.upload(path, processed.full.blob, { cacheControl: "31536000", upsert: false, contentType: processed.full.mime });
      if (error) {
        throw new Error(
          /row-level security|quota/i.test(error.message)
            ? "Fotoğraf yüklenemedi. Bugünkü yükleme sınırına ulaşmış olabilirsin."
            : "Fotoğraf yüklenemedi. Bağlantını kontrol edip tekrar dene.",
        );
      }
      onChange({ url: bucket.getPublicUrl(path).data.publicUrl, path });
    } catch (e) {
      notify.error((e as Error).message || "Fotoğraf yüklenemedi.");
    } finally {
      URL.revokeObjectURL(local);
      setPreview(null);
      onUploadingChange?.(false);
    }
  };

  const pick = () => inputRef.current?.click();
  const shown = preview ?? value?.url ?? null;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={pick}
        disabled={busy || !user}
        aria-label={value ? "Kapak fotoğrafını değiştir" : "Kapak fotoğrafı seç"}
        className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-3xl bg-card outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-80"
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" className={cn("absolute inset-0 size-full object-cover", preview && "opacity-60")} />
        ) : (
          <span className="flex flex-col items-center gap-2 px-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-primary">
              <ImagePlus className="size-7" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="font-semibold">Kapak fotoğrafı seç</span>
            <span className="text-sm text-muted-foreground">Yatay bir afiş ya da fotoğraf en iyi görünür.</span>
          </span>
        )}
        {busy ? <Loader2 className="absolute inset-0 m-auto size-8 animate-spin text-primary" aria-label="Yükleniyor" /> : null}
      </button>
      {value ? (
        <div className="mt-3 flex gap-2">
          <Button type="button" variant="secondary" className="flex-1 bg-card" onClick={pick} disabled={busy}>
            <RefreshCw /> Değiştir
          </Button>
          <Button type="button" variant="ghost" className="text-destructive" onClick={() => onChange(null)} disabled={busy}>
            <Trash2 /> Kaldır
          </Button>
        </div>
      ) : null}
    </div>
  );
}
