"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { clearDemoDataAction } from "../actions/data";
import { DEMO_SCOPES, type DemoScope } from "../lib/labels";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

/** Scopes that always go with 'businesses' (the server adds them too): they would stay behind without a business. */
const WITH_BUSINESSES: DemoScope[] = ["events", "finance"];

/** Demo verisi temizliği: scope seçimi + "SİL" yazarak onay. */
export function DemoCleanup({ counts, realAdmins }: { counts: Partial<Record<DemoScope, number>>; realAdmins: number }) {
  const { pending, run } = useAdminAction();
  const [selected, setSelected] = React.useState<DemoScope[]>([]);
  const [confirm, setConfirm] = React.useState("");
  const toggle = (s: DemoScope, on: boolean) =>
    setSelected((cur) => (on ? [...new Set([...cur, s, ...(s === "businesses" ? WITH_BUSINESSES : [])])] : cur.filter((x) => x !== s)));
  // Locked while 'businesses' is selected; the demo admin needs a real admin to remain.
  const isDisabled = (s: DemoScope) => (WITH_BUSINESSES.includes(s) && selected.includes("businesses")) || (s === "demo_admin" && realAdmins < 1);

  return (
    <div className="grid gap-3">
      <ul className="grid gap-2 sm:grid-cols-2">
        {DEMO_SCOPES.map((s) => (
          <li key={s.value}>
            <label className="flex items-start gap-2.5 rounded-xl bg-muted/40 p-3 text-sm">
              <Checkbox
                checked={selected.includes(s.value)}
                disabled={isDisabled(s.value)}
                onCheckedChange={(c) => toggle(s.value, c === true)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="font-semibold">{s.label}</span>
                <span className="ml-1 text-muted-foreground tabular-nums">({counts[s.value] ?? 0})</span>
                {s.note ? <span className="block text-xs text-muted-foreground">{s.note}</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        title="Örnek veriler silinsin mi?"
        description="Yalnızca 'örnek veri' olarak işaretli kayıtlar silinir; gerçek kullanıcı verisine dokunulmaz. Bu işlem geri alınamaz."
        confirmLabel="Kalıcı olarak sil"
        destructive
        confirmDisabled={confirm !== "SİL"}
        onOpenChange={(o) => !o && setConfirm("")}
        trigger={
          <Button variant="destructive" disabled={pending || !selected.length} className="justify-self-start">
            <Trash2 /> Seçilenleri temizle ({selected.length})
          </Button>
        }
        onConfirm={async () => {
          const res = await run(() => clearDemoDataAction({ scopes: selected, confirm: "SİL" }), { refresh: true });
          if (res?.ok) setSelected([]);
          return !!res?.ok;
        }}
      >
        <div className="grid gap-1.5">
          <p className="text-sm">
            Onaylamak için <strong>SİL</strong> yaz:
          </p>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Onay metni" autoComplete="off" />
        </div>
      </ConfirmDialog>
    </div>
  );
}
