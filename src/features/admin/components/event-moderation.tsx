"use client";

import { Ban, EyeOff, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteEventAction, setEventStatusAction } from "../actions/events";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

/** Moderation buttons for one event. */
export function EventModeration({ id, title, status }: { id: string; title: string; status: string }) {
  const { pending, run } = useAdminAction();
  const set = (s: "published" | "draft" | "cancelled") => run(() => setEventStatusAction({ id, status: s }), { refresh: true });
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "published" ? (
        <Button size="sm" variant="success" disabled={pending} onClick={() => set("published")}>
          <Send aria-hidden /> Yayına al
        </Button>
      ) : (
        <Button size="sm" variant="outline" disabled={pending} onClick={() => set("draft")}>
          <EyeOff aria-hidden /> Yayından kaldır
        </Button>
      )}
      {status !== "cancelled" ? (
        <ConfirmDialog
          title="Etkinlik iptal edilsin mi?"
          description={`"${title}" sayfasında "İptal edildi" yazar ve listelerden kalkar.`}
          confirmLabel="İptal et"
          destructive
          trigger={
            <Button size="sm" variant="outline" disabled={pending}>
              <Ban aria-hidden /> İptal et
            </Button>
          }
          onConfirm={async () => !!(await set("cancelled"))?.ok}
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
