"use client";

import * as React from "react";
import { Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { istanbulDateKey } from "@/core/time";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteFinanceEntryAction, saveFinanceEntryAction } from "../actions/finance";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

export type FinanceCategoryOption = { id: string; kind: "income" | "expense"; name: string; color: string; is_active: boolean };
export type FinanceEntryValue = {
  id: string;
  kind: "income" | "expense";
  category_id: string | null;
  amount: number;
  vat_rate: number;
  occurred_on: string;
  description: string | null;
  counterparty: string | null;
  business_id: string | null;
  payment_method: "nakit" | "havale" | "kart" | "diger";
  document_url: string | null;
};

export const PAYMENT_LABELS: Record<string, string> = { nakit: "Nakit", havale: "Havale / EFT", kart: "Kart", diger: "Diğer" };
const SELECT = "h-10 w-full rounded-md border bg-background px-3 text-sm";

/** Add / edit a finance entry in a dialog. */
export function FinanceEntryDialog({
  categories,
  businesses,
  entry,
  trigger,
}: {
  categories: FinanceCategoryOption[];
  businesses: Array<{ id: string; name: string }>;
  entry?: FinanceEntryValue;
  trigger: React.ReactElement;
}) {
  const { pending, run } = useAdminAction();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<"income" | "expense">(entry?.kind ?? "income");
  const [categoryId, setCategoryId] = React.useState(entry?.category_id ?? "");
  const [amount, setAmount] = React.useState(entry ? String(entry.amount).replace(".", ",") : "");
  const [vat, setVat] = React.useState(String(entry?.vat_rate ?? 20));
  const [date, setDate] = React.useState(entry?.occurred_on ?? istanbulDateKey(new Date()));
  const [description, setDescription] = React.useState(entry?.description ?? "");
  const [counterparty, setCounterparty] = React.useState(entry?.counterparty ?? "");
  const [businessId, setBusinessId] = React.useState(entry?.business_id ?? "");
  const [payment, setPayment] = React.useState<FinanceEntryValue["payment_method"]>(entry?.payment_method ?? "havale");
  const [doc, setDoc] = React.useState(entry?.document_url ?? "");
  const ids = { amount: React.useId(), vat: React.useId(), date: React.useId(), cat: React.useId(), desc: React.useId(), cp: React.useId(), biz: React.useId(), pay: React.useId(), doc: React.useId() };

  const options = categories.filter((c) => c.kind === kind && (c.is_active || c.id === categoryId));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount.replace(/\s|tl|₺/gi, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."));
    void run(
      () =>
        saveFinanceEntryAction({
          id: entry?.id,
          kind,
          categoryId: categoryId || null,
          amount: n,
          vatRate: Number(vat),
          occurredOn: date,
          description,
          counterparty,
          businessId: businessId || null,
          paymentMethod: payment,
          documentUrl: doc,
        }),
      {
        onSuccess: () => {
          setOpen(false);
          if (!entry) {
            setAmount("");
            setDescription("");
            setCounterparty("");
            setDoc("");
          }
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? "Kaydı düzenle" : "Yeni kayıt"}</DialogTitle>
          <DialogDescription>Tutarı KDV dahil gir. KDV tutarı özet ekranında otomatik hesaplanır.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1" role="radiogroup" aria-label="Kayıt türü">
            {(["income", "expense"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => {
                  setKind(k);
                  setCategoryId("");
                }}
                className={cn(
                  "h-9 rounded-full text-sm font-semibold",
                  kind === k ? (k === "income" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white") : "text-muted-foreground",
                )}
              >
                {k === "income" ? "Gelir" : "Gider"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={ids.amount} className="mb-1 block text-xs font-semibold">
                Tutar (TL, KDV dahil)
              </Label>
              <Input id={ids.amount} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="ör. 2500" required />
            </div>
            <div>
              <Label htmlFor={ids.vat} className="mb-1 block text-xs font-semibold">
                KDV oranı
              </Label>
              <select id={ids.vat} value={vat} onChange={(e) => setVat(e.target.value)} className={SELECT}>
                {["0", "1", "10", "20"].map((r) => (
                  <option key={r} value={r}>
                    %{r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor={ids.date} className="mb-1 block text-xs font-semibold">
                Tarih
              </Label>
              <Input id={ids.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor={ids.cat} className="mb-1 block text-xs font-semibold">
                Kategori
              </Label>
              <select id={ids.cat} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={SELECT}>
                <option value="">Kategorisiz</option>
                {options.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor={ids.desc} className="mb-1 block text-xs font-semibold">
              Açıklama
            </Label>
            <Input id={ids.desc} value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} placeholder="ör. Eylül ana sayfa vitrini" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor={ids.cp} className="mb-1 block text-xs font-semibold">
                Karşı taraf
              </Label>
              <Input id={ids.cp} value={counterparty} maxLength={120} onChange={(e) => setCounterparty(e.target.value)} placeholder="Firma / kişi" />
            </div>
            <div>
              <Label htmlFor={ids.pay} className="mb-1 block text-xs font-semibold">
                Ödeme
              </Label>
              <select id={ids.pay} value={payment} onChange={(e) => setPayment(e.target.value as FinanceEntryValue["payment_method"])} className={SELECT}>
                {Object.entries(PAYMENT_LABELS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {kind === "income" ? (
            <div>
              <Label htmlFor={ids.biz} className="mb-1 block text-xs font-semibold">
                İlgili işletme (reklam veren)
              </Label>
              <select id={ids.biz} value={businessId} onChange={(e) => setBusinessId(e.target.value)} className={SELECT}>
                <option value="">Yok</option>
                {businesses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <Label htmlFor={ids.doc} className="mb-1 block text-xs font-semibold">
              Fatura / belge bağlantısı
            </Label>
            <Input id={ids.doc} inputMode="url" value={doc} maxLength={500} onChange={(e) => setDoc(e.target.value)} placeholder="https://..." />
          </div>
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Kaydet
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FinanceDeleteButton({ id, label }: { id: string; label: string }) {
  const { pending, run } = useAdminAction();
  return (
    <ConfirmDialog
      title="Kayıt silinsin mi?"
      description={`${label} kalıcı olarak silinir. Silme işlemi denetim kaydına yazılır.`}
      confirmLabel="Sil"
      destructive
      trigger={
        <Button variant="ghost" size="icon" disabled={pending} aria-label="Kaydı sil">
          <Trash2 className="text-destructive" />
        </Button>
      }
      onConfirm={async () => !!(await run(() => deleteFinanceEntryAction({ id })))?.ok}
    />
  );
}
