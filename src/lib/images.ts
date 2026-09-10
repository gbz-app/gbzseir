"use client";

/**
 * Client-side image processing: decode -> (EXIF orientation applied) -> resize on a canvas -> re-encode.
 * Re-encoding through a canvas drops ALL metadata (EXIF, GPS). WebP q0.8 is used; browsers that cannot
 * encode WebP (older iOS Safari) fall back to JPEG.
 */

export type EncodedImage = { blob: Blob; width: number; height: number; mime: "image/webp" | "image/jpeg"; ext: "webp" | "jpg" };
export type ProcessedImage = { full: EncodedImage; thumb: EncodedImage };

export type ProcessImageOptions = {
  /** Longest side of the full image (default 1600). */
  maxSize?: number;
  /** Longest side of the thumbnail (default 480). */
  thumbSize?: number;
  /** 0..1 (default 0.8). */
  quality?: number;
};

export const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif";
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall through to <img> decoding (e.g. HEIC on Safari) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("Bu fotoğraf açılamadı. JPG, PNG ya da WebP bir fotoğraf dene.");
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

async function encode(img: Decoded, maxSize: number, quality: number): Promise<EncodedImage> {
  const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Fotoğraf işlenemedi.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img.source, 0, 0, width, height);
  let blob = await toBlob(canvas, "image/webp", quality);
  if (blob && blob.type === "image/webp") return { blob, width, height, mime: "image/webp", ext: "webp" };
  blob = await toBlob(canvas, "image/jpeg", quality);
  if (!blob) throw new Error("Fotoğraf işlenemedi.");
  return { blob, width, height, mime: "image/jpeg", ext: "jpg" };
}

/** Resize + strip metadata. Produces a full image (<= maxSize) and a thumbnail (<= thumbSize). */
export async function processImage(file: File, opts: ProcessImageOptions = {}): Promise<ProcessedImage> {
  if (!file.type.startsWith("image/") && !/\.(heic|heif)$/i.test(file.name)) throw new Error("Lütfen bir fotoğraf seç.");
  if (file.size > MAX_INPUT_BYTES) throw new Error("Fotoğraf çok büyük (en fazla 25 MB).");
  const img = await decode(file);
  try {
    const full = await encode(img, opts.maxSize ?? 1600, opts.quality ?? 0.8);
    const thumb = await encode(img, opts.thumbSize ?? 480, opts.quality ?? 0.8);
    return { full, thumb };
  } finally {
    img.close();
  }
}

/** RFC4122 v4 id (crypto.randomUUID with a fallback for older browsers). */
export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
