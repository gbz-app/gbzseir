"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * delete_my_account() cannot delete Storage objects, so the client removes everything under `<uid>/`
 * in both buckets first (RLS allows owners to list and delete their own folder).
 */

const BUCKETS = ["media", "private-docs"] as const;
const PAGE = 100;

async function listAllFiles(bucket: (typeof BUCKETS)[number], root: string): Promise<string[]> {
  const storage = createClient().storage.from(bucket);
  const files: string[] = [];
  const queue: string[] = [root];
  let guard = 0;
  while (queue.length && guard < 500) {
    guard += 1;
    const dir = queue.shift()!;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await storage.list(dir, { limit: PAGE, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) break;
      for (const item of data) {
        const path = `${dir}/${item.name}`;
        // Folders are returned without an id.
        if (item.id === null) queue.push(path);
        else files.push(path);
      }
      if (data.length < PAGE) break;
    }
  }
  return files;
}

/** Remove all of the user's uploaded files. Returns counts; never throws. */
export async function removeAllUserFiles(uid: string): Promise<{ removed: number; failed: number }> {
  let removed = 0;
  let failed = 0;
  for (const bucket of BUCKETS) {
    try {
      const paths = await listAllFiles(bucket, uid);
      for (let i = 0; i < paths.length; i += PAGE) {
        const chunk = paths.slice(i, i + PAGE);
        const { data, error } = await createClient().storage.from(bucket).remove(chunk);
        if (error) failed += chunk.length;
        else removed += data?.length ?? chunk.length;
      }
    } catch {
      failed += 1;
    }
  }
  return { removed, failed };
}
