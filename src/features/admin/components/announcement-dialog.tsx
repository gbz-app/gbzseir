"use client";

import * as React from "react";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AreaPicker } from "@/features/business/components/editor/area-picker";
import { deleteAnnouncementAction, saveAnnouncementAction } from "../actions/announcements";
import { isoToIstanbulInput, istanbulInputToIso } from "../lib/datetime";
import { ANNOUNCEMENT_KINDS } from "../lib/labels";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

export type AnnouncementValue = {
  id: string;
  kind: "su_kesintisi" | "elektrik_kesintisi" | "belediye" | "genel";
  title: string;
  body: string | null;
  neighbourhood_ids: string[];
  source_label: string | null;
  starts_at: string;
  ends_at: string | null;
};

const SELECT = "h-10 w-full rounded-md border bg-background px-3 text-sm";

/** Add / edit an announcement (kesinti, belediye, genel) with target neighbourhoods. */
export function AnnouncementDialog({ value, trigger }: { value?: AnnouncementValue; trigger: React.ReactElement }) {
  const { pending, run } = useAdminAction();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<AnnouncementValue["kind"]>(value?.kind ?? "genel");
  const [title, setTitle] = React.useState(value?.title ?? "");
  const [body, setBody] = React.useState(value?.body ?? "");
  const [areas, setAreas] = React.useState<string[]>(value?.neighbourhood_ids ?? []);
  const [source, setSource] = React.useState(value?.source_label ?? "");
  const [starts, setStarts] = React.useState(() => isoToIstanbulInput(value?.starts_at ?? new Date().toISOString()));
  const [ends, setEnds] = React.useState(() => isoToIstanbulInput(value?.ends_at));
  const ids = { kind: React.useId(), title: React.useId(), body: React.useId(), source: React.useId(), starts: React.useId(), ends: React.useId() };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const startsAt = istanbulInputToIso(starts);
    if (!startsAt) return toast.error("Başlangıç zamanı seç.");
    void run(
      () =>
        saveAnnouncementAction({
          id: value?.id,
          kind,
          title,
          body,
          neighbourhoodIds: areas,
          sourceLabel: source,
          startsAt,
          endsAt: istanbulInputToIso(ends),
        }),
      { onSuccess: () => setOpen(false), refresh: true },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{value ? "Duyuruyu düzenle" : "Yeni duyuru"}</DialogTitle>
          <DialogDescription>Mahalle seçmezsen tüm Gebze&apos;ye gösterilir. Bitiş zamanından sonra otomatik olarak yayından kalkar.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={ids.kind} className="mb-1 block text-xs font-semibold">
                Tür
              </Label>
              <select id={ids.kind} value={kind} onChange={(e) => setKind(e.target.value as AnnouncementValue["kind"])} className={SELECT}>
                {Object.entries(ANNOUNCEMENT_KINDS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor={ids.source} className="mb-1 block text-xs font-semibold">
                Kaynak
              </Label>
              <Input id={ids.source} value={source} maxLength={80} onChange={(e) => setSource(e.target.value)} placeholder="ör. İSU, SEDAŞ, Gebze Belediyesi" />
            </div>
          </div>
          <div>
            <Label htmlFor={ids.title} className="mb-1 block text-xs font-semibold">
              Başlık
            </Label>
            <Input id={ids.title} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor={ids.body} className="mb-1 block text-xs font-semibold">
              Metin
            </Label>
            <Textarea id={ids.body} rows={4} value={body} maxLength={1500} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={ids.starts} className="mb-1 block text-xs font-semibold">
                Başlangıç
              </Label>
              <Input id={ids.starts} type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor={ids.ends} className="mb-1 block text-xs font-semibold">
                Bitiş (isteğe bağlı)
              </Label>
              <Input id={ids.ends} type="datetime-local" value={ends} onChange={(e) => setEnds(e.target.value)} />
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold">Mahalleler ({areas.length ? `${areas.length} seçili` : "tüm Gebze"})</p>
            <AreaPicker value={areas} onChange={setAreas} />
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            {value ? <DeleteAnnouncement id={value.id} title={value.title} onDone={() => setOpen(false)} /> : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Vazgeç
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
                {value ? "Kaydet" : "Yayınla"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAnnouncement({ id, title, onDone }: { id: string; title: string; onDone: () => void }) {
  const { pending, run } = useAdminAction();
  return (
    <ConfirmDialog
      title="Duyuru silinsin mi?"
      description={`"${title}" kalıcı olarak silinir.`}
      confirmLabel="Sil"
      destructive
      trigger={
        <Button type="button" variant="ghost" className="text-destructive" disabled={pending}>
          <Trash2 /> Sil
        </Button>
      }
      onConfirm={async () => {
        const res = await run(() => deleteAnnouncementAction({ id }), { refresh: true });
        if (res?.ok) onDone();
        return !!res?.ok;
      }}
    />
  );
}
