"use client";

import * as React from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HideBottomNav } from "@/components/layout/nav-visibility";
import { BottomDock } from "./bottom-dock";

/**
 * Full-screen form overlay for the owner tools (add/edit menu item, room, event).
 * Header with a close button, scrollable body, fixed save bar. Esc closes; body scroll is locked while open.
 */
export function FormScreen({
  title,
  onClose,
  onSubmit,
  submitLabel = "Kaydet",
  busy,
  footerExtra,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  busy?: boolean;
  footerExtra?: React.ReactNode;
  children: React.ReactNode;
}) {
  const titleId = React.useId();
  const busyRef = React.useRef(busy);
  React.useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busyRef.current) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-background" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <HideBottomNav />
      <header className="pt-safe">
        <div className="mx-auto flex h-(--topbar-h) max-w-2xl items-center gap-1 px-2">
          <button type="button" onClick={onClose} disabled={busy} aria-label="Kapat" className="flex size-11 items-center justify-center rounded-full hover:bg-muted disabled:opacity-50">
            <X className="size-5" />
          </button>
          <h2 id={titleId} className="truncate text-[17px] font-semibold">
            {title}
          </h2>
        </div>
      </header>
      <form
        className="flex min-h-0 flex-1 flex-col"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) onSubmit();
        }}
      >
        <div className="no-scrollbar flex-1 overflow-y-auto overscroll-contain px-4 py-5">
          <div className="mx-auto flex max-w-2xl flex-col gap-5">{children}</div>
        </div>
        <BottomDock inFlow>
          <div className="flex gap-2">
            {footerExtra}
            <Button type="submit" size="lg" className="flex-1" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {submitLabel}
            </Button>
          </div>
        </BottomDock>
      </form>
    </div>
  );
}
