import type { MediaKind, MediaProviderId } from "./kinds";

export type { MediaKind, MediaProviderId } from "./kinds";

export type CreateUploadInput = { kind: MediaKind; contentType: string; size: number; userId: string };

/** A one-shot direct upload: PUT the file body to `uploadUrl` with exactly `headers`; it is then served at `publicUrl`. */
export type CreatedUpload = {
  provider: MediaProviderId;
  uploadUrl: string;
  method: "PUT";
  /** Must be sent as-is (they are part of the signature). Content-Length is set by the browser from the body. */
  headers: Record<string, string>;
  publicUrl: string;
  key: string;
  /** Seconds the upload URL stays valid. */
  expiresIn: number;
};

/**
 * Storage backend for user media. Implementations are server-only (they hold credentials):
 * src/lib/media/r2.ts (Cloudflare R2, S3 SigV4) and src/lib/media/supabase.ts (Supabase `media` bucket).
 */
export interface MediaProvider {
  readonly id: MediaProviderId;
  createUpload(input: CreateUploadInput): Promise<CreatedUpload>;
  /** Deletes the object behind one of this provider's public URLs. True when it is gone (also when it never existed). */
  deleteByUrl(url: string): Promise<boolean>;
  /** True when the URL is this provider's file under the user's own folder. */
  isOwnMediaUrl(url: string, userId: string): boolean;
}
