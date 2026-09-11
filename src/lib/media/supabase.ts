import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { STORAGE_BUCKETS } from "@/lib/db-contract";
import { buildMediaKey, isOwnMediaUrl, parseMediaUrl } from "./kinds";
import type { CreatedUpload, CreateUploadInput, MediaProvider } from "./types";

/**
 * Supabase Storage provider (public `media` bucket: images only, 5 MB; so no video). The browser photo uploader
 * keeps uploading to Supabase directly with the user's session (storage RLS + daily cap); this provider serves the
 * adapter contract on the server: a signed upload URL (valid 2 h, service role, public app only) and deletion.
 */
export function createSupabaseMediaProvider(): MediaProvider {
  return {
    id: "supabase",
    async createUpload({ contentType, userId }: CreateUploadInput): Promise<CreatedUpload> {
      const key = buildMediaKey(userId, contentType, randomUUID());
      const bucket = createAdminClient().storage.from(STORAGE_BUCKETS.media);
      const { data, error } = await bucket.createSignedUploadUrl(key);
      if (error || !data?.signedUrl) throw new Error("signed upload url failed");
      return {
        provider: "supabase",
        uploadUrl: data.signedUrl,
        method: "PUT",
        headers: { "Content-Type": contentType, "x-upsert": "false", "Cache-Control": "max-age=31536000" },
        publicUrl: bucket.getPublicUrl(key).data.publicUrl,
        key,
        expiresIn: 7200,
      };
    },
    async deleteByUrl(url: string): Promise<boolean> {
      const parsed = parseMediaUrl(url);
      if (!parsed || parsed.provider !== "supabase") return false;
      const { error } = await createAdminClient().storage.from(STORAGE_BUCKETS.media).remove([parsed.key]);
      return !error;
    },
    isOwnMediaUrl(url: string, userId: string): boolean {
      return parseMediaUrl(url)?.provider === "supabase" && isOwnMediaUrl(url, userId);
    },
  };
}
