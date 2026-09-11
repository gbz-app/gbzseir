"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarPlus, ExternalLink, Loader2, Pencil, Ticket, Trash2, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/shared/bottom-sheet";
import { EmptyState } from "@/components/shared/empty-state";
import { notify } from "@/lib/notify";
import { createClient } from "@/lib/supabase/client";
import { refreshEventPages } from "../actions";
import { eventWhenShort } from "../format";
import type { OwnerEvent } from "../owner-event";
import { EVENT_STATUS_LABELS, EVENT_STATUS_TONES, isEventPast } from "../status";
import { EventChip } from "./chip";

type Tab = "yayinda" | "onay" | "red" | "gecmis";
const TABS: Tab[] = ["yayinda", "onay", "red", "gecmis"];
const TAB_LABELS: Record<Tab, string> = { yayinda: "Yayında", onay: "Onay bekliyor", red: "Reddedildi", gecmis: "Geçmiş" };
const TAB_EMPTY: Record<Tab, string> = {
  yayinda: "Yayında etkinliğin yok.",
  onay: "Onay bekleyen etkinliğin yok.",
  red: "Reddedilen etkinliğin yok.",
  gecmis: "Geçmiş etkinliğin yok.",
};

function tabOf(e: OwnerEvent, now: number): Tab {
  if (isEventPast(e, now)) return "gecmis";
  if (e.status === "published") return "yayinda";
  if (e.status === "pending_review") return "onay";
  if (e.status === "rejected") return "red";
  return "gecmis";
}

/** /profil/etkinliklerim: the user's own events by status, with edit (back to review) and delete. */
export function MyEvents({ rows, error }: { rows: OwnerEvent[]; error?: boolean }) {
  const router = useRouter();
  const [events, setEvents] = React.useState(rows);
  const [now] = React.useState(() => Date.now());
  const grouped = React.useMemo(() => {
    const g: Record<Tab, OwnerEvent[]> = { yayinda: [], onay: [], red: [], gecmis: [] };
    for (const e of events) g[tabOf(e, now)].push(e);
    for (const t of ["yayinda", "onay", "red"] as const) g[t].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    return g;
  }, [events, now]);
  const [tab, setTab] = React.useState<Tab>(() => TABS.find((t) => grouped[t].length) ?? "yayinda");
  const [deleting, setDeleting] = React.useState<OwnerEvent | null>(null);
  const [busy, setBusy] = React.useState(false);

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    const { error: err } = await createClient().from("events").delete().eq("id", deleting.id);
    setBusy(false);
    if (err) return notify.error("Etkinlik silinemedi. Tekrar dene.");
    const slug = deleting.slug;
    setEvents((all) => all.filter((x) => x.id !== deleting.id));
    setDeleting(null);
    notify.success("Etkinlik silindi");
    await refreshEventPages(slug).catch(() => undefined);
    router.refresh();
  };

  if (error) {
    return (
      <div className="px-4 pt-6">
        <EmptyState icon={TriangleAlert} tone="warning" title="Etkinliklerin yüklenemedi" description="Sayfayı yenileyip tekrar dene." />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="px-4 pt-6">
        <EmptyState
          icon={CalendarPlus}
          title="Henüz etkinliğin yok"
          description="Konser, atölye, buluşma... Etkinliğini ekle, ekibimiz onaylayınca herkes görsün."
          actionLabel="Etkinlik oluştur"
          actionHref={routes.events.create()}
        />
      </div>
    );
  }

  const list = grouped[tab];
  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-10">
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-1" role="group" aria-label="Durum">
        {TABS.map((t) => (
          <EventChip key={t} active={tab === t} onClick={() => setTab(t)} count={grouped[t].length}>
            {TAB_LABELS[t]}
          </EventChip>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="rounded-3xl bg-card px-4 py-6 text-center text-sm text-muted-foreground">{TAB_EMPTY[tab]}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.map((e) => {
            const past = tab === "gecmis";
            return (
              <li key={e.id} className="rounded-3xl bg-card p-3">
                <div className="flex gap-3">
                  {e.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={e.cover_url} alt="" className="size-20 shrink-0 rounded-2xl object-cover" />
                  ) : (
                    <span className="flex size-20 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-primary">
                      <Ticket className="size-7" strokeWidth={1.5} aria-hidden />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 leading-snug font-semibold">{e.title}</p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">{eventWhenShort(e.starts_at, e.ends_at)}</p>
                    {e.venue_name ? <p className="truncate text-sm text-muted-foreground">{e.venue_name}</p> : null}
                    <span className={cn("mt-1.5 inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold", EVENT_STATUS_TONES[e.status])}>
                      {EVENT_STATUS_LABELS[e.status]}
                    </span>
                  </div>
                </div>

                {e.status === "rejected" && !past ? (
                  <p className="mt-3 rounded-2xl bg-red-50 px-3.5 py-2.5 text-sm leading-relaxed text-red-800 dark:bg-red-500/10 dark:text-red-200">
                    {e.rejection_reason ? (
                      <>
                        <span className="font-semibold">Neden:</span> {e.rejection_reason}.{" "}
                      </>
                    ) : null}
                    Düzenleyip yeniden onaya gönderebilirsin.
                  </p>
                ) : e.status === "pending_review" && !past ? (
                  <p className="mt-3 text-sm text-muted-foreground">Ekibimiz inceliyor. Onaylanınca bildirim alacaksın.</p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  {e.status === "published" && e.slug ? (
                    <Button asChild variant="secondary" size="sm">
                      <Link href={routes.events.detail(e.slug)}>
                        <ExternalLink /> Gör
                      </Link>
                    </Button>
                  ) : null}
                  {!past ? (
                    <Button asChild variant="secondary" size="sm">
                      <Link href={routes.events.create({ duzenle: e.id })}>
                        <Pencil /> Düzenle
                      </Link>
                    </Button>
                  ) : null}
                  <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleting(e)}>
                    <Trash2 /> Sil
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <BottomSheet
        open={!!deleting}
        onOpenChange={(o) => !o && !busy && setDeleting(null)}
        title="Etkinlik silinsin mi?"
        description={deleting ? `"${deleting.title}" kalıcı olarak silinir.` : undefined}
        footer={
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="lg" className="flex-1" onClick={() => setDeleting(null)} disabled={busy}>
              Vazgeç
            </Button>
            <Button type="button" variant="destructive" size="lg" className="flex-1" onClick={remove} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} Sil
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">Silinen etkinlik listelerden ve etkinlik sayfasından kalkar. Bu işlem geri alınamaz.</p>
      </BottomSheet>
    </div>
  );
}
