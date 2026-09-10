"use client";

import { Ban, BadgeCheck, CircleCheck, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setTrustedPublisherAction, setUserStatusAction } from "../actions/users";
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
