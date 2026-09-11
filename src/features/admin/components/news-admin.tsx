"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { deleteNewsSourceAction, refreshNewsAction, saveNewsSourceAction, testNewsFeedAction } from "../actions/news";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin-action";

export type NewsSourceValue = { id: string; name: string; site_url: string; feed_url: string; active: boolean; permission_note: string | null };

export function NewsSourceDialog({ value, trigger }: { value?: NewsSourceValue; trigger: React.ReactElement }) {
  const { pending, run } = useAdminAction();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(value?.name ?? "");
  const [site, setSite] = React.useState(value?.site_url ?? "https://");
  const [feed, setFeed] = React.useState(value?.feed_url ?? "https://");
  const [active, setActive] = React.useState(value?.active ?? true);
  const [note, setNote] = React.useState(value?.permission_note ?? "");
  const [test, setTest] = React.useState<string[] | null>(null);
  const ids = { name: React.useId(), site: React.useId(), feed: React.useId(), note: React.useId() };

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{value ? "Kaynağı düzenle" : "Yeni haber kaynağı"}</DialogTitle>
          <DialogDescription>Yalnızca başlık, kısa özet ve bağlantı gösterilir; haberin tamamı kaynağında okunur.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => saveNewsSourceAction({ id: value?.id, name, siteUrl: site, feedUrl: feed, active, permissionNote: note }), {
              onSuccess: () => setOpen(false),
              refresh: true,
            });
          }}
        >
          <div>
            <Label htmlFor={ids.name} className="mb-1 block text-xs font-semibold">
              Kaynak adı
            </Label>
            <Input id={ids.name} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor={ids.site} className="mb-1 block text-xs font-semibold">
              Site adresi
            </Label>
            <Input id={ids.site} inputMode="url" value={site} onChange={(e) => setSite(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor={ids.feed} className="mb-1 block text-xs font-semibold">
              RSS adresi
            </Label>
            <div className="flex gap-2">
              <Input id={ids.feed} inputMode="url" value={feed} onChange={(e) => setFeed(e.target.value)} required />
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => run(() => testNewsFeedAction({ feedUrl: feed, name }), { onSuccess: (d) => setTest(d.titles) })}
              >
                <FlaskConical /> Test
              </Button>
            </div>
            {test ? (
              <ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
                {test.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <div>
            <Label htmlFor={ids.note} className="mb-1 block text-xs font-semibold">
              Kullanım izni notu
            </Label>
            <Textarea
              id={ids.note}
              value={note}
              maxLength={500}
              rows={3}
              placeholder="Ör. 12.09.2026'da e-postayla izin alındı."
              aria-describedby={`${ids.note}-help`}
              onChange={(e) => setNote(e.target.value)}
            />
            <p id={`${ids.note}-help`} className="mt-1 text-xs text-muted-foreground">
              Yayıncıdan alınan izni not et. Yalnızca yöneticiler görür.
            </p>
          </div>
          <label className="flex items-center justify-between rounded-xl bg-muted/50 p-3 text-sm">
            <span className="font-semibold">Aktif</span>
            <Switch checked={active} onCheckedChange={setActive} />
          </label>
          <div className="flex flex-wrap justify-between gap-2">
            {value ? <DeleteSource id={value.id} name={value.name} /> : <span />}
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null} Kaydet
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteSource({ id, name }: { id: string; name: string }) {
  const { pending, run } = useAdminAction();
  return (
    <ConfirmDialog
      title="Kaynak silinsin mi?"
      description={`"${name}" ve arşivdeki başlıkları silinir.`}
      confirmLabel="Sil"
      destructive
      trigger={
        <Button type="button" variant="ghost" className="text-destructive" disabled={pending}>
          <Trash2 /> Sil
        </Button>
      }
      onConfirm={async () => !!(await run(() => deleteNewsSourceAction({ id }), { refresh: true }))?.ok}
    />
  );
}

export function NewsActiveSwitch({ value }: { value: NewsSourceValue }) {
  const { pending, run } = useAdminAction();
  return (
    <Switch
      checked={value.active}
      disabled={pending}
      aria-label={`${value.name} aktif`}
      onCheckedChange={(active) => run(() => saveNewsSourceAction({ id: value.id, name: value.name, siteUrl: value.site_url, feedUrl: value.feed_url, active }), { refresh: true })}
    />
  );
}

/** The public app fetches the feeds within seconds of the click (up to about 15 s when a feed is slow). */
const RELOAD_AFTER_MS = [6_000, 18_000];

/**
 * Queues a fetch of every active feed now (the same work as the 20-minute job, done by the public app) and reloads
 * the list twice while it runs.
 */
export function RefreshNewsButton() {
  const router = useRouter();
  const { pending, run } = useAdminAction();
  const [waiting, setWaiting] = React.useState(false);
  // One array for the component's lifetime (mutated, never replaced), so the cleanup sees every timer.
  const timers = React.useRef<number[]>([]);
  React.useEffect(() => {
    const list = timers.current;
    return () => list.forEach((t) => window.clearTimeout(t));
  }, []);
  const busy = pending || waiting;

  const start = () =>
    run(() => refreshNewsAction(), {
      onSuccess: ({ queued }) => {
        if (!queued) return;
        setWaiting(true);
        RELOAD_AFTER_MS.forEach((ms, i) => {
          timers.current.push(
            window.setTimeout(() => {
              router.refresh();
              if (i === RELOAD_AFTER_MS.length - 1) setWaiting(false);
            }, ms),
          );
        });
      },
    });

  return (
    <Button variant="outline" disabled={busy} onClick={start}>
      <RefreshCw className={busy ? "animate-spin" : undefined} /> {busy ? "Çekiliyor" : "Şimdi çek"}
    </Button>
  );
}
