"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, ChartColumn, ChevronRight, CircleCheck, EllipsisVertical, Eye, Pause, Pencil, Phone, Play, RefreshCw, Send, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/core/format";
import { routes, withQuery } from "@/core/routes";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChipFilter, type ChipOption } from "@/components/shared/chip-filter";
import { EmptyState } from "@/components/shared/empty-state";
import { createClient } from "@/lib/supabase/client";
import { EDITABLE_STATUSES, type ListingStatus, type ListingType } from "../constants";
import { daysLeft, effectiveStatus, listingPriceText, salaryText } from "../format";
import type { MyListingRow } from "../types";
import { addDays, istanbulToday } from "./stats/stats-data";

type Tab = "yayinda" | "onay" | "red" | "suresi" | "sonuc";

const STATUS_META: Record<ListingStatus, { label: string; tone: string }> = {
  active: { label: "Yayında", tone: "bg-success-soft text-success" },
  paused: { label: "Durduruldu", tone: "bg-muted text-muted-foreground" },
  pending_review: { label: "Onay bekliyor", tone: "bg-highlight-soft text-highlight-foreground" },
  draft: { label: "Taslak", tone: "bg-muted text-muted-foreground" },
  rejected: { label: "Reddedildi", tone: "bg-destructive/10 text-destructive" },
  expired: { label: "Süresi doldu", tone: "bg-muted text-muted-foreground" },
  sold: { label: "Satıldı", tone: "bg-info-soft text-info" },
  filled: { label: "Doldu", tone: "bg-info-soft text-info" },
  deleted: { label: "Silindi", tone: "bg-muted text-muted-foreground" },
};

function tabOf(status: ListingStatus): Tab {
  switch (status) {
    case "active":
    case "paused":
      return "yayinda";
    case "pending_review":
    case "draft":
      return "onay";
    case "rejected":
      return "red";
    case "expired":
      return "suresi";
    default:
      return "sonuc";
  }
}

type Action = "pause" | "resume" | "done" | "renew" | "resubmit" | "delete";

type WeekStat = { views: number; calls: number };

/** Last 7 days of views / calls of the owner's published listings (listing_daily_stats; RLS returns own rows only). */
function useWeekStats(ids: string[]): Map<string, WeekStat> | null {
  const key = ids.join(",");
  const [state, setState] = React.useState<{ key: string; map: Map<string, WeekStat> } | null>(null);
  React.useEffect(() => {
    if (!key) return;
    let alive = true;
    createClient()
      .from("listing_daily_stats")
      .select("listing_id,views,calls")
      .in("listing_id", key.split(","))
      .gte("day", addDays(istanbulToday(), -6))
      .then(
        ({ data }) => {
          if (!alive || !data) return;
          const map = new Map<string, WeekStat>();
          for (const r of data) {
            const cur = map.get(r.listing_id) ?? { views: 0, calls: 0 };
            map.set(r.listing_id, { views: cur.views + r.views, calls: cur.calls + r.calls });
          }
          setState({ key, map });
        },
        () => undefined,
      );
    return () => {
      alive = false;
    };
  }, [key]);
  return state?.key === key ? state.map : null;
}

function ListingRow({
  row,
  type,
  busy,
  week,
  onAction,
}: {
  row: MyListingRow;
  type: ListingType;
  busy: boolean;
  /** Last 7 days (null while loading / unavailable). */
  week: WeekStat | null;
  onAction: (row: MyListingRow, action: Action) => void;
}) {
  const status = effectiveStatus(row);
  const meta = STATUS_META[status];
  const isJob = type === "job";
  const detailHref = isJob ? routes.listings.job(row.id) : routes.listings.classified(row.id);
  const editHref = withQuery(isJob ? routes.listings.postJob() : routes.listings.postClassified(), { duzenle: row.id });
  const statsHref = routes.profile.listingStats(row.id);
  const canEdit = EDITABLE_STATUSES.includes(row.status);
  const priceLine = isJob ? salaryText(row.salaryMin, row.salaryMax, row.salaryHidden) : listingPriceText(row.price);
  const Placeholder = isJob ? Briefcase : Tag;

  return (
    <li className="rounded-2xl bg-card p-3">
      <div className="flex gap-3">
        <Link href={detailHref} className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground" tabIndex={-1} aria-hidden>
          {row.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={row.cover.thumbUrl ?? row.cover.url} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <Placeholder className="size-7" strokeWidth={1.75} />
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={detailHref} className="line-clamp-2 text-[15px] leading-snug font-semibold outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50">
            {row.title}
          </Link>
          <p className="mt-0.5 text-sm font-bold text-primary tabular-nums">{priceLine}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className={cn("rounded-full px-2 py-0.5 font-semibold", meta.tone)}>{meta.label}</span>
            {status === "active" ? <span>{daysLeft(row.expires_at)} gün kaldı</span> : null}
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Eye className="size-3.5" aria-hidden /> {row.view_count}
              <span className="sr-only">görüntülenme</span>
            </span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Phone className="size-3.5" aria-hidden /> {row.call_count}
              <span className="sr-only">arama</span>
            </span>
          </div>
        </div>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="shrink-0 rounded-full" aria-label="İlan işlemleri" disabled={busy}>
              <EllipsisVertical className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem asChild className="min-h-11 px-3 text-[15px]">
              <Link href={statsHref}>
                <ChartColumn /> İstatistikler
              </Link>
            </DropdownMenuItem>
            {canEdit ? (
              <DropdownMenuItem asChild className="min-h-11 px-3 text-[15px]">
                <Link href={editHref}>
                  <Pencil /> Düzenle
                </Link>
              </DropdownMenuItem>
            ) : null}
            {status === "active" ? (
              <DropdownMenuItem className="min-h-11 px-3 text-[15px]" onSelect={() => onAction(row, "pause")}>
                <Pause /> Yayından kaldır
              </DropdownMenuItem>
            ) : null}
            {status === "paused" ? (
              <DropdownMenuItem className="min-h-11 px-3 text-[15px]" onSelect={() => onAction(row, "resume")}>
                <Play /> Yayına al
              </DropdownMenuItem>
            ) : null}
            {status === "active" || status === "paused" || status === "expired" ? (
              <>
                <DropdownMenuItem className="min-h-11 px-3 text-[15px]" onSelect={() => onAction(row, "done")}>
                  <CircleCheck /> {isJob ? "Doldu işaretle" : "Satıldı işaretle"}
                </DropdownMenuItem>
                <DropdownMenuItem className="min-h-11 px-3 text-[15px]" onSelect={() => onAction(row, "renew")}>
                  <RefreshCw /> Süreyi yenile (30 gün)
                </DropdownMenuItem>
              </>
            ) : null}
            {status === "rejected" || status === "draft" ? (
              <DropdownMenuItem className="min-h-11 px-3 text-[15px]" onSelect={() => onAction(row, "resubmit")}>
                <Send /> Tekrar onaya gönder
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" className="min-h-11 px-3 text-[15px]" onSelect={() => onAction(row, "delete")}>
              <Trash2 /> Sil
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {row.published_at ? (
        <Link
          href={statsHref}
          className="mt-2.5 flex min-h-10 items-center gap-2 rounded-xl bg-muted/70 px-3 text-[13px] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChartColumn className="size-4 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1 truncate tabular-nums">
            {week ? (
              <>
                <span className="text-muted-foreground">Son 7 gün:</span> {formatNumber(week.views)} görüntülenme · {formatNumber(week.calls)} arama
              </>
            ) : (
              "İstatistikleri gör"
            )}
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      ) : null}
      {status === "rejected" && row.rejection_reason ? (
        <p className="mt-2.5 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">Red nedeni: {row.rejection_reason}</p>
      ) : null}
    </li>
  );
}

/** G4 - İlanlarım / İş ilanlarım: status tabs and owner actions (allowed transitions are enforced by the DB). */
export function MyListings({ rows, type, error }: { rows: MyListingRow[]; type: ListingType; error: string | null }) {
  const router = useRouter();
  const isJob = type === "job";
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const publishedIds = React.useMemo(
    () =>
      rows
        .filter((r) => r.published_at)
        .slice(0, 100)
        .map((r) => r.id),
    [rows],
  );
  const weekStats = useWeekStats(publishedIds);

  const counts = React.useMemo(() => {
    const c: Record<Tab, number> = { yayinda: 0, onay: 0, red: 0, suresi: 0, sonuc: 0 };
    for (const r of rows) c[tabOf(effectiveStatus(r))] += 1;
    return c;
  }, [rows]);
  const firstTab = (Object.keys(counts) as Tab[]).find((t) => counts[t] > 0) ?? "yayinda";
  const [tab, setTab] = React.useState<Tab>(firstTab);

  const options: ChipOption<Tab>[] = [
    { value: "yayinda", label: "Yayında", count: counts.yayinda },
    { value: "onay", label: "Onay bekliyor", count: counts.onay },
    { value: "red", label: "Reddedildi", count: counts.red },
    { value: "suresi", label: "Süresi doldu", count: counts.suresi },
    { value: "sonuc", label: isJob ? "Doldu" : "Satıldı", count: counts.sonuc },
  ];
  const visible = rows.filter((r) => tabOf(effectiveStatus(r)) === tab);

  const onAction = async (row: MyListingRow, action: Action) => {
    if (action === "delete" && !window.confirm("İlan silinsin mi? İlan yayından kalkar, 30 gün içinde kalıcı olarak silinir.")) return;
    setBusyId(row.id);
    const supabase = createClient();
    let message: string | null = null;
    let success = "";
    try {
      if (action === "renew") {
        const { data, error: rpcError } = await supabase.rpc("renew_listing", { p_listing_id: row.id });
        const res = (data ?? {}) as { ok?: boolean };
        if (rpcError || !res.ok) message = rpcError?.message ?? "Bu ilanın süresi yenilenemiyor.";
        success = "İlanın süresi 30 gün uzatıldı";
      } else {
        const next: Record<Exclude<Action, "renew">, ListingStatus> = {
          pause: "paused",
          resume: "active",
          done: isJob ? "filled" : "sold",
          resubmit: "pending_review",
          delete: "deleted",
        };
        const status = next[action];
        const { error: upError } = await supabase.from("listings").update({ status }).eq("id", row.id);
        if (upError) message = upError.message;
        success = {
          pause: "İlan yayından kaldırıldı",
          resume: "İlan tekrar yayında",
          done: isJob ? "İlan doldu olarak işaretlendi" : "İlan satıldı olarak işaretlendi",
          resubmit: "İlan tekrar onaya gönderildi",
          delete: "İlan silindi",
        }[action];
      }
    } catch {
      message = "Bağlantı hatası. Lütfen tekrar dene.";
    }
    setBusyId(null);
    if (message) toast.error(message);
    else {
      toast.success(success);
      router.refresh();
    }
  };

  if (error) {
    return <EmptyState icon={isJob ? Briefcase : Tag} title="İlanların yüklenemedi" description="Bağlantını kontrol edip sayfayı yenile." />;
  }
  if (!rows.length) {
    return (
      <EmptyState
        icon={isJob ? Briefcase : Tag}
        title={isJob ? "Henüz iş ilanın yok" : "Henüz ilanın yok"}
        description={isJob ? "İşletmen adına ilk iş ilanını ver, adaylar seni arasın." : "Kullanmadığın bir eşyayı sat, alıcılar seni doğrudan arasın."}
        actionLabel={isJob ? "İş ilanı ver" : "İlk ilanını ver"}
        actionHref={isJob ? routes.listings.postJob() : routes.listings.postClassified()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <div className="px-4 pt-3">
        <ChipFilter options={options} value={tab} onChange={(v) => v && setTab(v)} ariaLabel="İlan durumu" size="sm" />
      </div>
      {visible.length ? (
        <ul className="flex flex-col gap-3 px-4">
          {visible.map((r) => (
            <ListingRow
              key={r.id}
              row={r}
              type={type}
              busy={busyId === r.id}
              week={weekStats ? (weekStats.get(r.id) ?? { views: 0, calls: 0 }) : null}
              onAction={onAction}
            />
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={isJob ? Briefcase : Tag} title="Bu sekmede ilan yok" />
      )}
    </div>
  );
}
