"use client";

import * as React from "react";
import { Flag, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BottomSheet } from "@/components/shared/bottom-sheet";
import { createClient } from "@/lib/supabase/client";

const MIN = 10;
const MAX = 1500;

const COPY = {
  correction: {
    trigger: "Bilgi hatalı mı? Bildir",
    title: "Bilgi hatalı mı?",
    description: "Adres, telefon ya da konum yanlışsa bize yaz; kontrol edip güncelleyelim.",
    field: "Ne yanlış?",
    placeholder: "Örn. Telefon numarası değişmiş ya da harita konumu yanlış.",
    hint: "Kişisel bilgi paylaşma.",
  },
  phone: {
    trigger: "Numarasını biliyor musun? Bildir",
    title: "Numarasını biliyor musun?",
    description: "Bu durağın telefonunu biliyorsan yaz; kontrol edip ekleyelim.",
    field: "Telefon numarası",
    placeholder: "Örn. 0262 123 45 67, durağın tabelasında yazıyor.",
    hint: "Numarayı ve nereden bildiğini yaz.",
  },
} as const;

export type InfoReportSheetProps = {
  /** What is reported, e.g. "Eczane: Fatih Eczanesi". */
  subject: string;
  /** Page path (for the admin). */
  path: string;
  /** "phone": a small inline "Numarasını biliyor musun? Bildir" link for a place without a phone. */
  mode?: keyof typeof COPY;
  className?: string;
};

/**
 * "Bilgi hatalı mı? Bildir": a correction note for a place (pois are not a `reports` target), sent to the support inbox
 * via submit_contact_message (topic 'bilgi_duzeltme'). Guests may send it without phone / e-mail; the RPC rate-limits.
 */
export function InfoReportSheet({ subject, path, mode = "correction", className }: InfoReportSheetProps) {
  const copy = COPY[mode];
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const id = React.useId();
  // Count characters like the RPC (char_length), not UTF-16 units.
  const length = Array.from(text.trim()).length;
  const valid = length >= MIN;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const { data, error } = await createClient().rpc("submit_contact_message", {
      p_topic: "bilgi_duzeltme",
      p_subject: subject,
      p_message: text.trim(),
      p_page_path: path,
    });
    setBusy(false);
    if (error || !data) {
      toast.error(
        error?.hint === "rate_limited"
          ? "Çok fazla bildirim gönderildi, biraz sonra tekrar dene."
          : error?.hint === "invalid_message"
            ? `En az ${MIN} karakter yaz.`
            : "Bildirimin gönderilemedi, lütfen tekrar dene.",
      );
      return;
    }
    toast.success("Teşekkürler! Bildirimini aldık, kontrol edip düzelteceğiz.");
    setText("");
    setOpen(false);
  };

  return (
    <>
      {mode === "phone" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "inline-flex min-h-10 items-center rounded-md font-semibold text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50",
            className,
          )}
        >
          {copy.trigger}
        </button>
      ) : (
        <Button type="button" variant="ghost" className={cn("text-muted-foreground", className)} onClick={() => setOpen(true)}>
          <Flag />
          {copy.trigger}
        </Button>
      )}
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title={copy.title}
        description={copy.description}
        footer={
          <Button size="lg" onClick={submit} disabled={!valid || busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />}
            Gönder
          </Button>
        }
      >
        <p className="mb-3 rounded-xl bg-muted px-3 py-2 text-sm font-medium">{subject}</p>
        <Label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
          {copy.field}
        </Label>
        <Textarea
          id={id}
          value={text}
          maxLength={MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder={copy.placeholder}
          className="min-h-28"
        />
        <div className="mt-1 flex justify-between gap-2 text-xs text-muted-foreground">
          <span>{length > 0 && !valid ? `En az ${MIN} karakter yaz.` : copy.hint}</span>
          <span>
            {text.length}/{MAX}
          </span>
        </div>
      </BottomSheet>
    </>
  );
}
