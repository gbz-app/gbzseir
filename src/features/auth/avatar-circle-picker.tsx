"use client";

import * as React from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { UploadedImage } from "@/components/shared/image-uploader";
import { createClient } from "@/lib/supabase/client";
import { STORAGE_BUCKETS } from "@/lib/db-contract";
import { useAuth } from "@/lib/auth/auth-provider";
import { ACCEPTED_IMAGE_TYPES, processImage, uuid } from "@/lib/images";

/** Centre square crop (EXIF orientation applied) so the avatar is round everywhere. Keeps the file when it cannot be decoded here. */
async function cropSquare(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function") return file;
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file; // e.g. HEIC on Chrome: processImage decodes it its own way
  }
  try {
    if (bmp.width === bmp.height) return file;
    const side = Math.min(bmp.width, bmp.height);
    const out = Math.min(side, 1600);
    const canvas = document.createElement("canvas");
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, out, out);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, out, out);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
    return blob ? new File([blob], "avatar.jpg", { type: "image/jpeg" }) : file;
  } finally {
    bmp.close();
  }
}

/**
 * Big grey circle with a camera icon: tap to pick a photo, shown cropped as a circle.
 * Uploads like the profile edit screen (ImageUploader, prefix "avatar-"): media/<uid>/avatar-<uuid>.webp + _thumb.
 */
export function AvatarCirclePicker({
  value,
  onChange,
  onUploadingChange,
  inputRef,
}: {
  value: UploadedImage | null;
  onChange: (img: UploadedImage | null) => void;
  onUploadingChange?: (uploading: boolean) => void;
  /** The hidden file input, so the page's main button can open the picker too. */
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = React.useState(false);
  // Local object URL of the picked (cropped) photo: shown at once and kept after the upload (no flash while the remote image loads).
  const [local, setLocal] = React.useState<{ src: string; url: string | null } | null>(null);
  const localRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    onUploadingChange?.(busy);
  }, [busy, onUploadingChange]);

  React.useEffect(
    () => () => {
      if (localRef.current) URL.revokeObjectURL(localRef.current);
    },
    [],
  );

  const showLocal = (src: string | null, url: string | null = null) => {
    if (localRef.current && localRef.current !== src) URL.revokeObjectURL(localRef.current);
    localRef.current = src;
    setLocal(src ? { src, url } : null);
  };

  const removeFromStorage = async (img: UploadedImage, uid: string) => {
    const paths = [img.path, img.thumbPath].filter((p) => p && p.startsWith(`${uid}/`));
    if (paths.length) await createClient().storage.from(STORAGE_BUCKETS.media).remove(paths).catch(() => undefined);
  };

  const onFile = async (file: File | undefined) => {
    if (!file || busy) return;
    const supabase = createClient();
    const uid = user?.id ?? (await supabase.auth.getUser()).data.user?.id;
    if (!uid) {
      toast.error("Oturumun kapanmış. Lütfen tekrar giriş yap.");
      return;
    }
    const previous = value;
    setBusy(true);
    try {
      const square = await cropSquare(file);
      const src = URL.createObjectURL(square);
      showLocal(src);
      const processed = await processImage(square);
      const id = uuid();
      const path = `${uid}/avatar-${id}.${processed.full.ext}`;
      const thumbPath = `${uid}/avatar-${id}_thumb.${processed.thumb.ext}`;
      const bucket = supabase.storage.from(STORAGE_BUCKETS.media);
      const opts = { cacheControl: "31536000", upsert: false };
      const [a, b] = await Promise.all([
        bucket.upload(path, processed.full.blob, { ...opts, contentType: processed.full.mime }),
        bucket.upload(thumbPath, processed.thumb.blob, { ...opts, contentType: processed.thumb.mime }),
      ]);
      if (a.error || b.error) throw new Error("Fotoğraf yüklenemedi. Bağlantını kontrol edip tekrar dene.");
      const url = bucket.getPublicUrl(path).data.publicUrl;
      showLocal(src, url);
      onChange({ url, thumbUrl: bucket.getPublicUrl(thumbPath).data.publicUrl, path, thumbPath, width: processed.full.width, height: processed.full.height });
      if (previous) void removeFromStorage(previous, uid);
    } catch (e) {
      showLocal(null);
      toast.error((e as Error).message || "Fotoğraf yüklenemedi.");
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!value) return;
    const img = value;
    showLocal(null);
    onChange(null);
    if (user) void removeFromStorage(img, user.id);
  };

  const open = () => inputRef.current?.click();
  const src = local && (busy || (value && local.url === value.url)) ? local.src : (value?.thumbUrl ?? value?.url ?? null);

  return (
    <div className="flex flex-col items-center">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          void onFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={open}
        disabled={busy}
        aria-label={value ? "Profil fotoğrafını değiştir" : "Profil fotoğrafı seç"}
        className="relative flex size-44 items-center justify-center overflow-hidden rounded-full bg-neutral-200 text-neutral-500 transition-transform outline-none active:scale-[0.98] focus-visible:ring-4 focus-visible:ring-ring/50 dark:bg-neutral-800 dark:text-neutral-400"
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="size-full object-cover" />
        ) : (
          <Camera className="size-12" strokeWidth={1.6} aria-hidden />
        )}
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white">
            <Loader2 className="size-8 animate-spin" aria-label="Fotoğraf yükleniyor" />
          </span>
        ) : null}
      </button>
      <div className="mt-3 flex min-h-11 items-center gap-1">
        {value ? (
          <>
            <Button type="button" variant="ghost" className="font-semibold text-primary" disabled={busy} onClick={open}>
              Değiştir
            </Button>
            <Button type="button" variant="ghost" className="font-semibold text-destructive" disabled={busy} onClick={remove}>
              Kaldır
            </Button>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">{busy ? "Yükleniyor…" : "Dokun, fotoğraf seç"}</span>
        )}
      </div>
    </div>
  );
}
