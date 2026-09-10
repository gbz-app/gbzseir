"use client";

import * as React from "react";
import { isIOS, isStandalone } from "@/lib/platform";

/** Chromium's install prompt event. */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

type InstallState = {
  /** A native install prompt (Android/Chromium) is available. */
  canPrompt: boolean;
  /** App was installed in this session or runs standalone. */
  installed: boolean;
  /** The install guide sheet is open (openInstallGuide()). */
  guideOpen: boolean;
};

let deferred: BeforeInstallPromptEvent | null = null;
let state: InstallState = { canPrompt: false, installed: false, guideOpen: false };
const SERVER_STATE: InstallState = { canPrompt: false, installed: false, guideOpen: false };
const listeners = new Set<() => void>();
let initialized = false;

function set(patch: Partial<InstallState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

/** Attach the beforeinstallprompt / appinstalled listeners once (called from the root providers). */
export function initInstallCapture(): void {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  if (isStandalone()) set({ installed: true });
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    set({ canPrompt: true });
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    set({ canPrompt: false, installed: true, guideOpen: false });
  });
}

/** Show the native prompt (Android). Resolves to the outcome or 'unavailable'. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  const ev = deferred;
  deferred = null;
  set({ canPrompt: false });
  try {
    await ev.prompt();
    const choice = await ev.userChoice;
    if (choice.outcome === "accepted") set({ installed: true, guideOpen: false });
    return choice.outcome;
  } catch {
    return "unavailable";
  }
}

/**
 * Open the "Ana ekrana ekle" guide (settings page / help). On Android with a pending native prompt
 * the prompt is shown directly; otherwise the illustrated sheet (iOS steps or browser-menu hint) opens.
 */
export function openInstallGuide(): void {
  if (deferred && !isIOS()) {
    void promptInstall();
    return;
  }
  set({ guideOpen: true });
}

export function closeInstallGuide(): void {
  set({ guideOpen: false });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useInstallState(): InstallState {
  return React.useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
}
