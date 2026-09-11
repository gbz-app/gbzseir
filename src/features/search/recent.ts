import * as React from "react";
import { trLower } from "@/core/tr";
import { cleanQuery, isLoggableTerm } from "./query";

/**
 * "Son aramaların": the last searches of this device only (localStorage, never sent anywhere). Every access is wrapped
 * in try/catch (private mode, blocked storage); the list then simply stays empty.
 */
const KEY = "gebzem:son-aramalar";
const CHANGE_EVENT = "gebzem:son-aramalar";
const MAX = 8;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && isLoggableTerm(x)).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

function write(next: string[]): void {
  try {
    if (next.length) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {
    return;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Recent searches, newest first (empty on the server and until hydrated). */
export function useRecentSearches(): string[] {
  const raw = React.useSyncExternalStore(subscribe, readRaw, () => null);
  return React.useMemo(() => parse(raw), [raw]);
}

/** Put a term on top (case-insensitive dedupe). Phone numbers, e-mails and links are not kept. */
export function addRecentSearch(term: string): void {
  const t = cleanQuery(term).slice(0, 60);
  if (!isLoggableTerm(t)) return;
  const key = trLower(t);
  write([t, ...parse(readRaw()).filter((x) => trLower(x) !== key)].slice(0, MAX));
}

export function removeRecentSearch(term: string): void {
  const key = trLower(term);
  write(parse(readRaw()).filter((x) => trLower(x) !== key));
}

export function clearRecentSearches(): void {
  write([]);
}
