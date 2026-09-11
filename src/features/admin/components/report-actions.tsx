"use client";

import * as React from "react";
import { Ban, CheckCheck, EyeOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { removeReportedContentAction, setReportStatusAction } from "../actions/reports";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

const REMOVE_TEXT: Record<string, { label: string; description: string }> = {
  listing: { label: "İlanı kaldır", description: "İlan silindi olarak işaretlenir ve yayından kalkar." },
  business: { label: "İşletmeyi askıya al", description: "İşletme sayfası ve teklifleri durdurulur. İşletmeler ekranından yeniden etkinleştirebilirsin." },
  review: { label: "Yorumu sil", description: "Yorum kalıcı olarak silinir ve işletme puanı yeniden hesaplanır." },
  user: {
    label: "Kullanıcıyı engelle",
    description: "Kullanıcı giriş yapamaz; işletmeleri, ilanları, etkinlikleri ve yorumları gizlenir. Kullanıcılar ekranından geri alabilirsin.",
  },
};

function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const id = React.useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Yönetici notu (isteğe bağlı, yalnızca yöneticiler görür)</Label>
      <Textarea id={id} value={value} maxLength={500} rows={3} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function ReportActions({
  reportId,
  status,
  targetType,
  targetExists,
  targetIsAdmin,
}: {
  reportId: string;
  status: string;
  targetType: string;
  targetExists: boolean;
  targetIsAdmin?: boolean;
}) {
  const { pending, run } = useAdminAction();
  const [note, setNote] = React.useState("");
  const remove = REMOVE_TEXT[targetType];

  if (status !== "open") {
    return (
      <Button variant="outline" disabled={pending} onClick={() => run(() => setReportStatusAction({ reportId, status: "open" }))}>
        <RotateCcw aria-hidden /> Yeniden aç
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmDialog
        title="Şikayet çözüldü mü?"
        description="Şikayet kapatılır; içerik olduğu gibi kalır."
        confirmLabel="Çözüldü"
        onOpenChange={(o) => !o && setNote("")}
        trigger={
          <Button variant="success" disabled={pending}>
            <CheckCheck aria-hidden /> Çözüldü
          </Button>
        }
        onConfirm={async () => !!(await run(() => setReportStatusAction({ reportId, status: "resolved", note })))?.ok}
      >
        <NoteField value={note} onChange={setNote} />
      </ConfirmDialog>
      <Button variant="outline" disabled={pending} onClick={() => run(() => setReportStatusAction({ reportId, status: "dismissed" }))}>
        <EyeOff aria-hidden /> Yoksay
      </Button>
      {remove && targetExists && !targetIsAdmin ? (
        <ConfirmDialog
          title={`${remove.label}?`}
          description={`${remove.description} Bu içerikle ilgili tüm açık şikayetler de kapatılır.`}
          confirmLabel={remove.label}
          destructive
          onOpenChange={(o) => !o && setNote("")}
          trigger={
            <Button variant="destructive" disabled={pending}>
              <Ban aria-hidden /> İçeriği kaldır
            </Button>
          }
          onConfirm={async () => !!(await run(() => removeReportedContentAction({ reportId, note })))?.ok}
        >
          <NoteField value={note} onChange={setNote} />
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
