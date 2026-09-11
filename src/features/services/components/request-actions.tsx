"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, Loader2, Star, UserMinus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { BottomSheet } from "@/components/shared/bottom-sheet";
import { createClient } from "@/lib/supabase/client";
import { reasonMessage } from "../labels";
import { rpcErrorMessage } from "../util";

type OkShape = { ok?: boolean; reason?: string } | null;

/** F6 "Listeden çıkar" (customer_remove_lead) with confirmation. */
export function RemoveLeadButton({ leadId, firmName }: { leadId: string; firmName: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const remove = async () => {
    setBusy(true);
    const { data, error } = await createClient().rpc("customer_remove_lead", { p_lead_id: leadId });
    setBusy(false);
    if (error) {
      toast.error(rpcErrorMessage(error));
      return;
    }
    const res = data as unknown as OkShape;
    setOpen(false);
    if (!res?.ok) toast.error(reasonMessage(res?.reason));
    else toast.success(`${firmName} listeden çıkarıldı`);
    router.refresh();
  };

  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="mt-2 h-11 w-full text-muted-foreground" onClick={() => setOpen(true)}>
        <UserMinus /> Listeden çıkar
      </Button>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        title={`${firmName} listeden çıkarılsın mı?`}
        description="Firma bu talepte artık görünmez; boşalan yere başka bir firma ilgilenebilir."
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="lg" className="flex-1" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button type="button" variant="destructive" size="lg" className="flex-1" onClick={remove} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              Listeden çıkar
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">Bu işlem geri alınamaz; firma bu talep için tekrar ilgilenemez.</p>
      </BottomSheet>
    </>
  );
}

/** F6 "Talebi kapat": Anlaştım (which firm?) / Vazgeçtim -> close_request. */
export function CloseRequestSheet({ code, providers }: { code: string; providers: Array<{ businessId: string; name: string }> }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [choice, setChoice] = React.useState<string>(providers[0]?.businessId ?? "cancel");
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setBusy(true);
    const { data, error } = await createClient().rpc("close_request", {
      p_code: code,
      p_hired_business_id: choice === "cancel" ? undefined : choice,
    });
    setBusy(false);
    if (error) {
      toast.error(rpcErrorMessage(error));
      return;
    }
    const res = data as unknown as OkShape;
    if (!res?.ok) {
      toast.error(reasonMessage(res?.reason));
      setOpen(false);
      router.refresh();
      return;
    }
    toast.success(choice === "cancel" ? "Talebin kapatıldı" : "Talebin kapatıldı. Firmayı değerlendirmeyi unutma!");
    setOpen(false);
    router.refresh();
  };

  // Borderless white rows on the lavender sheet (like the report sheet); the chosen one is brand-soft with a check
  // (QuestionRenderer look). The radio stays the real control, visually hidden; the row shows its keyboard focus.
  const optionClass = (active: boolean) =>
    cn(
      "relative flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl bg-card px-4 py-3 text-[15px] leading-snug font-semibold transition-colors hover:bg-muted has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
      active && "bg-brand-soft text-primary hover:bg-brand-soft",
    );

  return (
    <>
      <Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => setOpen(true)}>
        Talebi kapat
      </Button>
      <BottomSheet
        open={open}
        onOpenChange={setOpen}
        className="bg-background"
        title="Talebi kapat"
        description={providers.length ? "Bir firmayla anlaştıysan seç; sonra değerlendirme yapabilirsin." : "Talebin kapanır ve firmalara artık gösterilmez."}
        footer={
          <Button type="button" size="lg" className="bg-foreground text-background shadow-none hover:bg-foreground/90" onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Talebi kapat
          </Button>
        }
      >
        <RadioGroup value={choice} onValueChange={setChoice} className="gap-2.5" aria-label="Talebi neden kapatıyorsun?">
          {providers.length ? <p className="text-sm font-semibold text-muted-foreground">Anlaştım (hangi firma?)</p> : null}
          {providers.map((p) => (
            <Label key={p.businessId} htmlFor={`kapat-${p.businessId}`} className={optionClass(choice === p.businessId)}>
              <span className="sr-only">
                <RadioGroupItem id={`kapat-${p.businessId}`} value={p.businessId} />
              </span>
              <span className="min-w-0 flex-1">{p.name} ile anlaştım</span>
              {choice === p.businessId ? <Check className="size-5 shrink-0 text-primary" strokeWidth={2.6} aria-hidden /> : null}
            </Label>
          ))}
          <Label htmlFor="kapat-vazgec" className={cn(optionClass(choice === "cancel"), providers.length ? "mt-2" : "")}>
            <span className="sr-only">
              <RadioGroupItem id="kapat-vazgec" value="cancel" />
            </span>
            <span className="min-w-0 flex-1">
              Vazgeçtim
              <span className="mt-0.5 block text-xs font-medium text-muted-foreground">Başka yoldan hallettim ya da artık gerek yok</span>
            </span>
            {choice === "cancel" ? <Check className="size-5 shrink-0 text-primary" strokeWidth={2.6} aria-hidden /> : null}
          </Label>
        </RadioGroup>
      </BottomSheet>
    </>
  );
}

const RATING_LABELS = ["Çok kötü", "Kötü", "İdare eder", "İyi", "Harika"];

function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} aria-label={`5 üzerinden ${value} yıldız`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn("size-5", n <= value ? "fill-highlight text-highlight" : "text-muted-foreground/30")} aria-hidden />
      ))}
    </span>
  );
}

export type ExistingReview = { rating: number; comment: string | null; reply: string | null } | null;

/** F6 review form for the hired firm (submit_review; re-submitting updates the review). */
export function ReviewForm({ code, businessId, businessName, existing }: { code: string; businessId: string; businessName: string; existing: ExistingReview }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(!existing);
  const [rating, setRating] = React.useState(existing?.rating ?? 0);
  const [comment, setComment] = React.useState(existing?.comment ?? "");
  const [busy, setBusy] = React.useState(false);
  const [thanks, setThanks] = React.useState(false);

  if (existing && !editing) {
    return (
      <div className="flex flex-col gap-3">
        {thanks ? (
          <p className="flex items-center gap-2 rounded-xl bg-success-soft px-3.5 py-2.5 text-sm font-semibold text-success">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            Teşekkürler! Değerlendirmen {businessName} profilinde yayınlandı.
          </p>
        ) : null}
        <div>
          <Stars value={existing.rating} />
          <p className="mt-1 text-sm font-semibold">{RATING_LABELS[existing.rating - 1]}</p>
          {existing.comment ? <p className="mt-2 text-sm leading-relaxed whitespace-pre-line">{existing.comment}</p> : null}
        </div>
        {existing.reply ? (
          <div className="rounded-xl bg-muted px-3.5 py-2.5 text-sm">
            <p className="text-xs font-semibold text-muted-foreground">{businessName} yanıtı</p>
            <p className="mt-1 leading-relaxed whitespace-pre-line">{existing.reply}</p>
          </div>
        ) : null}
        <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
          Değerlendirmeyi düzenle
        </Button>
      </div>
    );
  }

  const submit = async () => {
    if (!rating) {
      toast.error("Önce 1 ile 5 arasında bir puan seç.");
      return;
    }
    setBusy(true);
    const { data, error } = await createClient().rpc("submit_review", {
      p_request_code: code,
      p_business_id: businessId,
      p_rating: rating,
      p_comment: comment.trim() || undefined,
    });
    setBusy(false);
    if (error) {
      toast.error(rpcErrorMessage(error));
      return;
    }
    const res = data as unknown as OkShape;
    if (!res?.ok) {
      toast.error(reasonMessage(res?.reason));
      return;
    }
    setThanks(true);
    setEditing(false);
    toast.success("Değerlendirmen için teşekkürler!");
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <div role="radiogroup" aria-label="Puan" className="-ml-1.5 flex gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} yıldız: ${RATING_LABELS[n - 1]}`}
              onClick={() => setRating(n)}
              className="flex size-12 items-center justify-center rounded-xl transition-transform outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-90"
            >
              <Star className={cn("size-8", n <= rating ? "fill-highlight text-highlight" : "text-muted-foreground/40")} aria-hidden />
            </button>
          ))}
        </div>
        <p className="mt-1 h-5 text-sm font-semibold" aria-live="polite">
          {rating ? RATING_LABELS[rating - 1] : "Puan seç"}
        </p>
      </div>
      <div>
        <Label htmlFor="yorum" className="mb-2 text-sm font-semibold">
          Yorumun (isteğe bağlı)
        </Label>
        <Textarea
          id="yorum"
          value={comment}
          maxLength={1000}
          rows={3}
          placeholder="Deneyimini paylaş: zamanında geldi mi, işi nasıldı?"
          onChange={(e) => setComment(e.target.value.slice(0, 1000))}
        />
        <p className="mt-1.5 text-right text-xs text-muted-foreground tabular-nums">{comment.length}/1000</p>
      </div>
      <div className="flex gap-2">
        {existing ? (
          <Button type="button" variant="secondary" size="lg" onClick={() => setEditing(false)}>
            Vazgeç
          </Button>
        ) : null}
        <Button type="button" size="lg" className="flex-1 bg-foreground text-background shadow-none hover:bg-foreground/90" onClick={submit} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Değerlendirmeyi gönder
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Değerlendirmen adınla (ör. &quot;Ayşe Y.&quot;) firmanın profilinde görünür.</p>
    </div>
  );
}
