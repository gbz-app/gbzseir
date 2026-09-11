"use client";

import * as React from "react";
import type { MediaKind, MediaProviderId } from "./kinds";
import type { CreatedUpload } from "./types";

/**
 * Browser side of the media adapter: asks /api/media/upload-url for a presigned PUT and sends the file with an XHR
 * (upload progress, abort). The server decides the store (R2 when configured, else Supabase).
 */

export type MediaConfig = { provider: MediaProviderId; video: boolean };

const FALLBACK: MediaConfig = { provider: "supabase", video: false };
let configPromise: Promise<MediaConfig> | null = null;

/** Which store new uploads go to (cached per page load; falls back to Supabase / no video on errors). */
export function getMediaConfig(): Promise<MediaConfig> {
  if (configPromise) return configPromise;
  const pending: Promise<MediaConfig> = fetch("/api/media/upload-url", { cache: "no-store", credentials: "same-origin" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { provider?: unknown; video?: unknown } | null): MediaConfig => {
      if (j?.provider === "r2") return { provider: "r2", video: j.video === true };
      if (j?.provider === "supabase") return { provider: "supabase", video: false };
      return FALLBACK;
    })
    .catch((): MediaConfig => {
      configPromise = null;
      return FALLBACK;
    });
  configPromise = pending;
  return pending;
}

/** null while loading. */
export function useMediaConfig(): MediaConfig | null {
  const [config, setConfig] = React.useState<MediaConfig | null>(null);
  React.useEffect(() => {
    let alive = true;
    void getMediaConfig().then((c) => {
      if (alive) setConfig(c);
    });
    return () => {
      alive = false;
    };
  }, []);
  return config;
}

export class MediaUploadError extends Error {
  code: string;
  constructor(message: string, code = "error") {
    super(message);
    this.name = "MediaUploadError";
    this.code = code;
  }
}

const NETWORK_MESSAGE = "Dosya yüklenemedi. Bağlantını kontrol edip tekrar dene.";

export async function requestUpload(kind: MediaKind, contentType: string, size: number, signal?: AbortSignal): Promise<CreatedUpload> {
  let res: Response;
  try {
    res = await fetch("/api/media/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ kind, contentType, size }),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw new MediaUploadError("Yükleme iptal edildi.", "aborted");
    throw new MediaUploadError(NETWORK_MESSAGE, (e as Error).name || "network");
  }
  const json = (await res.json().catch(() => null)) as { ok?: boolean; upload?: CreatedUpload; error?: string; code?: string } | null;
  if (!res.ok || !json?.ok || !json.upload) throw new MediaUploadError(json?.error || "Yükleme başlatılamadı. Tekrar dene.", json?.code ?? `http_${res.status}`);
  return json.upload;
}

export type PutOptions = { onProgress?: (fraction: number) => void; signal?: AbortSignal };

/** PUT with upload progress. Content-Length comes from the body (it is part of the R2 signature). */
export function putWithProgress(upload: CreatedUpload, body: Blob, opts: PutOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(upload.method, upload.uploadUrl);
    for (const [name, value] of Object.entries(upload.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) opts.onProgress?.(Math.min(1, e.loaded / e.total));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        opts.onProgress?.(1);
        resolve();
      } else reject(new MediaUploadError(NETWORK_MESSAGE, `http_${xhr.status}`));
    };
    xhr.onerror = () => reject(new MediaUploadError(NETWORK_MESSAGE, "network"));
    xhr.onabort = () => reject(new MediaUploadError("Yükleme iptal edildi.", "aborted"));
    if (opts.signal) {
      if (opts.signal.aborted) {
        reject(new MediaUploadError("Yükleme iptal edildi.", "aborted"));
        return;
      }
      opts.signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(body);
  });
}

export type UploadedMedia = { url: string; key: string; provider: MediaProviderId };

/** Presign + PUT one file. `body.type` must be the exact content type (it is signed). */
export async function uploadMedia(kind: MediaKind, body: Blob, opts: PutOptions = {}): Promise<UploadedMedia> {
  const upload = await requestUpload(kind, body.type, body.size, opts.signal);
  await putWithProgress(upload, body, opts);
  return { url: upload.publicUrl, key: upload.key, provider: upload.provider };
}

/**
 * Best-effort delete of files uploaded in this session and never saved (R2 only; the server refuses anything that is
 * not the caller's own file or that a listing still uses).
 */
export async function discardUploadedMedia(urls: Array<string | null | undefined>): Promise<void> {
  const list = urls.filter((u): u is string => typeof u === "string" && u.length > 0);
  if (!list.length) return;
  await fetch("/api/media/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ urls: list.slice(0, 6) }),
    keepalive: true,
  }).catch(() => undefined);
}
