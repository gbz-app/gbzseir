"use client";

import * as React from "react";
import { FileCheck, FileText, FileUp, Loader2, Paperclip, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { istanbulDateKey } from "@/core/time";
import { uuid } from "@/lib/images";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteFinanceEntryAction, getFinanceReceiptUrlAction, saveFinanceEntryAction } from "../actions/finance";
import { fail } from "../lib/action-result";
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
  /** Old free-text link (read only now). */
  document_url: string | null;
  /** Uploaded receipt: private-docs/finance/<id>/<file>. */
  document_path: string | null;
};

export const PAYMENT_LABELS: Record<string, string> = { nakit: "Nakit", havale: "Havale / EFT", kart: "Kart", diger: "Diğer" };
const SELECT = "h-10 w-full rounded-md border bg-background px-3 text-sm";
const RECEIPT_BUCKET = "private-docs";
const RECEIPT_TYPES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Add / edit a finance entry in a dialog. The picked receipt is uploaded on save (private-docs/finance/<entry id>/). */
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
  const [file, setFile] = React.useState<File | null>(null);
  const [removeReceipt, setRemoveReceipt] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const ids = { amount: React.useId(), vat: React.useId(), date: React.useId(), cat: React.useId(), desc: React.useId(), cp: React.useId(), biz: React.useId(), pay: React.useId() };

  const options = categories.filter((c) => c.kind === kind && (c.is_active || c.id === categoryId));
  const hasSavedReceipt = !!entry?.document_path && !removeReceipt;

  const pick = (f: File) => {
    if (!RECEIPT_TYPES[f.type]) {
      toast.error("PDF, JPG, PNG ya da WebP bir dosya seç.");
      return;
    }
    if (f.size > MAX_RECEIPT_BYTES) {
      toast.error("Dosya en fazla 10 MB olabilir.");
      return;
    }
    setFile(f);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = Number(amount.replace(/\s|tl|₺/gi, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", "."));
    const entryId = entry?.id ?? uuid();
    const picked = file;
    void run(
      async () => {
        let receiptPath: string | null | undefined = removeReceipt ? null : undefined;
        const bucket = createClient().storage.from(RECEIPT_BUCKET);
        if (picked) {
          const path = `finance/${entryId}/fis-${uuid()}.${RECEIPT_TYPES[picked.type]}`;
          const { error } = await bucket.upload(path, picked, { upsert: false, contentType: picked.type });
          if (error) return fail("Belge yüklenemedi. Bağlantını kontrol edip tekrar dene.");
          receiptPath = path;
        }
        const res = await saveFinanceEntryAction({
          id: entry?.id,
          newId: entry ? undefined : entryId,
          kind,
          categoryId: categoryId || null,
          amount: n,
          vatRate: Number(vat),
          occurredOn: date,
          description,
          counterparty,
          businessId: businessId || null,
          paymentMethod: payment,
          receiptPath,
        });
        // Only a definite refusal removes the new file; after a network error the row may already point to it.
        if (!res.ok && picked && receiptPath) void bucket.remove([receiptPath]).catch(() => undefined);
        return res;
      },
      {
        onSuccess: () => {
          setOpen(false);
          setFile(null);
          setRemoveReceipt(false);
          if (!entry) {
            setAmount("");
            setDescription("");
            setCounterparty("");
          }
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setOpen(o);
        if (o) {
          setFile(null);
          setRemoveReceipt(false);
        }
      }}
    >
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
            <p className="mb-1 text-xs font-semibold">Fiş / fatura</p>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pick(f);
                e.target.value = "";
              }}
            />
            {file ? (
              <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-primary">
                  <FileUp className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatSize(file.size)} · Kaydedince yüklenir</p>
                </div>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setFile(null)} disabled={pending} aria-label="Seçilen dosyayı kaldır">
                  <X />
                </Button>
              </div>
            ) : hasSavedReceipt && entry ? (
              <div className="flex items-center gap-2 rounded-2xl bg-muted/60 p-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
                  <FileCheck className="size-5" aria-hidden />
                </span>
                <p className="min-w-0 flex-1 text-sm font-semibold">Belge yüklü</p>
                <FinanceReceiptButton id={entry.id} label="Aç" />
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => fileRef.current?.click()} disabled={pending} aria-label="Belgeyi değiştir">
                  <FileUp />
                </Button>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => setRemoveReceipt(true)} disabled={pending} aria-label="Belgeyi kaldır">
                  <Trash2 className="text-destructive" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => fileRef.current?.click()}
                className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-primary/40 p-3 text-left text-primary outline-none hover:bg-brand-soft/40 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
              >
                <FileUp className="size-5 shrink-0" aria-hidden />
                <span>
                  <span className="block text-sm font-semibold">Fiş ya da fatura ekle</span>
                  <span className="block text-xs text-muted-foreground">PDF ya da fotoğraf, en fazla 10 MB. Yalnızca yöneticiler görebilir.</span>
                </span>
              </button>
            )}
            {removeReceipt && !file ? (
              <p className="mt-1.5 text-xs text-muted-foreground">
                Kaydedince yüklü belge silinir.{" "}
                <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setRemoveReceipt(false)}>
                  Geri al
                </button>
              </p>
            ) : null}
            {entry?.document_url ? (
              <a href={entry.document_url} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-block text-xs text-primary hover:underline">
                Eski belge bağlantısı
              </a>
            ) : null}
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

/** Opens an entry's receipt through a 2-minute signed URL (window opened synchronously to avoid popup blocking). */
export function FinanceReceiptButton({ id, label }: { id: string; label?: string }) {
  const [busy, setBusy] = React.useState(false);
  const [fallbackUrl, setFallbackUrl] = React.useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    const win = window.open("about:blank", "_blank");
    try {
      const res = await getFinanceReceiptUrlAction({ id });
      if (!res.ok) {
        win?.close();
        toast.error(res.error);
        return;
      }
      if (win) {
        win.opener = null;
        win.location.href = res.data.url;
      } else {
        setFallbackUrl(res.data.url);
        toast.message("Açılır pencere engellendi; bağlantıya dokunarak aç.");
      }
    } catch {
      win?.close();
      toast.error("Sunucuya ulaşılamadı.");
    } finally {
      setBusy(false);
    }
  };

  if (fallbackUrl) {
    return (
      <Button asChild variant={label ? "outline" : "ghost"} size={label ? "sm" : "icon"}>
        <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" aria-label="Belgeyi aç" onClick={() => setTimeout(() => setFallbackUrl(null), 500)}>
          <FileText aria-hidden /> {label ?? null}
        </a>
      </Button>
    );
  }
  if (label) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={open} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <FileText aria-hidden />} {label}
      </Button>
    );
  }
  return (
    <Button type="button" variant="ghost" size="icon" onClick={open} disabled={busy} aria-label="Belgeyi aç">
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Paperclip />}
    </Button>
  );
}

export function FinanceDeleteButton({ id, label }: { id: string; label: string }) {
  const { pending, run } = useAdminAction();
  return (
    <ConfirmDialog
      title="Kayıt silinsin mi?"
      description={`${label} kalıcı olarak silinir, yüklü belgesi de silinir. Silme işlemi denetim kaydına yazılır.`}
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
