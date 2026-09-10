"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { TABLES, type ReportReasonValue, type ReportTargetType } from "@/lib/db-contract";
import { useAuth } from "@/lib/auth/auth-provider";
import { routes } from "@/core/routes";
import { BottomSheet } from "./bottom-sheet";

export type ReportReason = { value: ReportReasonValue; label: string };

/** Values must match the reports_reason_check constraint. */
export const DEFAULT_REPORT_REASONS: ReportReason[] = [
  { value: "dolandiricilik", label: "Dolandırıcılık şüphesi (kapora, ön ödeme…)" },
  { value: "yaniltici", label: "Yanlış ya da yanıltıcı bilgi" },
  { value: "yanlis_kategori", label: "Yanlış kategori / yasaklı ürün" },
  { value: "uygunsuz", label: "Uygunsuz veya saldırgan içerik" },
  { value: "diger", label: "Diğer" },
];

export type ReportSheetProps = {
  /** 'listing' (2. el + iş ilanı) | 'business' | 'review' | 'user'. */
  targetType: ReportTargetType;
  targetId: string;
  /** Controlled state; omit to use the default "Şikayet et" trigger. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Custom trigger element (asChild). */
  trigger?: React.ReactNode;
  reasons?: ReportReason[];
  className?: string;
};

const NOTE_MAX = 1000;

/** "Şikayet et" sheet: reason + optional note -> inserts into `reports`. Requires login (redirects back). */
export function ReportSheet({ targetType, targetId, open: openProp, onOpenChange, trigger, reasons = DEFAULT_REPORT_REASONS, className }: ReportSheetProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [innerOpen, setInnerOpen] = React.useState(false);
  const open = openProp ?? innerOpen;
  const [reason, setReason] = React.useState<ReportReasonValue | "">("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const setOpen = (o: boolean) => {
    if (o && !user) {
      router.push(routes.auth.login(`${window.location.pathname}${window.location.search}`));
      return;
    }
    if (openProp === undefined) setInnerOpen(o);
    onOpenChange?.(o);
  };

  const submit = async () => {
    if (!user || !reason) return;
    setBusy(true);
    const { error } = await createClient()
      .from(TABLES.reports)
      .insert({ reporter_id: user.id, target_type: targetType, target_id: targetId, reason, detail: note.trim() || null });
    setBusy(false);
    if (error) {
      toast.error(error.code === "23505" ? "Bu içeriği zaten şikayet ettin." : "Şikayet gönderilemedi, lütfen tekrar dene.");
      return;
    }
    toast.success("Şikayetin alındı. En geç 24 saat içinde inceleyeceğiz.");
    setReason("");
    setNote("");
    setOpen(false);
  };

  return (
    <>
      {openProp === undefined ? (
        trigger ? (
          <span onClickCapture={() => setOpen(true)} className="contents">
            {trigger}
          </span>
        ) : (
          <Button type="button" variant="ghost" size="sm" className={cn("text-muted-foreground", className)} onClick={() => setOpen(true)}>
            <Flag /> Şikayet et
          </Button>
        )
      ) : null}
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="Şikayet et"
        description="Neden şikayet ediyorsun? Bildirimin gizli tutulur."
        footer={
          <Button onClick={submit} disabled={!reason || busy} size="lg">
            {busy ? <Loader2 className="animate-spin" /> : <Flag />}
            Şikayeti gönder
          </Button>
        }
      >
        <RadioGroup value={reason} onValueChange={(v) => setReason(v as ReportReasonValue)} className="gap-1.5" aria-label="Şikayet nedeni">
          {reasons.map((r) => (
            <Label
              key={r.value}
              htmlFor={`report-${r.value}`}
              className={cn(
                "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-[15px] font-medium transition-colors",
                reason === r.value ? "border-primary bg-brand-soft" : "hover:bg-muted",
              )}
            >
              <RadioGroupItem id={`report-${r.value}`} value={r.value} />
              {r.label}
            </Label>
          ))}
        </RadioGroup>
        <div className="mt-4">
          <Label htmlFor="report-note" className="mb-1.5 block text-sm font-semibold">
            Açıklama (isteğe bağlı)
          </Label>
          <Textarea
            id="report-note"
            value={note}
            maxLength={NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Kısaca ne olduğunu yazabilirsin."
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {note.length}/{NOTE_MAX}
          </p>
        </div>
      </BottomSheet>
    </>
  );
}
