"use client";

import { useEffect } from "react";
import "./globals.css";
import { ErrorState } from "@/components/shared/error-state";
import { STORAGE_KEYS } from "@/config/site";

/** global-error replaces the root layout, so its theme class is gone: re-apply the stored theme (same rule as ThemeScript). */
function applyStoredTheme() {
  try {
    const t = localStorage.getItem(STORAGE_KEYS.theme);
    const dark = t === "dark" || ((!t || t === "system") && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  } catch {
    /* keep the default light theme */
  }
}

/**
 * Last-resort boundary for errors in the root layout or providers (segment error.tsx files take precedence). It renders
 * its own document; a plain <a> link to "/" does a full reload, which also recovers a broken client state.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    applyStoredTheme();
  }, [error]);
  return (
    <html lang="tr" suppressHydrationWarning>
      <head>
        <title>Bir sorun oluştu | Gebzem</title>
      </head>
      <body className="min-h-dvh bg-background font-sans text-foreground">
        <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col items-center justify-center px-4 pt-safe pb-safe">
          <ErrorState
            title="Uygulama şu an açılamadı"
            description="Beklenmedik bir sorun oluştu. Tekrar dene; sorun sürerse ana sayfaya dön."
            onRetry={retry}
          />
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full reload is intended here */}
          <a href="/" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">
            Ana sayfaya dön
          </a>
        </main>
      </body>
    </html>
  );
}
