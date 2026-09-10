"use client";

import * as React from "react";
import Link from "next/link";
import { Check, ExternalLink, FileText, Loader2, PauseCircle, PlayCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  getBusinessDocumentUrlAction,
  reviewBusinessAction,
  setBusinessStatusAction,
  setVerificationLevelAction,
} from "../actions/businesses";
import { BUSINESS_REJECT_REASONS, VERIFICATION_LEVELS } from "../lib/labels";
import { ConfirmDialog } from "./confirm-dialog";
import { ReasonDialog } from "./reason-dialog";
import { useAdminAction } from "./use-admin-action";

export function BusinessActions({
  businessId,
  name,
  status,
  verificationLevel,
  publicHref,
}: {
  businessId: string;
  name: string;
  status: string;
  verificationLevel: number;
  publicHref: string | null;
}) {
  const { pending, run } = useAdminAction();
  const levelId = React.useId();
  const isApplication = status === "pending" || status === "rejected";

  return (
    <div className="flex flex-wrap items-end gap-2">
      {isApplication ? (
        <>
          <ConfirmDialog
            title="İşletme onaylansın mı?"
            description={`"${name}" yayına alınır, doğrulama seviyesi en az 1 olur ve sahibine "İşletmen yayında!" bildirimi gider.`}
            confirmLabel="Onayla"
            trigger={
              <Button variant="success" disabled={pending}>
                <Check aria-hidden /> Onayla
              </Button>
            }
            onConfirm={async () => !!(await run(() => reviewBusinessAction({ businessId, approve: true })))?.ok}
          />
          {status === "pending" ? (
            <ReasonDialog
              title="Başvuruyu reddet"
              description="Gerekçe işletme sahibine bildirilir; bilgilerini düzeltip tekrar başvurabilir."
              reasons={BUSINESS_REJECT_REASONS}
              trigger={
                <Button variant="destructive" disabled={pending}>
                  <X aria-hidden /> Reddet
                </Button>
              }
              onSubmit={async (reason) => !!(await run(() => reviewBusinessAction({ businessId, approve: false, reason })))?.ok}
            />
          ) : null}
        </>
      ) : null}

      {status === "approved" ? (
        <ConfirmDialog
          title="İşletme askıya alınsın mı?"
          description={`"${name}" herkese açık listelerden kalkar ve yeni talep alamaz. Sahibine bildirim gider.`}
          confirmLabel="Askıya al"
          destructive
          trigger={
            <Button variant="destructive" disabled={pending}>
              <PauseCircle aria-hidden /> Askıya al
            </Button>
          }
          onConfirm={async () => !!(await run(() => setBusinessStatusAction({ businessId, status: "suspended" })))?.ok}
        />
      ) : null}
      {status === "suspended" ? (
        <Button variant="success" disabled={pending} onClick={() => run(() => setBusinessStatusAction({ businessId, status: "approved" }))}>
          <PlayCircle aria-hidden /> Yeniden etkinleştir
        </Button>
      ) : null}

      {status === "approved" || status === "suspended" ? (
        <div className="grid gap-1">
          <Label htmlFor={levelId} className="text-xs text-muted-foreground">
            Doğrulama seviyesi
          </Label>
          <Select
            value={String(verificationLevel)}
            disabled={pending}
            onValueChange={(v) => run(() => setVerificationLevelAction({ businessId, level: Number(v) }))}
          >
            <SelectTrigger id={levelId} className="min-w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VERIFICATION_LEVELS.map((l) => (
                <SelectItem key={l.value} value={String(l.value)}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {publicHref ? (
        <Button asChild variant="outline">
          <Link href={publicHref} target="_blank" rel="noopener">
            <ExternalLink aria-hidden /> Sayfayı aç
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

/** Opens a private document through a 2-minute signed URL (window opened synchronously to avoid popup blocking). */
export function DocumentButton({ documentId, label }: { documentId: string; label: string }) {
  const [busy, setBusy] = React.useState(false);
  const [fallbackUrl, setFallbackUrl] = React.useState<string | null>(null);

  const open = async () => {
    setBusy(true);
    const win = window.open("about:blank", "_blank");
    try {
      const res = await getBusinessDocumentUrlAction({ documentId });
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
      <Button asChild variant="outline" size="sm">
        <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" onClick={() => setTimeout(() => setFallbackUrl(null), 500)}>
          <FileText aria-hidden /> {label} (aç)
        </a>
      </Button>
    );
  }
  return (
    <Button variant="outline" size="sm" onClick={open} disabled={busy} className="min-h-11 sm:min-h-9">
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <FileText aria-hidden />} {label}
    </Button>
  );
}
