"use client";

import * as React from "react";
import { Save, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { formatPhoneTR } from "@/core/format";
import { trIncludes } from "@/core/tr";
import { saveDutyListAction } from "../actions/duty";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

export type DutyPharmacy = { id: string; name: string; neighbourhood: string | null; phone: string | null };

/** Nöbet listesi: search pharmacies by name or neighbourhood, tick the day's duty pharmacies and save. */
export function DutyEditor({ day, pharmacies, initialIds, hasList }: { day: string; pharmacies: DutyPharmacy[]; initialIds: string[]; hasList: boolean }) {
  const { pending, run } = useAdminAction();
  const [selected, setSelected] = React.useState<string[]>(initialIds);
  const [q, setQ] = React.useState("");
  const byId = React.useMemo(() => new Map(pharmacies.map((p) => [p.id, p])), [pharmacies]);
  const selectedSet = React.useMemo(() => new Set(selected), [selected]);
  const filtered = React.useMemo(() => pharmacies.filter((p) => trIncludes(`${p.name} ${p.neighbourhood ?? ""}`, q)), [pharmacies, q]);
  const dirty = selected.length !== initialIds.length || initialIds.some((id) => !selectedSet.has(id));

  const toggle = (id: string, on: boolean) => setSelected((cur) => (on ? (cur.includes(id) ? cur : [...cur, id]) : cur.filter((x) => x !== id)));
  const save = () => run(() => saveDutyListAction({ day, poiIds: selected }));

  return (
    <div className="grid gap-4">
      {selected.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Seçilen eczaneler">
          {selected.map((id) => {
            const name = byId.get(id)?.name ?? "Eczane";
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => toggle(id, false)}
                  aria-label={`${name} listeden çıkar`}
                  className="inline-flex h-8 items-center gap-1 rounded-full bg-primary/10 pr-2 pl-3 text-sm font-medium text-primary transition-colors hover:bg-primary/15"
                >
                  {name} <X className="size-3.5" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Henüz eczane seçmedin.</p>
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Eczane ya da mahalle ara" aria-label="Eczane ara" className="h-11 pl-9" />
      </div>

      <ul className="max-h-[26rem] divide-y overflow-y-auto rounded-2xl bg-muted/40">
        {filtered.length ? (
          filtered.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm">
                <Checkbox checked={selectedSet.has(p.id)} onCheckedChange={(c) => toggle(p.id, c === true)} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{p.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {[p.neighbourhood, p.phone ? formatPhoneTR(p.phone) : null].filter(Boolean).join(" · ") || "Mahalle bilgisi yok"}
                  </span>
                </span>
              </label>
            </li>
          ))
        ) : (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">Aramana uyan eczane yok.</li>
        )}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground tabular-nums">
          {selected.length} eczane seçili{dirty ? " · kaydedilmedi" : ""}
        </p>
        {selected.length === 0 && hasList ? (
          <ConfirmDialog
            title="Günün listesi temizlensin mi?"
            description="Bu günün elle girilen ve aktarılan kayıtları silinir. Otomatik aktarım varsa günü yeniden doldurabilir."
            confirmLabel="Listeyi temizle"
            destructive
            trigger={
              <Button variant="destructive" disabled={pending}>
                <Trash2 /> Listeyi temizle
              </Button>
            }
            onConfirm={async () => !!(await save())?.ok}
          />
        ) : (
          <Button onClick={() => void save()} disabled={pending || (!dirty && selected.length === 0)}>
            <Save /> Kaydet
          </Button>
        )}
      </div>
    </div>
  );
}
