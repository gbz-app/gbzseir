"use client";

import * as React from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { STORAGE_BUCKETS } from "@/lib/db-contract";
import { useAuth } from "@/lib/auth/auth-provider";
import { ACCEPTED_IMAGE_TYPES, processImage, uuid } from "@/lib/images";

/** A single uploaded image in the public media bucket. `path` is null for images we did not upload (seed data). */
export type PickedImage = { url: string; path: string | null };

/** Storage path of a public media URL when it belongs to `uid` (so it may be deleted), else null. */
export function mediaPathFromUrl(url: string | null | undefined, uid: string | null | undefined): string | null {
  if (!url || !uid) return null;
  const marker = `/storage/v1/object/public/${STORAGE_BUCKETS.media}/`;
  const i = url.indexOf(marker);
  if (i < 0) return null;
  const path = decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
  return path.startsWith(`${uid}/`) ? path : null;
}

export type BusinessImagePickerProps = {
  value: PickedImage | null;
  onChange: (value: PickedImage | null) => void;
  label?: string;
  hint?: string;
  /** File name prefix under media/<uid>/business/ */
  prefix?: string;
  /** Delete the previous file from storage when it is replaced/removed (only when nothing else references it). */
  deleteReplaced?: boolean;
  onUploadingChange?: (uploading: boolean) => void;
  id?: string;
  className?: string;
};

/**
 * Square logo picker: resize on the device (<= 800 px, WebP, EXIF/GPS stripped) and upload to
 * media/<uid>/business/<prefix><uuid>.webp.
 */
export function BusinessImagePicker({
  value,
  onChange,
  label = "Logo",
  hint = "Kare, sade bir logo en iyi görünür. İsteğe bağlı.",
  prefix = "logo-",
  deleteReplaced,
  onUploadingChange,
  id,
  className,
}: BusinessImagePickerProps) {
  const { user } = useAuth();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const busy = preview !== null;

  const removeFile = (img: PickedImage | null) => {
    if (!deleteReplaced || !img?.path || !user || !img.path.startsWith(`${user.id}/`)) return;
    void createClient().storage.from(STORAGE_BUCKETS.media).remove([img.path]).catch(() => undefined);
  };

  const upload = async (file: File) => {
    if (!user) return;
    const local = URL.createObjectURL(file);
    setPreview(local);
    onUploadingChange?.(true);
    try {
      const processed = await processImage(file, { maxSize: 800, thumbSize: 200 });
      const path = `${user.id}/business/${prefix}${uuid()}.${processed.full.ext}`;
      const bucket = createClient().storage.from(STORAGE_BUCKETS.media);
      const { error } = await bucket.upload(path, processed.full.blob, { cacheControl: "31536000", upsert: false, contentType: processed.full.mime });
      if (error) throw new Error("Fotoğraf yüklenemedi. Bağlantını kontrol edip tekrar dene.");
      const previous = value;
      onChange({ url: bucket.getPublicUrl(path).data.publicUrl, path });
      removeFile(previous);
    } catch (e) {
      toast.error((e as Error).message || "Fotoğraf yüklenemedi.");
    } finally {
      URL.revokeObjectURL(local);
      setPreview(null);
      onUploadingChange?.(false);
    }
  };

  const shown = preview ?? value?.url ?? null;

  return (
    <div className={cn("flex items-center gap-4", className)}>
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
        id={id}
        type="button"
        disabled={busy || !user}
        onClick={() => inputRef.current?.click()}
        aria-label={value ? `${label}: değiştir` : `${label} ekle`}
        className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border-2 border-dashed border-primary/40 bg-brand-soft/50 text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-70"
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" className={cn("size-full object-cover", preview && "opacity-60")} />
        ) : (
          <ImagePlus className="size-8" aria-hidden />
        )}
        {busy ? <Loader2 className="absolute inset-0 m-auto size-7 animate-spin text-primary" aria-label="Yükleniyor" /> : null}
      </button>
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{label}</p>
        <p className="text-muted-foreground">{hint}</p>
        <div className="mt-1 flex gap-1">
          <Button type="button" variant="link" size="sm" className="h-9 px-0" disabled={busy || !user} onClick={() => inputRef.current?.click()}>
            {value ? "Değiştir" : "Fotoğraf seç"}
          </Button>
          {value ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-9 px-2 text-destructive"
              disabled={busy}
              onClick={() => {
                removeFile(value);
                onChange(null);
              }}
            >
              Kaldır
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
