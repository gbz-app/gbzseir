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
import { useAuth } from "@/lib/auth/auth-provider";

const MAX = 1500;

export type InfoReportSheetProps = {
  /** What is reported, e.g. "Eczane: Fatih Eczanesi". */
  subject: string;
  /** Page path (for the admin). */
  path: string;
  className?: string;
};

/**
 * "Bilgi hatalı mı? Bildir": a correction note for a place (pois are not a `reports` target), stored in
 * contact_messages. Works for guests too (anonymous insert; no .select() after it).
 */
export function InfoReportSheet({ subject, path, className }: InfoReportSheetProps) {
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const id = React.useId();
  const valid = text.trim().length >= 3;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const message = `[Yer bilgisi düzeltme] ${subject}\nSayfa: ${path}\n\n${text.trim()}`.slice(0, 2000);
    const { error } = await createClient()
      .from("contact_messages")
      .insert({ user_id: user?.id ?? null, message });
    setBusy(false);
    if (error) {
      toast.error("Bildirimin gönderilemedi, lütfen tekrar dene.");
      return;
    }
    toast.success("Teşekkürler! Bildirimini aldık, kontrol edip düzelteceğiz.");
    setText("");
    setOpen(false);
  };

  return (
    <>
      <Button type="button" variant="ghost" className={cn("text-muted-foreground", className)} onClick={() => setOpen(true)}>
        <Flag />
        Bilgi hatalı mı? Bildir
      </Button>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title="Bilgi hatalı mı?"
        description="Adres, telefon ya da konum yanlışsa bize yaz; kontrol edip güncelleyelim."
        footer={
          <Button size="lg" onClick={submit} disabled={!valid || busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />}
            Gönder
          </Button>
        }
      >
        <p className="mb-3 rounded-xl bg-muted px-3 py-2 text-sm font-medium">{subject}</p>
        <Label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
          Ne yanlış?
        </Label>
        <Textarea
          id={id}
          value={text}
          maxLength={MAX}
          onChange={(e) => setText(e.target.value)}
          placeholder="Örn. Telefon numarası değişmiş ya da harita konumu yanlış."
          className="min-h-28"
        />
        <div className="mt-1 flex justify-between gap-2 text-xs text-muted-foreground">
          <span>Kişisel bilgi paylaşma.</span>
          <span>
            {text.length}/{MAX}
          </span>
        </div>
      </BottomSheet>
    </>
  );
}
