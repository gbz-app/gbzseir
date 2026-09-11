"use client";

import { Ban, BadgeCheck, CircleCheck, Minus, Plus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { grantBusinessSlotAction, setTrustedPublisherAction, setUserStatusAction } from "../actions/users";
import { PROFILE_STATUS_HELP } from "../lib/labels";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

/** Aktif et / Kısıtla / Engelle + güvenilir yayıncı. Admin accounts and the admin's own account are locked. */
export function UserActions({ userId, status, trusted, locked }: { userId: string; status: string; trusted: boolean; locked: boolean }) {
  const { pending, run } = useAdminAction();
  if (locked) return <p className="text-sm text-muted-foreground">Yönetici hesapları ve kendi hesabın buradan değiştirilemez.</p>;

  const setStatus = async (next: "active" | "restricted" | "banned") => !!(await run(() => setUserStatusAction({ userId, status: next }), { refresh: true }))?.ok;

  return (
    <div className="flex flex-wrap gap-2">
      {status !== "active" ? (
        <Button variant="success" disabled={pending} onClick={() => setStatus("active")}>
          <CircleCheck aria-hidden /> Aktif et
        </Button>
      ) : null}
      {status !== "restricted" ? (
        <ConfirmDialog
          title="Hesap kısıtlansın mı?"
          description={PROFILE_STATUS_HELP.restricted}
          confirmLabel="Kısıtla"
          trigger={
            <Button variant="outline" disabled={pending}>
              <ShieldAlert aria-hidden /> Kısıtla
            </Button>
          }
          onConfirm={() => setStatus("restricted")}
        />
      ) : null}
      {status !== "banned" ? (
        <ConfirmDialog
          title="Hesap engellensin mi?"
          description={PROFILE_STATUS_HELP.banned}
          confirmLabel="Engelle"
          destructive
          trigger={
            <Button variant="destructive" disabled={pending}>
              <Ban aria-hidden /> Engelle
            </Button>
          }
          onConfirm={() => setStatus("banned")}
        />
      ) : null}
      <Button variant="outline" disabled={pending} onClick={() => run(() => setTrustedPublisherAction({ userId, value: !trusted }), { refresh: true })}>
        <BadgeCheck aria-hidden /> {trusted ? "Güvenilir yayıncılığı kaldır" : "Güvenilir yayıncı yap"}
      </Button>
    </div>
  );
}

/**
 * İşletme hakkı: a user may open Ayarlar > "Hesap başına işletme sayısı" businesses plus the slots granted here
 * (after a support request). +1 notifies the user; -1 takes a granted slot back.
 */
export function BusinessSlotControl({ userId, extra }: { userId: string; extra: number }) {
  const { pending, run } = useAdminAction();
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmDialog
        title="İşletme hakkı verilsin mi?"
        description="Kullanıcı bir işletme daha açabilir. Kullanıcıya &quot;Yeni işletme ekleme hakkın açıldı&quot; bildirimi gider."
        confirmLabel="Hak ver (+1)"
        trigger={
          <Button variant="outline" size="sm" disabled={pending}>
            <Plus aria-hidden /> İşletme hakkı ver (+1)
          </Button>
        }
        onConfirm={async () => !!(await run(() => grantBusinessSlotAction({ userId, slots: 1 }), { refresh: true }))?.ok}
      />
      {extra > 0 ? (
        <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => grantBusinessSlotAction({ userId, slots: -1 }), { refresh: true })}>
          <Minus aria-hidden /> Geri al (-1)
        </Button>
      ) : null}
    </div>
  );
}
