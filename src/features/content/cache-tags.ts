/**
 * Cache tags used by the content module's cached reads (unstable_cache / fetch next.tags).
 * Admin screens can call revalidateTag(TAG, "max") after editing announcements or news sources.
 */
export const CONTENT_CACHE_TAGS = {
  news: "content:news",
  announcements: "content:announcements",
  sources: "content:sources",
} as const;
