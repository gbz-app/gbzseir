"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "./confirm-dialog";

const MAX = 280;

/** Build the final reason text: "Eksik bilgi: fiyat yok" or just the free text for "Diğer". */
export function composeReason(selected: string | null, detail: string): string {
  const d = detail.trim();
  if (!selected) return d;
  if (selected === "Diğer") return d;
  return d ? `${selected}: ${d}` : selected;
}

export type ReasonDialogProps = {
  trigger: React.ReactElement;
  title: string;
  description?: React.ReactNode;
  reasons: readonly string[];
  confirmLabel?: string;
  /** Receives the composed reason. Return false to keep the dialog open. */
  onSubmit: (reason: string) => Promise<boolean | void>;
};

/** Reject-with-reason dialog: one reason chip + optional detail ("Diğer" requires text). */
export function ReasonDialog({ trigger, title, description, reasons, confirmLabel = "Reddet", onSubmit }: ReasonDialogProps) {
  const [selected, setSelected] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState("");
  const id = React.useId();
  const needsText = selected === "Diğer";
  const valid = !!selected && (!needsText || detail.trim().length >= 3);

  return (
    <ConfirmDialog
      trigger={trigger}
      title={title}
      description={description ?? "Seçtiğin gerekçe kullanıcıya bildirim olarak gönderilir."}
      confirmLabel={confirmLabel}
      destructive
      confirmDisabled={!valid}
      onOpenChange={(o) => {
        if (!o) {
          setSelected(null);
          setDetail("");
        }
      }}
      onConfirm={() => onSubmit(composeReason(selected, detail).slice(0, MAX))}
    >
      <div role="radiogroup" aria-label="Gerekçe" className="flex flex-wrap gap-2">
        {reasons.map((r) => {
          const active = selected === r;
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setSelected(r)}
              className={cn(
                "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                active ? "border-primary bg-brand-soft text-primary" : "bg-card hover:bg-muted",
              )}
            >
              {active ? <Check className="size-4" aria-hidden /> : null}
              {r}
            </button>
          );
        })}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id}>{needsText ? "Açıklama (zorunlu)" : "Ek açıklama (isteğe bağlı)"}</Label>
        <Textarea
          id={id}
          value={detail}
          maxLength={MAX}
          rows={3}
          placeholder={needsText ? "Gerekçeyi kısaca yaz" : "Örn. fiyat bilgisi eksik"}
          onChange={(e) => setDetail(e.target.value)}
        />
        <p className="text-right text-xs text-muted-foreground tabular-nums">
          {detail.length}/{MAX}
        </p>
      </div>
    </ConfirmDialog>
  );
}
