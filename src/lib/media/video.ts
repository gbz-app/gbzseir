"use client";

import { FREE_TYPE, IsoBmffError, planMetadataStrip, type ByteSource } from "./iso-bmff";
import { VIDEO_DURATION_TOLERANCE, VIDEO_MAX_BYTES, VIDEO_MAX_SECONDS } from "./kinds";

/**
 * Client-side video preparation for the listing video (no re-encoding, no dependency):
 * 1. type from MIME or extension (mp4/m4v/mov/webm), size <= 100 MB
 * 2. MP4/MOV: location metadata removed in place (iso-bmff.ts renames udta/meta/XMP boxes to `free`); a file that
 *    does not parse is refused, never uploaded raw. WebM is kept as is (phones record MP4/MOV; browser-made WebM
 *    carries no location).
 * 3. duration from moov/mvhd, else from the <video> element; must be <= 60 s
 * 4. poster: a JPEG frame at ~1 s drawn on a canvas (<= 1280 px, <= 1 MB); null when the browser cannot decode it.
 */

export const ACCEPTED_VIDEO_TYPES = "video/mp4,video/quicktime,video/webm,.mp4,.m4v,.mov,.webm";

export type VideoContentType = "video/mp4" | "video/quicktime" | "video/webm";

export class VideoPrepError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VideoPrepError";
  }
}

export type PreparedVideo = {
  blob: Blob;
  contentType: VideoContentType;
  durationS: number;
  width: number | null;
  height: number | null;
  poster: Blob | null;
  /** Metadata boxes that were neutralised, e.g. ["moov/meta", "moov/udta"]. */
  removed: string[];
};

export function videoContentType(file: File): VideoContentType | null {
  const t = file.type.toLowerCase();
  if (t === "video/mp4" || t === "video/quicktime" || t === "video/webm") return t;
  if (t === "video/x-m4v") return "video/mp4";
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (ext === "mp4" || ext === "m4v") return "video/mp4";
  if (ext === "mov" || ext === "qt") return "video/quicktime";
  if (ext === "webm") return "video/webm";
  return null;
}

function blobSource(file: Blob): ByteSource {
  return { size: file.size, read: async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()) };
}

/** Rebuilds the file from slices with the 4-byte type fields at `patches` replaced by "free" (same size). */
function applyPatches(file: Blob, patches: number[], type: string): Blob {
  const parts: BlobPart[] = [];
  let cursor = 0;
  for (const p of [...patches].sort((a, b) => a - b)) {
    parts.push(file.slice(cursor, p), FREE_TYPE);
    cursor = p + 4;
  }
  parts.push(file.slice(cursor));
  return new Blob(parts, { type });
}

function waitFor(el: HTMLVideoElement, event: string, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      clearTimeout(timer);
      el.removeEventListener(event, onEvent);
      el.removeEventListener("error", onError);
      resolve(ok);
    };
    const onEvent = () => done(true);
    const onError = () => done(false);
    const timer = setTimeout(() => done(false), ms);
    el.addEventListener(event, onEvent, { once: true });
    el.addEventListener("error", onError, { once: true });
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", quality));
}

type Inspected = { durationS: number | null; width: number | null; height: number | null; poster: Blob | null };

/** Duration, size and a poster frame through a hidden <video>. Never throws. */
async function inspect(blob: Blob): Promise<Inspected> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.setAttribute("playsinline", "");
  video.setAttribute("muted", "");
  const out: Inspected = { durationS: null, width: null, height: null, poster: null };
  try {
    video.src = url;
    if (!(await waitFor(video, "loadedmetadata", 15000))) return out;
    out.durationS = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
    out.width = video.videoWidth || null;
    out.height = video.videoHeight || null;

    if (video.readyState < 2 && !(await waitFor(video, "loadeddata", 6000))) {
      // iOS Safari may not load frames until playback starts; a muted inline play is allowed.
      try {
        await video.play();
        video.pause();
      } catch {
        /* ignore */
      }
    }
    const at = out.durationS ? Math.min(1, out.durationS / 2) : 0.1;
    video.currentTime = at;
    if (!(await waitFor(video, "seeked", 8000)) || !video.videoWidth || !video.videoHeight) return out;

    const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return out;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.65, 0.5]) {
      const b = await canvasToBlob(canvas, quality);
      if (b && b.type === "image/jpeg" && b.size <= 1024 * 1024) {
        out.poster = b;
        break;
      }
    }
    return out;
  } catch {
    return out;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

const TOO_LONG = (s: number) => `Video en fazla ${VIDEO_MAX_SECONDS} saniye olabilir (seçtiğin video ${Math.round(s)} sn).`;

/** Validates and prepares a picked file. Throws VideoPrepError with a friendly Turkish message. */
export async function prepareVideo(file: File): Promise<PreparedVideo> {
  const contentType = videoContentType(file);
  if (!contentType) throw new VideoPrepError("Bu dosya bir video değil. MP4, MOV ya da WebM bir video seç.");
  if (file.size > VIDEO_MAX_BYTES) throw new VideoPrepError("Video en fazla 100 MB olabilir. Daha kısa ya da daha düşük çözünürlüklü bir video dene.");
  if (file.size < 1024) throw new VideoPrepError("Bu video açılamadı. Başka bir video dene.");
  const limit = VIDEO_MAX_SECONDS + VIDEO_DURATION_TOLERANCE;

  let blob: Blob;
  let removed: string[] = [];
  let boxDuration: number | null = null;
  if (contentType === "video/webm") {
    blob = file.slice(0, file.size, contentType);
  } else {
    try {
      const plan = await planMetadataStrip(blobSource(file));
      removed = plan.renamed;
      boxDuration = plan.durationS;
      blob = applyPatches(file, plan.patches, contentType);
    } catch (e) {
      if (e instanceof IsoBmffError) {
        throw new VideoPrepError("Bu videonun konum bilgisini temizleyemedik, o yüzden yüklemiyoruz. Telefonunun kamerasıyla çektiğin bir MP4 ya da MOV dene.");
      }
      throw new VideoPrepError("Video okunamadı. Tekrar dene.");
    }
    if (boxDuration != null && boxDuration > limit) throw new VideoPrepError(TOO_LONG(boxDuration));
  }

  const info = await inspect(blob);
  const durationS = boxDuration ?? info.durationS;
  if (durationS == null) throw new VideoPrepError("Videonun süresi okunamadı. Başka bir video dene.");
  if (durationS > limit) throw new VideoPrepError(TOO_LONG(durationS));
  return { blob, contentType, durationS: Math.min(durationS, limit), width: info.width, height: info.height, poster: info.poster, removed };
}
