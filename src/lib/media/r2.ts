import "server-only";
import { randomUUID } from "node:crypto";
import { buildMediaKey, isOwnMediaUrl, mediaPublicBase, parseMediaUrl } from "./kinds";
import { presign } from "./sigv4";
import type { CreatedUpload, CreateUploadInput, MediaProvider } from "./types";

/**
 * Cloudflare R2 provider (S3 API, SigV4 presigned requests, region "auto"). Used when R2_ACCOUNT_ID,
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and NEXT_PUBLIC_MEDIA_BASE_URL are all set (public app only).
 * Uploads go straight from the browser to https://<account>.r2.cloudflarestorage.com/<bucket>/<key>; the bucket
 * needs a CORS rule allowing PUT from the app origin with the content-type and cache-control headers.
 * Objects are served from the public r2.dev (or custom) host in NEXT_PUBLIC_MEDIA_BASE_URL.
 */

export type R2Config = { accountId: string; accessKeyId: string; secretAccessKey: string; bucket: string; publicBase: string };

const UPLOAD_TTL_SECONDS = 600;
const ADMIN_TTL_SECONDS = 120;
export const MEDIA_CACHE_CONTROL = "public, max-age=31536000, immutable";

export function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim() ?? "";
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim() ?? "";
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim() ?? "";
  const bucket = process.env.R2_BUCKET?.trim() ?? "";
  const publicBase = mediaPublicBase();
  if (!/^[A-Za-z0-9]{8,64}$/.test(accountId) || !accessKeyId || !secretAccessKey || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket) || !publicBase) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicBase };
}

function signed(c: R2Config, method: string, key: string, opts: { expiresIn: number; headers?: Record<string, string>; query?: Record<string, string> }) {
  return presign({
    method,
    host: `${c.accountId}.r2.cloudflarestorage.com`,
    path: key ? `/${c.bucket}/${key}` : `/${c.bucket}`,
    region: "auto",
    service: "s3",
    accessKeyId: c.accessKeyId,
    secretAccessKey: c.secretAccessKey,
    expiresIn: opts.expiresIn,
    headers: opts.headers,
    query: opts.query,
  }).url;
}

/** Deletes one object. True when it is gone (S3 DELETE answers 204 also for a missing key). */
export async function r2DeleteKey(c: R2Config, key: string): Promise<boolean> {
  try {
    const res = await fetch(signed(c, "DELETE", key, { expiresIn: ADMIN_TTL_SECONDS }), { method: "DELETE", cache: "no-store" });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

function xmlText(value: string): string {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** Every key under a prefix (ListObjectsV2, 1000 per page). Throws when R2 answers with an error. */
export async function r2ListKeys(c: R2Config, prefix: string, max = 10_000): Promise<string[]> {
  const keys: string[] = [];
  let token: string | null = null;
  for (let page = 0; page < 50 && keys.length < max; page++) {
    const query: Record<string, string> = { "list-type": "2", prefix, "max-keys": "1000" };
    if (token) query["continuation-token"] = token;
    const res = await fetch(signed(c, "GET", "", { expiresIn: ADMIN_TTL_SECONDS, query }), { cache: "no-store" });
    if (!res.ok) throw new Error(`R2 list failed (${res.status})`);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) keys.push(xmlText(m[1]));
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? (xml.match(/<NextContinuationToken>([^<]*)<\/NextContinuationToken>/)?.[1] ?? null) : null;
    if (!token) break;
    token = xmlText(token);
  }
  return keys;
}

export function createR2Provider(c: R2Config): MediaProvider {
  return {
    id: "r2",
    async createUpload({ contentType, size, userId }: CreateUploadInput): Promise<CreatedUpload> {
      const key = buildMediaKey(userId, contentType, randomUUID());
      const headers = { "Content-Type": contentType, "Cache-Control": MEDIA_CACHE_CONTROL };
      // Content-Length is signed too: the browser sets it from the body, so only a file of exactly `size` bytes lands.
      const uploadUrl = signed(c, "PUT", key, { expiresIn: UPLOAD_TTL_SECONDS, headers: { ...headers, "Content-Length": String(size) } });
      return { provider: "r2", uploadUrl, method: "PUT", headers, publicUrl: `${c.publicBase}/${key}`, key, expiresIn: UPLOAD_TTL_SECONDS };
    },
    async deleteByUrl(url: string): Promise<boolean> {
      const parsed = parseMediaUrl(url);
      if (!parsed || parsed.provider !== "r2") return false;
      return r2DeleteKey(c, parsed.key);
    },
    isOwnMediaUrl(url: string, userId: string): boolean {
      return parseMediaUrl(url)?.provider === "r2" && isOwnMediaUrl(url, userId);
    },
  };
}
