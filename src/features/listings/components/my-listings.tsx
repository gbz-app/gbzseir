"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Briefcase, CircleCheck, EllipsisVertical, Eye, Pause, Pencil, Phone, Play, RefreshCw, Send, Tag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { routes, withQuery } from "@/core/routes";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChipFilter, type ChipOption } from "@/components/shared/chip-filter";
import { EmptyState } from "@/components/shared/empty-state";
import { createClient } from "@/lib/supabase/client";
import { EDITABLE_STATUSES, type ListingStatus, type ListingType } from "../constants";
import { daysLeft, effectiveStatus, listingPriceText, salaryText } from "../format";
import type { MyListingRow } from "../types";

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

function ListingRow({ row, type, busy, onAction }: { row: MyListingRow; type: ListingType; busy: boolean; onAction: (row: MyListingRow, action: Action) => void }) {
  const status = effectiveStatus(row);
  const meta = STATUS_META[status];
  const isJob = type === "job";
  const detailHref = isJob ? routes.listings.job(row.id) : routes.listings.classified(row.id);
  const editHref = withQuery(isJob ? routes.listings.postJob() : routes.listings.postClassified(), { duzenle: row.id });
  const canEdit = EDITABLE_STATUSES.includes(row.status);
  const priceLine = isJob ? salaryText(row.salaryMin, row.salaryMax, row.salaryHidden) : listingPriceText(row.price);
  const Placeholder = isJob ? Briefcase : Tag;

  return (
    <li className="rounded-2xl bg-card p-3 shadow-soft ring-1 ring-foreground/[0.06]">
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
    if (action === "delete" && !window.confirm("İlan kalıcı olarak silinsin mi? Bu işlem geri alınamaz.")) return;
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
            <ListingRow key={r.id} row={r} type={type} busy={busyId === r.id} onAction={onAction} />
          ))}
        </ul>
      ) : (
        <EmptyState compact icon={isJob ? Briefcase : Tag} title="Bu sekmede ilan yok" />
      )}
    </div>
  );
}
