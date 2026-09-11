"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Star, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BottomSheet } from "@/components/shared/bottom-sheet";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/auth-provider";
import { routes } from "@/core/routes";
import { Stars } from "../rating";
import { deleteMyBusinessReview, submitBusinessReview } from "../../review-actions";

const COMMENT_MAX = 1000;
const RATING_LABELS = ["", "Çok kötü", "Kötü", "İdare eder", "İyi", "Harika"];

type MyReview = { rating: number; comment: string | null };
/** What we know about the signed-in user and this business (fetched on the client; the page itself is ISR). */
type Mine = { uid: string; review: MyReview | null; isOwner: boolean };

/**
 * "Yorum yaz" of the Yorumlar tab: guests go to login, owners see a note, users with a free review can edit or
 * delete it. Saves through the review server actions, then refreshes the page.
 */
export function ReviewComposer({ businessId, businessName }: { businessId: string; businessName: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mine, setMine] = React.useState<Mine | null>(null);
  const [open, setOpen] = React.useState(false);
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState<"save" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  React.useEffect(() => {
    if (!user) return;
    let active = true;
    const supabase = createClient();
    Promise.all([
      supabase.from("reviews").select("rating,comment").eq("business_id", businessId).eq("author_id", user.id).is("request_id", null).maybeSingle(),
      supabase.from("businesses").select("id").eq("id", businessId).eq("owner_id", user.id).maybeSingle(),
    ]).then(([review, owned]) => {
      if (active) setMine({ uid: user.id, review: (review.data as MyReview | null) ?? null, isOwner: !!owned.data });
    });
    return () => {
      active = false;
    };
  }, [user, businessId]);

  // Only trust data fetched for the current user.
  const state = user && mine?.uid === user.id ? mine : null;
  const pending = loading || (!!user && !state);
  const existing = state?.review ?? null;

  const loginHref = () => routes.auth.login(`${window.location.pathname}${window.location.search}#yorumlar`);

  const openSheet = () => {
    if (!user) {
      router.push(loginHref());
      return;
    }
    setRating(existing?.rating ?? 0);
    setComment(existing?.comment ?? "");
    setConfirmDelete(false);
    setOpen(true);
  };

  const save = async () => {
    if (!state || rating < 1) {
      toast.error("Önce 1 ile 5 arasında bir puan seç.");
      return;
    }
    setBusy("save");
    const res = await submitBusinessReview({ businessId, rating, comment: comment.trim() }).catch(() => null);
    setBusy(null);
    if (!res?.ok) {
      toast.error(res?.message ?? "Yorumun kaydedilemedi, lütfen tekrar dene.");
      if (res?.reason === "login_required") router.push(loginHref());
      return;
    }
    setMine({ ...state, review: { rating, comment: comment.trim() || null } });
    setOpen(false);
    toast.success(res.message);
    router.refresh();
  };

  const remove = async () => {
    if (!state) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy("delete");
    const res = await deleteMyBusinessReview({ businessId }).catch(() => null);
    setBusy(null);
    setConfirmDelete(false);
    if (!res?.ok) {
      toast.error(res?.message ?? "Yorumun silinemedi, lütfen tekrar dene.");
      return;
    }
    setMine({ ...state, review: null });
    setOpen(false);
    toast.success(res.message);
    router.refresh();
  };

  if (state?.isOwner) {
    return (
      <p className="flex items-start gap-2.5 rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
        <Store className="mt-0.5 size-4 shrink-0" aria-hidden />
        Bu senin işletmen; kendi işletmene yorum yazamazsın. Yorumlara işletme panelinden yanıt verebilirsin.
      </p>
    );
  }

  return (
    <>
      {existing ? (
        <div className="rounded-3xl bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Senin yorumun</p>
            <Stars value={existing.rating} />
          </div>
          {existing.comment ? <p className="mt-2 line-clamp-3 text-sm leading-relaxed whitespace-pre-line text-foreground/85">{existing.comment}</p> : null}
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" size="sm" onClick={openSheet}>
              <Pencil /> Yorumunu düzenle
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={remove} disabled={busy === "delete"}>
              {busy === "delete" ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {confirmDelete ? "Emin misin? Sil" : "Yorumu sil"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-3xl bg-card p-4">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            <span className="block font-semibold text-foreground">{businessName} hakkında ne düşünüyorsun?</span>
            Deneyimini paylaş, başkalarına yol göster.
          </p>
          <Button size="sm" className="shrink-0 bg-foreground text-background hover:bg-foreground/90" onClick={openSheet} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Pencil />}
            Yorum yaz
          </Button>
        </div>
      )}

      <BottomSheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setConfirmDelete(false);
        }}
        title={existing ? "Yorumunu düzenle" : "Yorum yaz"}
        description={businessName}
        footer={
          <div className="flex flex-col gap-2">
            <Button size="lg" onClick={save} disabled={rating < 1 || busy !== null} className="bg-foreground text-background hover:bg-foreground/90">
              {busy === "save" ? <Loader2 className="animate-spin" /> : null}
              {existing ? "Kaydet" : "Yorumu gönder"}
            </Button>
            {existing ? (
              <Button variant="ghost" size="lg" onClick={remove} disabled={busy !== null} className="text-destructive hover:text-destructive">
                {busy === "delete" ? <Loader2 className="animate-spin" /> : <Trash2 />}
                {confirmDelete ? "Emin misin? Yorumu sil" : "Yorumu sil"}
              </Button>
            ) : null}
          </div>
        }
      >
        <StarPicker value={rating} onChange={setRating} />
        <div className="mt-5">
          <Label htmlFor="review-comment" className="mb-1.5 block text-sm font-semibold">
            Yorumun (isteğe bağlı)
          </Label>
          <Textarea
            id="review-comment"
            value={comment}
            maxLength={COMMENT_MAX}
            rows={4}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Nasıl bir deneyim yaşadın? Hizmet, fiyat, ortam…"
          />
          <p className="mt-1 text-right text-xs text-muted-foreground tabular-nums">
            {comment.length}/{COMMENT_MAX}
          </p>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Yorumun adının ilk harfiyle (ör. Ayşe K.) herkese açık görünür. Her işletmeye tek yorum yazabilir, sonra düzenleyebilirsin.</p>
      </BottomSheet>
    </>
  );
}

/** 1-5 star radio group with a text label of the chosen value. */
function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(Math.min(5, value + 1));
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(Math.max(1, value - 1));
    else return;
    e.preventDefault();
  };
  return (
    <div className="flex flex-col items-center pt-2">
      <div role="radiogroup" aria-label="Puanın" onKeyDown={onKeyDown} className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} yıldız: ${RATING_LABELS[n]}`}
            tabIndex={value === n || (value === 0 && n === 1) ? 0 : -1}
            onClick={() => onChange(n)}
            className="flex size-12 items-center justify-center rounded-full outline-none transition-transform active:scale-90 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Star className={cn("size-9 transition-colors", n <= value ? "fill-highlight text-highlight" : "fill-muted text-muted-foreground/40")} aria-hidden />
          </button>
        ))}
      </div>
      <p className="mt-1 h-5 text-sm font-semibold" aria-live="polite">
        {value ? RATING_LABELS[value] : <span className="font-normal text-muted-foreground">Puan seç</span>}
      </p>
    </div>
  );
}
