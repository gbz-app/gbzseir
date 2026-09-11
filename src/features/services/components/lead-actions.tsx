"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { EyeOff, Hand, Lightbulb, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BottomDock, BottomDockSpacer } from "@/components/shared/bottom-dock";
import { BottomSheet } from "@/components/shared/bottom-sheet";
import { createClient } from "@/lib/supabase/client";
import { readString, writeString } from "@/lib/storage";
import { formatPrice } from "@/core/format";
import { routes } from "@/core/routes";
import { reasonMessage } from "../labels";
import type { AcceptLeadResult } from "../types";
import { rpcErrorMessage } from "../util";

const NOTE_MAX = 280;
const TIP_KEY = "gebzem.tip.leadDetail.v1";

/** H5 one-time tip bubble. */
export function LeadTip() {
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    const id = window.setTimeout(() => setShow(!readString(TIP_KEY)), 0);
    return () => window.clearTimeout(id);
  }, []);
  if (!show) return null;
  const dismiss = () => {
    writeString(TIP_KEY, "1");
    setShow(false);
  };
  return (
    <div role="note" className="relative flex animate-fade-in items-start gap-3 rounded-2xl bg-highlight-soft p-4 pr-12 text-sm leading-relaxed">
      <Lightbulb className="mt-0.5 size-5 shrink-0 text-highlight" aria-hidden />
      <p>
        Talebi incele, uygunsa <strong>&quot;İlgileniyorum&quot;</strong> de. Müşterinin numarası o zaman açılır.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="İpucunu kapat"
        className="absolute top-1.5 right-1.5 flex size-10 items-center justify-center rounded-xl text-muted-foreground hover:bg-black/5"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

/** H5 bottom action bar: "Gizle" (decline_lead) and "İlgileniyorum" (sheet -> accept_lead). */
export function LeadActions({ leadId, acceptedCount, maxProviders }: { leadId: string; acceptedCount: number; maxProviders: number }) {
  const router = useRouter();
  const [acceptOpen, setAcceptOpen] = React.useState(false);
  const [hideOpen, setHideOpen] = React.useState(false);
  const [price, setPrice] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const accept = async () => {
    setBusy(true);
    const { data, error } = await createClient().rpc("accept_lead", {
      p_lead_id: leadId,
      p_offer_price: price ? Number(price) : undefined,
      p_offer_note: note.trim() || undefined,
    });
    setBusy(false);
    if (error) {
      toast.error(rpcErrorMessage(error));
      return;
    }
    const res = data as unknown as AcceptLeadResult | null;
    setAcceptOpen(false);
    if (!res?.ok) {
      toast.error(reasonMessage(res?.reason));
    } else {
      toast.success(res.hide_phone ? "Müşteriye bildirildi. Müşteri seni arayacak." : "Müşteriye bildirildi. Artık müşteriyi arayabilirsin.");
    }
    router.refresh();
  };

  const decline = async () => {
    setBusy(true);
    const { data, error } = await createClient().rpc("decline_lead", { p_lead_id: leadId });
    setBusy(false);
    if (error) {
      toast.error(rpcErrorMessage(error));
      return;
    }
    setHideOpen(false);
    if ((data as unknown as { ok?: boolean } | null)?.ok) {
      toast.success("Talep gizlendi");
      router.push(routes.business.leads());
    } else {
      toast.error("Talep gizlenemedi; durumu değişmiş olabilir.");
    }
    router.refresh();
  };

  return (
    <>
      <BottomDockSpacer />
      <BottomDock>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="lg" onClick={() => setHideOpen(true)}>
            <EyeOff /> Gizle
          </Button>
          <Button type="button" size="lg" className="flex-1" onClick={() => setAcceptOpen(true)}>
            <Hand /> İlgileniyorum
          </Button>
        </div>
      </BottomDock>

      <BottomSheet
        open={acceptOpen}
        onOpenChange={setAcceptOpen}
        title="İlgileniyorum"
        description="Müşteriye ilgilendiğini bildir. İstersen tahmini fiyat ve kısa bir not ekle."
        footer={
          <Button type="button" size="lg" onClick={accept} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Gönder
          </Button>
        }
      >
        <div className="flex flex-col gap-5 pt-1">
          <div>
            <Label htmlFor="teklif-fiyat" className="mb-2 text-sm font-semibold">
              Tahmini fiyat (isteğe bağlı)
            </Label>
            <div className="relative">
              <Input
                id="teklif-fiyat"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={price}
                placeholder="Tutar"
                onChange={(e) => setPrice(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, 7))}
                className="h-12 pr-12 text-lg font-semibold tabular-nums"
              />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm font-semibold text-muted-foreground">TL</span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {price ? `Müşteri "Tahmini: ${formatPrice(Number(price))}" olarak görecek.` : "Kesin fiyat değil; müşteri karşılaştırma yapabilsin diye."}
            </p>
          </div>
          <div>
            <Label htmlFor="teklif-not" className="mb-2 text-sm font-semibold">
              Kısa not (en fazla {NOTE_MAX} karakter)
            </Label>
            <Textarea
              id="teklif-not"
              value={note}
              maxLength={NOTE_MAX}
              rows={3}
              placeholder="Yarın öğleden sonra müsaitim, malzeme dahil."
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
            />
            <p className="mt-1.5 text-right text-xs text-muted-foreground tabular-nums">
              {note.length}/{NOTE_MAX}
            </p>
          </div>
          <p className="rounded-xl bg-info-soft px-3.5 py-2.5 text-xs leading-relaxed">
            Gönderdiğinde müşterinin iletişim bilgileri açılır. Bu talebe en fazla {maxProviders} firma ilgilenebilir (şu an {acceptedCount}/{maxProviders}).
          </p>
        </div>
      </BottomSheet>

      <BottomSheet
        open={hideOpen}
        onOpenChange={setHideOpen}
        title="Bu talep gizlensin mi?"
        description="Gizlediğin talep Kapanan sekmesine taşınır ve bu talep için tekrar ilgilenemezsin."
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={() => setHideOpen(false)}>
              Vazgeç
            </Button>
            <Button type="button" variant="destructive" size="lg" className="flex-1" onClick={decline} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Gizle
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">Müşteri bu kararını görmez.</p>
      </BottomSheet>
    </>
  );
}
