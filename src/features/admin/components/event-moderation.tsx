"use client";

import * as React from "react";
import { Ban, Check, EyeOff, Send, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteEventAction, reviewEventAction, setEventStatusAction } from "../actions/events";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

export const EVENT_REJECT_REASONS = ["Eksik ya da yanlış bilgi", "Uygunsuz içerik", "Etkinlik değil, reklam", "Tarihi geçmiş", "Gebze dışında", "Diğer"] as const;

/** Preset reason + optional detail ("Diğer" needs the detail). */
function ReasonPicker({ reason, onReason, note, onNote }: { reason: string; onReason: (r: string) => void; note: string; onNote: (n: string) => void }) {
  const id = React.useId();
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Gerekçe">
        {EVENT_REJECT_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={reason === r}
            onClick={() => onReason(r)}
            className={cn(
              "inline-flex h-9 items-center rounded-full px-3 text-sm font-medium transition-colors",
              reason === r ? "bg-foreground text-background" : "bg-muted hover:bg-muted/70",
            )}
          >
            {r}
          </button>
        ))}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id}>Açıklama {reason === "Diğer" ? "" : "(isteğe bağlı)"}</Label>
        <Textarea id={id} rows={3} maxLength={250} value={note} onChange={(e) => onNote(e.target.value)} placeholder="Kullanıcıya bildirimde gösterilir." />
      </div>
    </div>
  );
}

/** Moderation buttons for one event: review queue (approve / reject), take-down with a reason, cancel, delete. */
export function EventModeration({ id, title, status }: { id: string; title: string; status: string }) {
  const { pending, run } = useAdminAction();
  const [reason, setReason] = React.useState("");
  const [note, setNote] = React.useState("");
  const fullReason = reason === "Diğer" ? note.trim() : [reason, note.trim()].filter(Boolean).join(": ");
  const resetReason = (o: boolean) => {
    if (!o) {
      setReason("");
      setNote("");
    }
  };
  const review = (approve: boolean) => run(() => reviewEventAction({ id, approve, reason: approve ? undefined : fullReason }), { refresh: true });

  const rejectDialog = (label: string, heading: string, description: string) => (
    <ConfirmDialog
      title={heading}
      description={description}
      confirmLabel={label}
      destructive
      confirmDisabled={!fullReason}
      onOpenChange={resetReason}
      trigger={
        <Button size="sm" variant="outline" disabled={pending}>
          {status === "published" ? <EyeOff aria-hidden /> : <X aria-hidden />} {label}
        </Button>
      }
      onConfirm={async () => !!(await review(false))?.ok}
    >
      <ReasonPicker reason={reason} onReason={setReason} note={note} onNote={setNote} />
    </ConfirmDialog>
  );

  return (
    <div className="flex flex-wrap gap-2">
      {status === "pending_review" ? (
        <>
          <Button size="sm" variant="success" disabled={pending} onClick={() => review(true)}>
            <Check aria-hidden /> Onayla
          </Button>
          {rejectDialog("Reddet", "Etkinlik reddedilsin mi?", `"${title}" yayına girmez. Sahibi gerekçeyle birlikte bildirim alır; düzenleyip yeniden gönderebilir.`)}
        </>
      ) : status === "published" ? (
        rejectDialog("Yayından kaldır", "Etkinlik yayından kaldırılsın mı?", `"${title}" listelerden kalkar ve sahibi yeniden yayınlayamaz; yalnızca düzenleyip onaya gönderebilir.`)
      ) : (
        <Button size="sm" variant="success" disabled={pending} onClick={() => review(true)}>
          <Send aria-hidden /> Yayına al
        </Button>
      )}
      {status === "published" ? (
        <ConfirmDialog
          title="Etkinlik iptal edilsin mi?"
          description={`"${title}" listelerden kalkar.`}
          confirmLabel="İptal et"
          destructive
          trigger={
            <Button size="sm" variant="outline" disabled={pending}>
              <Ban aria-hidden /> İptal et
            </Button>
          }
          onConfirm={async () => !!(await run(() => setEventStatusAction({ id, status: "cancelled" }), { refresh: true }))?.ok}
        />
      ) : null}
      <ConfirmDialog
        title="Etkinlik silinsin mi?"
        description={`"${title}" kalıcı olarak silinir.`}
        confirmLabel="Sil"
        destructive
        trigger={
          <Button size="sm" variant="ghost" disabled={pending} className="text-destructive">
            <Trash2 aria-hidden /> Sil
          </Button>
        }
        onConfirm={async () => !!(await run(() => deleteEventAction({ id }), { refresh: true }))?.ok}
      />
    </div>
  );
}
