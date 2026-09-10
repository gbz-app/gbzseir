/**
 * Safe Web Storage helpers. Every access is wrapped in try/catch because storage can throw
 * (Safari private mode, blocked site data, SSR). Values are JSON-encoded unless the *String variants are used.
 */

export type StorageArea = "local" | "session";

function area(which: StorageArea): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return which === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Read a raw string (null when missing or unavailable). */
export function readString(key: string, which: StorageArea = "local"): string | null {
  try {
    return area(which)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Write a raw string. Returns false when storage is unavailable. */
export function writeString(key: string, value: string, which: StorageArea = "local"): boolean {
  try {
    const s = area(which);
    if (!s) return false;
    s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Read and JSON-parse a value; returns `fallback` on any problem. */
export function readJSON<T>(key: string, fallback: T, which: StorageArea = "local"): T {
  const raw = readString(key, which);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** JSON-encode and store a value. */
export function writeJSON(key: string, value: unknown, which: StorageArea = "local"): boolean {
  try {
    return writeString(key, JSON.stringify(value), which);
  } catch {
    return false;
  }
}

export function removeItem(key: string, which: StorageArea = "local"): void {
  try {
    area(which)?.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** True when the storage area can actually be written (probe). */
export function isStorageAvailable(which: StorageArea = "local"): boolean {
  const probe = "__gz_probe__";
  if (!writeString(probe, "1", which)) return false;
  removeItem(probe, which);
  return true;
}
