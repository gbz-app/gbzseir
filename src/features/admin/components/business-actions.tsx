"use client";

import * as React from "react";
import { Check, ExternalLink, FileText, Loader2, PauseCircle, PlayCircle, Shapes, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BUSINESS_VERTICALS, VERTICAL_INFO, parseVertical } from "@/features/business/lib/verticals";
import {
  getBusinessDocumentUrlAction,
  reviewBusinessAction,
  setBusinessStatusAction,
  setBusinessVerticalAction,
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
  vertical,
  verificationLevel,
  publicHref,
}: {
  businessId: string;
  name: string;
  status: string;
  /** businesses.vertical (null for old rows). */
  vertical: string | null;
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

      <BusinessTypeDialog businessId={businessId} name={name} vertical={vertical} disabled={pending} />

      {publicHref ? (
        <Button asChild variant="outline">
          {/* Public app page (a separate site): plain link, no client routing. */}
          <a href={publicHref} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden /> Sayfayı aç
          </a>
        </Button>
      ) : null}
    </div>
  );
}

/** "Türünü değiştir": owners cannot change the type themselves; the owner is notified. */
function BusinessTypeDialog({ businessId, name, vertical, disabled }: { businessId: string; name: string; vertical: string | null; disabled: boolean }) {
  const { pending, run } = useAdminAction();
  const current = parseVertical(vertical);
  const [value, setValue] = React.useState<string>(current ?? "");
  const selectId = React.useId();
  const next = parseVertical(value);

  return (
    <ConfirmDialog
      title="İşletme türünü değiştir"
      description={`"${name}" için yeni türü seç. Paneldeki araçlar türe göre değişir (menü, odalar, hizmet talepleri); sahibine bildirim gider.`}
      confirmLabel="Türü değiştir"
      confirmDisabled={!next || next === current}
      onOpenChange={(open) => {
        if (open) setValue(current ?? "");
      }}
      trigger={
        <Button variant="outline" disabled={disabled || pending}>
          <Shapes aria-hidden /> Türünü değiştir
        </Button>
      }
      onConfirm={async () => (next ? !!(await run(() => setBusinessVerticalAction({ businessId, vertical: next })))?.ok : false)}
    >
      <div className="grid gap-1.5">
        <Label htmlFor={selectId}>İşletme türü{current ? ` (şu an ${VERTICAL_INFO[current].label})` : ""}</Label>
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger id={selectId} className="w-full">
            <SelectValue placeholder="Tür seç" />
          </SelectTrigger>
          <SelectContent>
            {BUSINESS_VERTICALS.map((v) => (
              <SelectItem key={v} value={v}>
                {VERTICAL_INFO[v].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {next === "hizmet" && current !== "hizmet" ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Hizmet firmaları müşteri talebi alır. İşletme sahibi hizmet kategorilerini ve bölgelerini düzenleme sayfasından seçmeli.
          </p>
        ) : current === "hizmet" && next && next !== "hizmet" ? (
          <p className="text-xs leading-relaxed text-muted-foreground">Hizmet talebi almayı bırakır.</p>
        ) : null}
      </div>
    </ConfirmDialog>
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
