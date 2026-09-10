"use client";

import { STORAGE_KEYS } from "@/config/site";
import { readJSON, removeItem, writeJSON } from "@/lib/storage";

type StoredDraft<T> = { v: 1; data: T; savedAt: number };

const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/** localStorage key for a wizard draft: 'gebzem.draft.<key>'. */
export function draftStorageKey(key: string): string {
  return `${STORAGE_KEYS.wizardDraftPrefix}${key}`;
}

/** Read a saved draft (null if missing or older than 14 days). */
export function readWizardDraft<T>(key: string): T | null {
  const d = readJSON<StoredDraft<T> | null>(draftStorageKey(key), null);
  if (!d || d.v !== 1 || typeof d.savedAt !== "number") return null;
  if (Date.now() - d.savedAt > MAX_AGE_MS) {
    removeItem(draftStorageKey(key));
    return null;
  }
  return d.data;
}

export function writeWizardDraft<T>(key: string, data: T): void {
  writeJSON(draftStorageKey(key), { v: 1, data, savedAt: Date.now() } satisfies StoredDraft<T>);
}

/** Remove a draft (call after a successful submit; the Wizard does this automatically). */
export function clearWizardDraft(key: string): void {
  removeItem(draftStorageKey(key));
}
