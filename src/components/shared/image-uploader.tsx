"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Camera, ImagePlus, Loader2, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentPath } from "@/lib/auth/hooks";
import { createClient } from "@/lib/supabase/client";
import { STORAGE_BUCKETS } from "@/lib/db-contract";
import { useAuth } from "@/lib/auth/auth-provider";
import { ACCEPTED_IMAGE_TYPES, processImage, uuid } from "@/lib/images";
import { routes } from "@/core/routes";

/** One uploaded image (public URLs in the `media` bucket). The first item of a list is the cover. */
export type UploadedImage = {
  url: string;
  thumbUrl: string;
  /** Storage object paths (for deletion). */
  path: string;
  thumbPath: string;
  width?: number;
  height?: number;
};

export type ImageUploaderProps = {
  value: UploadedImage[];
  onChange: (images: UploadedImage[]) => void;
  /** Maximum number of images (default 8; avatar variant always 1). */
  max?: number;
  /** Sub folder under <uid>/ : 'listings', 'business', 'requests'... (avatar variant: none). */
  folder?: string;
  /** File name prefix, e.g. 'avatar-' -> <uid>/avatar-<uuid>.webp */
  fileNamePrefix?: string;
  /** 'grid' (listing photos) or 'avatar' (single round picture). */
  variant?: "grid" | "avatar";
  label?: string;
  hint?: string;
  disabled?: boolean;
  /** Notified while files are being processed/uploaded (disable submit buttons). */
  onUploadingChange?: (uploading: boolean) => void;
  className?: string;
};

type Pending = { key: string; preview: string };

/**
 * Multi-image uploader: client-side resize (max 1600px + 480px thumb, WebP q0.8, EXIF/GPS stripped),
 * upload to media/<uid>/<folder>/<uuid>.webp, reorder by drag or arrows, first = cover.
 */
export function ImageUploader({
  value,
  onChange,
  max = 8,
  folder,
  fileNamePrefix = "",
  variant = "grid",
  label,
  hint,
  disabled,
  onUploadingChange,
  className,
}: ImageUploaderProps) {
  const { user, loading: authLoading } = useAuth();
  const currentPath = useCurrentPath();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const valueRef = React.useRef(value);
  React.useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const [pending, setPending] = React.useState<Pending[]>([]);
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const limit = variant === "avatar" ? 1 : max;
  const remaining = Math.max(0, limit - value.length - pending.length);
  const uploading = pending.length > 0;

  React.useEffect(() => {
    onUploadingChange?.(uploading);
  }, [uploading, onUploadingChange]);

  const buildPath = (id: string, ext: string, suffix = "") =>
    `${user!.id}/${folder ? `${folder.replace(/^\/+|\/+$/g, "")}/` : ""}${fileNamePrefix}${id}${suffix}.${ext}`;

  const uploadOne = async (file: File): Promise<UploadedImage> => {
    const processed = await processImage(file);
    const id = uuid();
    const path = buildPath(id, processed.full.ext);
    const thumbPath = buildPath(id, processed.thumb.ext, "_thumb");
    const bucket = createClient().storage.from(STORAGE_BUCKETS.media);
    const opts = { cacheControl: "31536000", upsert: false };
    const [a, b] = await Promise.all([
      bucket.upload(path, processed.full.blob, { ...opts, contentType: processed.full.mime }),
      bucket.upload(thumbPath, processed.thumb.blob, { ...opts, contentType: processed.thumb.mime }),
    ]);
    if (a.error || b.error) throw new Error("Fotoğraf yüklenemedi. Bağlantını kontrol edip tekrar dene.");
    return {
      url: bucket.getPublicUrl(path).data.publicUrl,
      thumbUrl: bucket.getPublicUrl(thumbPath).data.publicUrl,
      path,
      thumbPath,
      width: processed.full.width,
      height: processed.full.height,
    };
  };

  const onFiles = async (files: FileList | null) => {
    if (!files || !user) return;
    const list = Array.from(files).slice(0, variant === "avatar" ? 1 : remaining);
    if (list.length === 0) {
      toast.error(`En fazla ${limit} fotoğraf ekleyebilirsin.`);
      return;
    }
    if (files.length > list.length && variant !== "avatar") toast.message(`Sadece ${list.length} fotoğraf eklendi (en fazla ${limit}).`);
    const items: Pending[] = list.map((f) => ({ key: uuid(), preview: URL.createObjectURL(f) }));
    setPending((p) => [...p, ...items]);
    for (let i = 0; i < list.length; i++) {
      try {
        const img = await uploadOne(list[i]);
        if (variant === "avatar") {
          const old = valueRef.current;
          valueRef.current = [img];
          onChange([img]);
          void removeFromStorage(old);
        } else {
          valueRef.current = [...valueRef.current, img];
          onChange(valueRef.current);
        }
      } catch (e) {
        toast.error((e as Error).message || "Fotoğraf yüklenemedi.");
      } finally {
        URL.revokeObjectURL(items[i].preview);
        setPending((p) => p.filter((x) => x.key !== items[i].key));
      }
    }
  };

  const removeFromStorage = async (imgs: UploadedImage[]) => {
    const paths = imgs.flatMap((i) => [i.path, i.thumbPath]).filter((p) => user && p.startsWith(`${user.id}/`));
    if (paths.length) await createClient().storage.from(STORAGE_BUCKETS.media).remove(paths).catch(() => undefined);
  };

  const remove = (index: number) => {
    const img = value[index];
    onChange(value.filter((_, i) => i !== index));
    if (img) void removeFromStorage([img]);
  };

  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length || from === to) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPTED_IMAGE_TYPES}
      multiple={variant !== "avatar"}
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        void onFiles(e.target.files);
        e.target.value = "";
      }}
    />
  );

  if (authLoading) {
    return (
      <div className={cn("flex items-center gap-4", className)} aria-busy="true">
        <Skeleton className={variant === "avatar" ? "size-24 rounded-full" : "aspect-square w-1/3 rounded-xl"} />
        {variant === "avatar" ? <Skeleton className="h-10 w-40" /> : null}
      </div>
    );
  }

  if (!user) {
    return (
      <div className={cn("rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground", className)}>
        Fotoğraf eklemek için{" "}
        <Link className="font-semibold text-primary underline" href={routes.auth.login(currentPath)}>
          giriş yap
        </Link>
        .
      </div>
    );
  }

  if (variant === "avatar") {
    const current = value[0];
    const preview = pending[0]?.preview ?? current?.thumbUrl ?? current?.url;
    return (
      <div className={cn("flex items-center gap-4", className)}>
        {fileInput}
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
          aria-label={current ? "Profil fotoğrafını değiştir" : "Profil fotoğrafı ekle"}
          className="relative size-24 shrink-0 overflow-hidden rounded-full bg-muted ring-4 ring-background outline-none focus-visible:ring-ring/50"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="size-full object-cover" />
          ) : (
            <UserRound className="absolute inset-0 m-auto size-10 text-muted-foreground" aria-hidden />
          )}
          <span className="absolute right-0 bottom-0 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground ring-2 ring-background">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
          </span>
        </button>
        <div className="min-w-0 text-sm">
          <p className="font-semibold">{label ?? "Profil fotoğrafı"}</p>
          <p className="text-muted-foreground">{hint ?? "İsteğe bağlı. Yüzünün net göründüğü bir fotoğraf seç."}</p>
          <div className="mt-1 flex gap-1">
            <Button type="button" variant="link" size="sm" className="h-8 px-0" disabled={disabled || uploading} onClick={() => inputRef.current?.click()}>
              {current ? "Değiştir" : "Fotoğraf seç"}
            </Button>
            {current ? (
              <Button type="button" variant="link" size="sm" className="h-8 px-2 text-destructive" disabled={uploading} onClick={() => remove(0)}>
                Kaldır
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      {fileInput}
      {label ? <p className="mb-1 text-sm font-semibold">{label}</p> : null}
      <p className="mb-3 text-xs text-muted-foreground">
        {hint ?? "İlk fotoğraf kapak olur. Sürükleyerek ya da oklarla sıralayabilirsin."} ({value.length}/{limit})
      </p>
      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {value.map((img, i) => (
          <li
            key={img.path}
            draggable={!disabled}
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null) move(dragIndex, i);
              setDragIndex(null);
            }}
            onDragEnd={() => setDragIndex(null)}
            className={cn(
              "group relative aspect-square overflow-hidden rounded-xl bg-muted ring-1 ring-foreground/5",
              dragIndex === i && "opacity-50",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.thumbUrl} alt={`Fotoğraf ${i + 1}`} className="size-full object-cover" draggable={false} />
            {i === 0 ? (
              <span className="absolute top-1.5 left-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[11px] font-bold text-white">Kapak</span>
            ) : null}
            <button
              type="button"
              onClick={() => remove(i)}
              disabled={disabled}
              aria-label={`Fotoğraf ${i + 1}: kaldır`}
              className="absolute top-1 right-1 flex size-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/75"
            >
              <Trash2 className="size-4" />
            </button>
            <div className="absolute inset-x-1 bottom-1 flex justify-between">
              <button
                type="button"
                onClick={() => move(i, i - 1)}
                disabled={disabled || i === 0}
                aria-label={`Fotoğraf ${i + 1}: sola taşı`}
                className="flex size-8 items-center justify-center rounded-full bg-black/60 text-white disabled:invisible"
              >
                <ArrowLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => move(i, i + 1)}
                disabled={disabled || i === value.length - 1}
                aria-label={`Fotoğraf ${i + 1}: sağa taşı`}
                className="flex size-8 items-center justify-center rounded-full bg-black/60 text-white disabled:invisible"
              >
                <ArrowRight className="size-4" />
              </button>
            </div>
          </li>
        ))}
        {pending.map((p) => (
          <li key={p.key} className="relative aspect-square overflow-hidden rounded-xl bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.preview} alt="" className="size-full object-cover opacity-50" />
            <Loader2 className="absolute inset-0 m-auto size-6 animate-spin text-primary" aria-label="Yükleniyor" />
          </li>
        ))}
        {remaining > 0 ? (
          <li>
            <button
              type="button"
              disabled={disabled}
              onClick={() => inputRef.current?.click()}
              className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary/40 bg-brand-soft/50 text-sm font-semibold text-primary transition-colors hover:bg-brand-soft disabled:opacity-50"
            >
              <ImagePlus className="size-6" aria-hidden />
              Fotoğraf ekle
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
