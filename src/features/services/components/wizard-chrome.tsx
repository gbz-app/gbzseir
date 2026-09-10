"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/shared/bottom-sheet";

/**
 * Wizard header title that also adds an ✕ ("Talepten çık") at the right end of the shared Wizard header on
 * steps 2+ (the shared Wizard only shows ✕ on the first step, where it calls onExit). The button is portalled
 * into the header row, so the shared component stays untouched; if the header markup ever changes it simply
 * does not appear (the ← and the first-step ✕ keep working).
 */
export function WizardTitle({ text, onClose }: { text: React.ReactNode; onClose: () => void }) {
  const searchParams = useSearchParams();
  const step = Number(searchParams.get("adim") ?? "1");
  const [host, setHost] = React.useState<HTMLElement | null>(null);

  const attach = React.useCallback((node: HTMLSpanElement | null) => {
    if (!node) return;
    const row = node.closest("header")?.firstElementChild;
    if (!(row instanceof HTMLElement)) return;
    const el = document.createElement("div");
    el.className = "flex shrink-0 items-center";
    row.appendChild(el);
    setHost(el);
    return () => {
      el.remove();
      setHost(null);
    };
  }, []);

  return (
    <>
      <span ref={attach}>{text}</span>
      {host && Number.isFinite(step) && step > 1
        ? createPortal(
            <Button type="button" variant="ghost" size="icon" className="rounded-full" aria-label="Talepten çık" onClick={onClose}>
              <X className="size-5" />
            </Button>,
            host,
          )
        : null}
    </>
  );
}

/** "Talepten çıkılsın mı?" confirmation (the draft stays on the device). */
export function LeaveSheet({ open, onOpenChange, onLeave }: { open: boolean; onOpenChange: (o: boolean) => void; onLeave: () => void }) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Talepten çıkılsın mı?"
      description="Cevapların bu cihazda kayıtlı kalır; istediğin zaman kaldığın yerden devam edebilirsin."
      footer={
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="lg" className="flex-1" onClick={onLeave}>
            Çık
          </Button>
          <Button type="button" size="lg" className="flex-1" onClick={() => onOpenChange(false)}>
            Devam et
          </Button>
        </div>
      }
    >
      <span className="sr-only">Çıkmak için Çık, devam etmek için Devam et düğmesine dokun.</span>
    </BottomSheet>
  );
}
