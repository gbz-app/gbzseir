"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Loader2, MapPin, Phone, Send, Sparkles, TriangleAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { DemoBadge } from "@/components/shared/badges";
import { routes, withQuery } from "@/core/routes";
import { formatDate, formatDateTime, formatPhoneTR, formatPrice, telHrefSafe } from "./request-format";
import { dispatchRequestAction, getRequestDetailAction } from "../actions/requests";
import { LEAD_STATUS, REQUEST_STATUS, WHEN_TYPES, labelOf } from "../lib/labels";
import type { DispatchResult, RequestDetail } from "../lib/request-types";
import { useAdminAction } from "./use-admin-action";

export type RequestRowData = {
  id: string;
  code: string;
  status: string;
  categoryName: string;
  parentName: string | null;
  autoDispatch: boolean;
  /** District (ilçe) display name. */
  district: string | null;
  whenLabel: string;
  createdLabel: string;
  customerName: string | null;
  accepted: number;
  max: number;
  leadCount: number;
  fallback: boolean;
  isDemo: boolean;
};

function StatusPill({ status }: { status: string }) {
  const e = REQUEST_STATUS[status];
  return (
    <Badge variant={e?.tone ?? "secondary"} className="h-6 px-2.5">
      {e?.label ?? status}
    </Badge>
  );
}

export function RequestList({ rows }: { rows: RequestRowData[] }) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<RequestDetail | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [loading, startLoading] = React.useTransition();
  const [result, setResult] = React.useState<DispatchResult | null>(null);

  const load = (id: string) => {
    setLoadError(null);
    startLoading(async () => {
      try {
        const res = await getRequestDetailAction({ requestId: id });
        if (res.ok) setDetail(res.data);
        else setLoadError(res.error);
      } catch {
        setLoadError("Sunucuya ulaşılamadı.");
      }
    });
  };

  const open = (id: string) => {
    setOpenId(id);
    setDetail(null);
    setResult(null);
    load(id);
  };

  return (
    <>
      <ul className="overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">
        {rows.map((r) => (
          <li key={r.id} className="border-b last:border-b-0">
            <button
              type="button"
              onClick={() => open(r.id)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted"
              aria-haspopup="dialog"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusPill status={r.status} />
                  <span className="font-mono text-sm font-bold tracking-wide">{r.code}</span>
                  {r.autoDispatch ? (
                    <Badge variant="info" className="h-6">
                      Otomatik
                    </Badge>
                  ) : null}
                  {r.fallback ? (
                    <Badge variant="warning" className="h-6">
                      Bölge dışı eşleşme
                    </Badge>
                  ) : null}
                  {r.isDemo ? <DemoBadge /> : null}
                </div>
                <p className="mt-1 font-semibold">
                  {r.parentName ? <span className="text-muted-foreground">{r.parentName} › </span> : null}
                  {r.categoryName}
                </p>
                <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" aria-hidden /> {r.district ?? "İlçe yok"}
                  </span>
                  <span>{r.whenLabel}</span>
                  <span className="inline-flex items-center gap-1">
                    <Users className="size-3.5" aria-hidden /> {r.leadCount} firma · {r.accepted}/{r.max} kabul
                  </span>
                  {r.customerName ? <span>{r.customerName}</span> : null}
                  <span>{r.createdLabel}</span>
                </p>
              </div>
              <ChevronRight className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <Sheet
        open={!!openId}
        onOpenChange={(o) => {
          if (!o) setOpenId(null);
        }}
      >
        <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
          <SheetHeader className="border-b px-4 py-3 pr-14">
            <SheetTitle className="font-heading text-lg font-bold">{detail ? `Talep ${detail.code}` : "Talep"}</SheetTitle>
            <SheetDescription>{detail ? `${detail.category.parentName ? `${detail.category.parentName} › ` : ""}${detail.category.name}` : "Yükleniyor…"}</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-safe">
            {loadError ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center" role="alert">
                <TriangleAlert className="size-8 text-destructive" aria-hidden />
                <p className="font-semibold">{loadError}</p>
                <Button variant="outline" onClick={() => openId && load(openId)}>
                  Tekrar dene
                </Button>
              </div>
            ) : !detail || (loading && !detail) ? (
              <div className="space-y-3" role="status" aria-label="Yükleniyor">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : (
              <RequestDetailView
                detail={detail}
                result={result}
                refreshing={loading}
                onDispatched={(r) => {
                  setResult(r);
                  load(detail.id);
                }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b pb-4 last:border-b-0">
      <h3 className="mb-2 text-sm font-bold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function RequestDetailView({
  detail: d,
  result,
  refreshing,
  onDispatched,
}: {
  detail: RequestDetail;
  result: DispatchResult | null;
  refreshing: boolean;
  onDispatched: (r: DispatchResult) => void;
}) {
  const { pending, run } = useAdminAction();
  const [picked, setPicked] = React.useState<string[]>([]);
  const when = d.whenType === "tarih" && d.whenDate ? `${WHEN_TYPES.tarih}: ${formatDate(`${d.whenDate}T12:00:00+03:00`, { month: "long" })}` : labelOf({}, "") || WHEN_TYPES[d.whenType] || d.whenType;

  const dispatch = (businessIds?: string[]) =>
    run(() => dispatchRequestAction({ requestId: d.id, businessIds }), {
      onSuccess: (r) => {
        setPicked([]);
        onDispatched(r);
      },
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusPill status={d.status} />
        <Badge variant={d.category.autoDispatch ? "info" : "secondary"}>{d.category.autoDispatch ? "Otomatik eşleştirme" : "Concierge"}</Badge>
        {d.dispatchNote === "area_fallback" ? <Badge variant="warning">Bölge dışı eşleşme</Badge> : null}
        {d.isDemo ? <DemoBadge /> : null}
        {refreshing ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Yenileniyor" /> : null}
      </div>

      {result ? (
        <div className={cn("rounded-xl p-3 text-sm", result.leadCount > 0 ? "bg-success-soft text-success" : "bg-highlight-soft text-highlight-foreground")} role="status">
          <p className="font-semibold">
            {result.leadCount > 0 ? `${result.leadCount} firmaya gönderildi.` : "Yeni firmaya gönderilemedi."} Toplam {result.totalLeads} firma · durum: {labelOf(REQUEST_STATUS, result.status)}
          </p>
          {result.fallback ? <p className="mt-1">İlçede yeterli firma bulunamadığı için yakındaki diğer firmalara da gönderildi.</p> : null}
        </div>
      ) : null}

      <Section title="Talep">
        <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
          <dt className="text-muted-foreground">Oluşturma</dt>
          <dd className="font-medium">{formatDateTime(d.createdAt)}</dd>
          <dt className="text-muted-foreground">İlçe</dt>
          <dd className="font-medium">{d.district ?? "-"}</dd>
          <dt className="text-muted-foreground">Ne zaman</dt>
          <dd className="font-medium">{when}</dd>
          <dt className="text-muted-foreground">Kabul</dt>
          <dd className="font-medium">
            {d.acceptedCount} / {d.maxProviders} firma
          </dd>
          {d.addressNote ? (
            <>
              <dt className="text-muted-foreground">Adres notu</dt>
              <dd className="font-medium break-words">{d.addressNote}</dd>
            </>
          ) : null}
          <dt className="text-muted-foreground">Soru akışı</dt>
          <dd className="font-medium">{d.flowVersion ? `Sürüm ${d.flowVersion}` : "-"}</dd>
          {d.closedAt ? (
            <>
              <dt className="text-muted-foreground">Kapanış</dt>
              <dd className="font-medium">{formatDateTime(d.closedAt)}</dd>
            </>
          ) : null}
        </dl>
      </Section>

      <Section title="Cevaplar">
        {d.answers.length ? (
          <dl className="space-y-2 text-sm">
            {d.answers.map((a, i) => (
              <div key={i}>
                <dt className="text-muted-foreground">{a.title}</dt>
                <dd className="font-semibold break-words">{a.answer}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">Cevap yok.</p>
        )}
        {d.note ? <p className="mt-3 rounded-xl bg-muted/60 p-3 text-sm break-words whitespace-pre-line">{d.note}</p> : null}
        {d.photos.length ? (
          <ul className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
            {d.photos.map((p, i) => (
              <li key={p}>
                <a href={p} target="_blank" rel="noopener noreferrer" aria-label={`Fotoğraf ${i + 1} (yeni sekmede)`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- admin thumbnails from user storage */}
                  <img src={p} alt="" className="size-20 rounded-xl bg-muted object-cover" loading="lazy" />
                </a>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Müşteri (yalnızca yöneticiler görür)">
        {d.customer ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div>
              <p className="font-semibold">{d.customer.name ?? "İsimsiz"}</p>
              <p className="text-muted-foreground">
                {formatPhoneTR(d.customer.phone) || "-"}
                {d.hidePhone ? " · numarasını firmalardan gizledi" : ""}
                {d.customer.status !== "active" ? ` · ${d.customer.status === "banned" ? "engelli" : "kısıtlı"}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              {d.customer.phone ? (
                <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
                  <a href={telHrefSafe(d.customer.phone)}>
                    <Phone aria-hidden /> Ara
                  </a>
                </Button>
              ) : null}
              <Button asChild variant="ghost" size="sm" className="min-h-11 sm:min-h-9">
                <Link href={withQuery(routes.admin.users(), { q: (d.customer.phone ?? "").replace(/^\+90/, "") || d.customer.name })}>Profil</Link>
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Müşteri hesabı silinmiş.</p>
        )}
      </Section>

      <Section title={`Firmalar (${d.leads.length})`}>
        {d.leads.length ? (
          <ul className="space-y-2">
            {d.leads.map((l) => (
              <li key={l.id} className="rounded-xl border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{l.business?.name ?? "Silinmiş firma"}</p>
                  <Badge variant={LEAD_STATUS[l.status]?.tone ?? "secondary"}>{labelOf(LEAD_STATUS, l.status)}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {l.waveNo}. dalga · {formatDateTime(l.createdAt)}
                  {l.matchScore !== null ? ` · skor ${l.matchScore.toFixed(2)}` : ""}
                  {l.seenAt ? ` · görüldü ${formatDateTime(l.seenAt)}` : ""}
                  {l.acceptedAt ? ` · kabul ${formatDateTime(l.acceptedAt)}` : ""}
                </p>
                {l.offerPrice !== null || l.offerNote ? (
                  <p className="mt-1">
                    {l.offerPrice !== null ? <strong>{formatPrice(l.offerPrice)}</strong> : null}
                    {l.offerNote ? ` · ${l.offerNote}` : ""}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Henüz hiçbir firmaya gönderilmedi.</p>
        )}
      </Section>

      {d.canDispatch ? (
        <Section title="Eşleştir ve gönder">
          <p className="text-sm text-muted-foreground">
            Otomatik eşleştirme; bölgeye, puana, doğrulamaya ve son 7 gündeki iş yüküne göre en uygun {d.category.notifyPoolSize} firmayı seçer ({d.nextWave}. dalga). İstersen firmaları aşağıdan elle seç.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => dispatch()}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />} Eşleştir ve gönder
            </Button>
            {picked.length ? (
              <Button variant="outline" disabled={pending} onClick={() => dispatch(picked)}>
                <Send aria-hidden /> Seçili {picked.length} firmaya gönder
              </Button>
            ) : null}
          </div>
          <div className="mt-4">
            <p className="text-sm font-semibold">Uygun firmalar</p>
            {d.candidates === null ? (
              <p className="mt-1 text-sm text-muted-foreground">Firma listesi alınamadı.</p>
            ) : d.candidates.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">
                Bu kategoride henüz talep gönderilmemiş onaylı firma yok. Yeni firmalar onaylandıkça burada görünür.
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {d.candidates.map((c) => {
                  const id = `cand-${c.businessId}`;
                  const checked = picked.includes(c.businessId);
                  return (
                    <li key={c.businessId} className="flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-muted/60">
                      <Checkbox
                        id={id}
                        checked={checked}
                        onCheckedChange={(v) => setPicked((p) => (v === true ? [...p, c.businessId] : p.filter((x) => x !== c.businessId)))}
                      />
                      <Label htmlFor={id} className="flex flex-1 cursor-pointer flex-wrap items-center gap-2 py-2 font-normal">
                        <span className="font-semibold">{c.name}</span>
                        {c.areaMatch ? <Badge variant="success">Bölgede</Badge> : <Badge variant="outline">Bölge dışı</Badge>}
                        <span className="text-xs text-muted-foreground tabular-nums">skor {c.score.toFixed(2)}</span>
                      </Label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

// Keep toast import used for future inline notices (dispatch uses useAdminAction toasts).
void toast;
