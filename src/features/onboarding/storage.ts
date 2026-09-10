"use client";

import * as React from "react";
import { STORAGE_KEYS } from "@/config/site";
import { readString, removeItem, writeString } from "@/lib/storage";

/** sessionStorage: first path opened in this tab session (set by the pre-paint script). */
export const LANDING_SESSION_KEY = "gebzem.landing";
/** sessionStorage: show onboarding again on the next visit to "/" (set by resetOnboarding). */
export const FORCE_SESSION_KEY = "gebzem.onboarding.force";

export type OnboardingPhase = "none" | "splash" | "slides";

let phase: OnboardingPhase | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** True once the user finished or skipped onboarding (or storage is unavailable: never trap users). */
export function isOnboarded(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEYS.onboarded) !== null;
  } catch {
    return true;
  }
}

export function markOnboarded(): void {
  writeString(STORAGE_KEYS.onboarded, new Date().toISOString());
  removeItem(FORCE_SESSION_KEY, "session");
}

function readInitialPhase(): OnboardingPhase {
  if (typeof document === "undefined") return "none";
  return document.documentElement.getAttribute("data-onboarding") === "pending" ? "splash" : "none";
}

export function getOnboardingPhase(): OnboardingPhase {
  if (phase === null) phase = readInitialPhase();
  return phase;
}

export function setOnboardingPhase(next: OnboardingPhase): void {
  phase = next;
  const root = document.documentElement;
  if (next === "none") root.removeAttribute("data-onboarding");
  else root.setAttribute("data-onboarding", "open");
  emit();
}

/** Should the gate open on "/" right now (after resetOnboarding while already in the app)? */
export function isOnboardingForced(): boolean {
  return readString(FORCE_SESSION_KEY, "session") === "1" && !isOnboarded();
}

/**
 * Re-watch the intro (settings page): clears the flag and shows the slides on the next visit to "/"
 * (immediately when the gate is mounted on "/"). Typical use: resetOnboarding(); router.push("/").
 */
export function resetOnboarding(): void {
  removeItem(STORAGE_KEYS.onboarded);
  writeString(FORCE_SESSION_KEY, "1", "session");
  window.dispatchEvent(new Event("gebzem:onboarding-reset"));
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Current onboarding phase (SSR: "none"). */
export function useOnboardingPhase(): OnboardingPhase {
  return React.useSyncExternalStore(subscribe, getOnboardingPhase, () => "none");
}

/** True while the onboarding overlay is visible (InstallPrompt waits for it). */
export function useOnboardingActive(): boolean {
  return useOnboardingPhase() !== "none";
}
