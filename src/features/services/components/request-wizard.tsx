"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarCheck, CalendarClock, CalendarDays, Check, ImagePlus, Loader2, Lock, LogIn, Phone, Trash2, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { NeighbourhoodPicker } from "@/components/shared/neighbourhood-picker";
import { Wizard, WizardSkeleton, buildFlowSteps, readWizardDraft, type WizardStep, type WizardStepContext } from "@/components/wizard";
import { useAuth } from "@/lib/auth/hooks";
import { createClient } from "@/lib/supabase/client";
import { getDefaultNeighbourhood } from "@/lib/location/store";
import { ACCEPTED_IMAGE_TYPES } from "@/lib/images";
import type { Json } from "@/lib/database.types";
import { summarizeAnswers, validateAnswers, type FlowAnswers, type FlowSchema } from "@/core/flow";
import { formatDate, formatPhoneTR } from "@/core/format";
import { fromSupabasePhone } from "@/core/phone";
import { routes } from "@/core/routes";
import { addDaysToKey, istanbulDateKey } from "@/core/time";
import { WHEN_OPTIONS, whenLabel } from "../labels";
import { removeUploadedPhotos, uploadRequestPhotos, useRequestPhotos, type RequestPhotos } from "../photo-store";
import type { ServicePickerData, SubmitRequestResult, WhenType } from "../types";
import { PICKED_PARAM, neighbourhoodLabel, pickedRequestHref, rpcErrorMessage } from "../util";
import { PICK_STEP_HELP, PICK_STEP_TITLE, ServicePicker } from "./service-picker";
import { LeaveSheet, WizardTitle } from "./wizard-chrome";

export type WizardCategory = {
  id: string;
  slug: string;
  name: string;
  icon: string | null;
  parentName: string;
  parentSlug: string;
  maxProviders: number;
  autoDispatch: boolean;
};

type Draft = {
  v: 1;
  answers: FlowAnswers;
  neighbourhoodId: string | null;
  neighbourhoodName: string | null;
  addressNote: string;
  whenType: WhenType | null;
  whenDate: string | null;
  note: string;
  photoIds: string[];
  hidePhone: boolean;
};

type Ctx = WizardStepContext<Draft>;

const MAX_PHOTOS = 6;
const MAX_WHEN_DAYS = 180;
const ADDRESS_MAX = 200;
const NOTE_MAX = 1000;

const PhotosContext = React.createContext<RequestPhotos | null>(null);
function usePhotos(): RequestPhotos {
  const v = React.useContext(PhotosContext);
  if (!v) throw new Error("PhotosContext missing");
  return v;
}

/** Borderless white row; the chosen one turns brand-soft with a check (same as QuestionRenderer's option rows). */
const optionBase =
  "flex min-h-16 w-full items-center gap-3 rounded-2xl bg-card px-4 py-3 text-left transition-[background-color,color,transform] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.99]";
const optionActive = "bg-brand-soft hover:bg-brand-soft";

type RequestWizardProps = {
  category: WizardCategory;
  schema: FlowSchema;
  /** Service picker payload; shown as step 1 when the request was started from /hizmetler (?sec=1). */
  picker?: ServicePickerData;
  /** Shown above the first question (after the picker), e.g. "no firm yet" for this service. */
  notice?: React.ReactNode;
};

/**
 * F3/F4: question-flow wizard for a sub-category + system steps (location, time, note/photos, summary, send).
 * Started from the picker (?sec=1) the picker is step 1 (change the service); a plain deep link skips it.
 */
export function RequestWizard(props: RequestWizardProps) {
  // useSearchParams (?sec) needs a Suspense boundary on the prerendered page.
  return (
    <React.Suspense fallback={<WizardSkeleton />}>
      <RequestWizardInner {...props} />
    </React.Suspense>
  );
}

function RequestWizardInner({ category, schema, picker, notice }: RequestWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const draftKey = `hizmet.${category.slug}`;
  const picked = !!picker && searchParams.get(PICKED_PARAM) === "1";
  /** This wizard's URL at step `adim` (keeps ?sec so a login round-trip returns to the same step list). */
  const requestHref = React.useCallback(
    (adim?: number) => (picked ? pickedRequestHref(category.slug, adim) : routes.services.request(category.slug, adim)),
    [picked, category.slug],
  );
  const [leaveOpen, setLeaveOpen] = React.useState(false);

  const [initialData] = React.useState<Draft>(() => {
    const n = typeof window !== "undefined" ? getDefaultNeighbourhood() : null;
    return {
      v: 1,
      answers: {},
      neighbourhoodId: n?.id ?? null,
      neighbourhoodName: n?.name ?? null,
      addressNote: "",
      whenType: null,
      whenDate: null,
      note: "",
      photoIds: [],
      hidePhone: false,
    };
  });
  const [keepIds] = React.useState<string[]>(() => (typeof window !== "undefined" ? (readWizardDraft<Draft>(draftKey)?.photoIds ?? []) : []));
  const photos = useRequestPhotos(draftKey, keepIds);
  const photosRef = React.useRef(photos);
  React.useEffect(() => {
    photosRef.current = photos;
  });

  const flowSteps = React.useMemo(
    () =>
      buildFlowSteps<Draft>(schema, {
        getAnswers: (d) => d.answers ?? {},
        setAnswers: (d, a) => ({ ...d, answers: a }),
      }),
    [schema],
  );

  const hasUser = !!user;
  const steps = React.useMemo<WizardStep<Draft>[]>(
    () => withNotice(notice, picked && picker ? 1 : 0, [
      ...(picked && picker
        ? [
            {
              id: "hizmet",
              title: PICK_STEP_TITLE,
              help: PICK_STEP_HELP,
              render: (ctx: Ctx) => (
                <ServicePicker
                  data={picker}
                  hrefFor={(slug) => pickedRequestHref(slug, 2)}
                  selectedSlug={category.slug}
                  onSelectedClick={() => void ctx.next()}
                />
              ),
            } satisfies WizardStep<Draft>,
          ]
        : []),
      ...flowSteps,
      {
        id: "konum",
        title: "Hizmet nerede verilecek?",
        help: "Mahalleni seç. Adres tarifin yalnızca talebinle ilgilenen firmalara gösterilir.",
        validate: (d) => (d.neighbourhoodId ? null : "Lütfen mahalleni seç."),
        render: (ctx) => <LocationStep ctx={ctx} />,
      },
      {
        id: "zaman",
        title: "Ne zaman lazım?",
        validate: validateWhen,
        hideFooter: (d) => d.whenType !== "tarih",
        render: (ctx) => <WhenStep ctx={ctx} />,
      },
      {
        id: "not",
        title: "Eklemek istediğin bir şey var mı?",
        help: "İsteğe bağlı. Kısa bir not ve fotoğraflar, firmaların daha doğru fiyat vermesine yardımcı olur.",
        validate: () => (photosRef.current.processingRef.current > 0 ? "Fotoğraflar hazırlanıyor, birkaç saniye bekle." : null),
        render: (ctx) => <NoteStep ctx={ctx} />,
      },
      {
        id: "ozet",
        title: "Talebini kontrol et",
        help: "Değiştirmek istediğin bir şey varsa Düzenle'ye dokun.",
        nextLabel: "Devam et",
        render: (ctx) => <SummaryStep ctx={ctx} schema={schema} />,
      },
      {
        id: "gonder",
        title: "İletişim ve gönder",
        hideFooter: () => !hasUser,
        render: (ctx) => <ContactStep ctx={ctx} category={category} loginNext={requestHref(ctx.count)} />,
      },
    ]),
    [notice, picked, picker, flowSteps, schema, category, hasUser, requestHref],
  );

  const onComplete = React.useCallback(
    async (d: Draft): Promise<string | void> => {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) {
        router.push(routes.auth.login(requestHref(steps.length)));
        return "Göndermek için giriş yapmalısın.";
      }
      const check = validateAnswers(schema, d.answers ?? {});
      if (!check.valid) return invalidAnswersMessage(schema, Object.keys(check.errors));
      if (!d.neighbourhoodId) return "Mahalle seçmelisin. Özet ekranından Konum'u düzenleyebilirsin.";
      const whenErr = validateWhen(d);
      if (whenErr) return whenErr;

      let uploaded = { urls: [] as string[], paths: [] as string[] };
      const recs = photosRef.current.recordsFor(d.photoIds ?? []);
      if (recs.length) {
        try {
          uploaded = await uploadRequestPhotos(uid, recs);
        } catch (e) {
          return (e as Error).message;
        }
      }

      const { data, error } = await supabase.rpc("submit_service_request", {
        p_category_id: category.id,
        p_answers: check.cleaned as unknown as Json,
        p_neighbourhood_id: d.neighbourhoodId,
        p_address_note: d.addressNote.trim() || undefined,
        p_when_type: d.whenType ?? "esnek",
        p_when_date: d.whenType === "tarih" && d.whenDate ? d.whenDate : undefined,
        p_note: d.note.trim() || undefined,
        p_photos: uploaded.urls,
        p_hide_phone: d.hidePhone,
      });
      if (error || !data) {
        void removeUploadedPhotos(uploaded.paths);
        if (error?.hint === "invalid_answers") {
          const ids = (error.message.split(":").pop() ?? "").split(",").map((s) => s.trim()).filter(Boolean);
          return invalidAnswersMessage(schema, ids);
        }
        if (error?.hint === "login_required") {
          router.push(routes.auth.login(requestHref(steps.length)));
          return "Oturumun sona ermiş. Lütfen tekrar giriş yap.";
        }
        return rpcErrorMessage(error, "Talebin gönderilemedi. Lütfen tekrar dene.");
      }
      const res = data as unknown as SubmitRequestResult;
      await photosRef.current.clearAll();
      router.push(routes.services.requestDone(res.public_code));
    },
    [category.id, schema, router, steps.length, requestHref],
  );

  return (
    <PhotosContext.Provider value={photos}>
      <Wizard<Draft>
        steps={steps}
        initialData={initialData}
        draftKey={draftKey}
        onComplete={onComplete}
        completeLabel="Talebi gönder"
        title={<WizardTitle text={category.name} onClose={() => setLeaveOpen(true)} />}
        onExit={() => setLeaveOpen(true)}
      />
      {/* Started from the picker: leaving ends the flow (home); a deep link goes back to its category page. */}
      <LeaveSheet
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        onLeave={() => router.push(picked ? routes.home() : routes.services.category(category.parentSlug))}
      />
    </PhotosContext.Provider>
  );
}

/** Puts `notice` above the content of the visible step at `atIndex` (the first question). */
function withNotice(notice: React.ReactNode, atIndex: number, steps: WizardStep<Draft>[]): WizardStep<Draft>[] {
  if (!notice) return steps;
  return steps.map((s) => ({
    ...s,
    render: (ctx: Ctx) =>
      ctx.index === atIndex ? (
        <>
          <div className="mb-5">{notice}</div>
          {s.render(ctx)}
        </>
      ) : (
        s.render(ctx)
      ),
  }));
}

function invalidAnswersMessage(schema: FlowSchema, ids: string[]): string {
  const titles = ids.map((id) => schema.steps.find((s) => s.id === id)?.title).filter(Boolean);
  return titles.length
    ? `Şu sorular eksik ya da geçersiz: ${titles.join(", ")}. Özet ekranından Düzenle ile düzeltebilirsin.`
    : "Bazı cevaplar eksik ya da geçersiz. Lütfen soruları kontrol et.";
}

function validateWhen(d: Draft): string | null {
  if (!d.whenType) return "Ne zaman lazım olduğunu seç.";
  if (d.whenType !== "tarih") return null;
  if (!d.whenDate) return "Takvimden bir gün seç.";
  const today = istanbulDateKey(new Date());
  if (d.whenDate < today) return "Geçmiş bir tarih seçilemez.";
  if (d.whenDate > addDaysToKey(today, MAX_WHEN_DAYS)) return "En fazla 6 ay sonrası için talep oluşturabilirsin.";
  return null;
}

/* ------------------------------------------------------------------ steps */

function LocationStep({ ctx }: { ctx: Ctx }) {
  const d = ctx.data;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Label htmlFor="talep-mahalle" className="mb-2 text-sm font-semibold">
          Mahalle
        </Label>
        <NeighbourhoodPicker
          id="talep-mahalle"
          value={d.neighbourhoodId}
          onChange={(n) => ctx.setData({ neighbourhoodId: n ? String(n.id) : null, neighbourhoodName: n?.name ?? null })}
          showUseLocation
          invalid={!!ctx.error && !d.neighbourhoodId}
          placeholder="Mahalle seç"
          className="h-12"
        />
      </div>
      <div>
        <Label htmlFor="talep-adres" className="mb-2 text-sm font-semibold">
          Adres tarifi (isteğe bağlı)
        </Label>
        <Textarea
          id="talep-adres"
          value={d.addressNote}
          maxLength={ADDRESS_MAX}
          rows={3}
          placeholder="Örn. Atatürk Cad. yakını, site girişindeki mavi blok"
          onChange={(e) => ctx.setData({ addressNote: e.target.value.slice(0, ADDRESS_MAX) })}
        />
        <div className="mt-1.5 flex items-start justify-between gap-3 text-xs text-muted-foreground">
          <p className="flex items-start gap-1.5">
            <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
            Sadece talebinle ilgilenen firmalar görür.
          </p>
          <span className="shrink-0 tabular-nums">
            {d.addressNote.length}/{ADDRESS_MAX}
          </span>
        </div>
      </div>
    </div>
  );
}

const WHEN_ICONS: Record<WhenType, LucideIcon> = { acil: Zap, bu_hafta: CalendarDays, tarih: CalendarCheck, esnek: CalendarClock };

function WhenStep({ ctx }: { ctx: Ctx }) {
  const d = ctx.data;
  const timer = React.useRef<number | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  const today = istanbulDateKey(new Date());
  const maxKey = addDaysToKey(today, MAX_WHEN_DAYS);
  const quick = [
    { label: "Bugün", key: today },
    { label: "Yarın", key: addDaysToKey(today, 1) },
    { label: "2 gün sonra", key: addDaysToKey(today, 2) },
  ];

  const choose = (v: WhenType) => {
    ctx.setData((prev) => ({ ...prev, whenType: v, whenDate: v === "tarih" ? prev.whenDate : null }));
    if (timer.current) window.clearTimeout(timer.current);
    if (v !== "tarih") timer.current = window.setTimeout(() => void ctx.next(), 220);
  };

  return (
    <div className="flex flex-col gap-5">
      <div role="radiogroup" aria-label="Ne zaman lazım?" className="grid gap-2.5">
        {WHEN_OPTIONS.map((o) => {
          const active = d.whenType === o.value;
          const Icon = WHEN_ICONS[o.value];
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => choose(o.value)}
              className={cn(optionBase, active && optionActive)}
            >
              <span
                className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl text-primary transition-colors", active ? "bg-card" : "bg-brand-soft")}
                aria-hidden
              >
                <Icon className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[15px] font-semibold", active && "text-primary")}>{o.label}</span>
                <span className="block text-xs font-medium text-muted-foreground">{o.description}</span>
              </span>
              {active ? <Check className="size-5 shrink-0 text-primary" aria-hidden /> : null}
            </button>
          );
        })}
      </div>

      {d.whenType === "tarih" ? (
        <div className="animate-fade-in rounded-2xl bg-muted/60 p-4">
          <div className="grid grid-cols-3 gap-2">
            {quick.map((q) => (
              <button
                key={q.key}
                type="button"
                aria-pressed={d.whenDate === q.key}
                onClick={() => ctx.setData({ whenDate: q.key })}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center rounded-2xl bg-card px-2 text-sm font-bold transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                  d.whenDate === q.key && "bg-brand-soft text-primary hover:bg-brand-soft",
                )}
              >
                {q.label}
                <span className="text-xs font-medium text-muted-foreground">{formatDate(`${q.key}T12:00:00+03:00`)}</span>
              </button>
            ))}
          </div>
          <label className="mt-4 block text-sm font-semibold" htmlFor="talep-tarih">
            Başka bir gün
          </label>
          <Input
            id="talep-tarih"
            type="date"
            value={d.whenDate ?? ""}
            min={today}
            max={maxKey}
            aria-invalid={!!ctx.error || undefined}
            onChange={(e) => ctx.setData({ whenDate: e.target.value || null })}
            className="mt-1.5 h-12"
          />
          {d.whenDate ? <p className="mt-2 text-sm font-medium">{whenLabel("tarih", d.whenDate)}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function NoteStep({ ctx }: { ctx: Ctx }) {
  const d = ctx.data;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Label htmlFor="talep-not" className="mb-2 text-sm font-semibold">
          Not (isteğe bağlı)
        </Label>
        <Textarea
          id="talep-not"
          value={d.note}
          maxLength={NOTE_MAX}
          rows={4}
          className="min-h-28"
          placeholder="Örn. Hafta içi 18:00'den sonra evdeyim, kedimiz var."
          onChange={(e) => ctx.setData({ note: e.target.value.slice(0, NOTE_MAX) })}
        />
        <p className="mt-1.5 text-right text-xs text-muted-foreground tabular-nums">
          {d.note.length}/{NOTE_MAX}
        </p>
      </div>
      <PhotoPicker ctx={ctx} />
    </div>
  );
}

function PhotoPicker({ ctx }: { ctx: Ctx }) {
  const photos = usePhotos();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const ids = (ctx.data.photoIds ?? []).filter((id) => photos.previews[id]);
  const room = MAX_PHOTOS - ids.length - photos.processing;

  const onFiles = (list: FileList | null) => {
    const files = list ? Array.from(list) : [];
    if (!files.length) return;
    void photos.add(files, ids.length, MAX_PHOTOS, (id) => ctx.setData((prev) => ({ ...prev, photoIds: [...(prev.photoIds ?? []), id] })));
  };

  const remove = (id: string) => {
    ctx.setData((prev) => ({ ...prev, photoIds: (prev.photoIds ?? []).filter((x) => x !== id) }));
    void photos.remove(id);
  };

  return (
    <div>
      <p className="text-sm font-semibold">Fotoğraflar (isteğe bağlı)</p>
      <p className="mt-1 mb-3 text-xs leading-relaxed text-muted-foreground">
        En fazla {MAX_PHOTOS} fotoğraf ({ids.length}/{MAX_PHOTOS}). Fotoğraflar talebi gönderdiğinde yüklenir; konum bilgileri otomatik silinir.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <ul className="grid grid-cols-3 gap-2">
        {ids.map((id, i) => (
          <li key={id} className="relative aspect-square overflow-hidden rounded-xl bg-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photos.previews[id]} alt={`Fotoğraf ${i + 1}`} className="size-full object-cover" />
            <button
              type="button"
              onClick={() => remove(id)}
              aria-label={`Fotoğraf ${i + 1}: kaldır`}
              className="absolute top-1 right-1 flex size-9 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/75"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
        {Array.from({ length: photos.processing }, (_, i) => (
          <li key={`p${i}`} className="flex aspect-square items-center justify-center rounded-xl bg-muted">
            <Loader2 className="size-6 animate-spin text-primary" aria-label="Fotoğraf hazırlanıyor" />
          </li>
        ))}
        {room > 0 ? (
          <li>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl bg-muted text-sm font-semibold text-foreground transition-colors outline-none hover:bg-brand-soft focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ImagePlus className="size-6 text-primary" aria-hidden />
              Fotoğraf ekle
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function SummaryRow({ title, children, onEdit }: { title: string; children: React.ReactNode; onEdit: () => void }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <div className="mt-0.5 text-[15px] font-semibold break-words">{children}</div>
      </div>
      <Button type="button" variant="ghost" size="sm" className="-mr-2 h-11 shrink-0 text-primary" onClick={onEdit} aria-label={`${title}: düzenle`}>
        Düzenle
      </Button>
    </li>
  );
}

function SummaryStep({ ctx, schema }: { ctx: Ctx; schema: FlowSchema }) {
  const photos = usePhotos();
  const d = ctx.data;
  const rows = summarizeAnswers(schema, d.answers ?? {});
  const photoIds = (d.photoIds ?? []).filter((id) => photos.previews[id]);
  return (
    <ul className="divide-y overflow-hidden rounded-2xl bg-card">
      {rows.map((r) => (
        <SummaryRow key={r.stepId} title={r.title} onEdit={() => ctx.goTo(`q_${r.stepId}`)}>
          {r.answer}
        </SummaryRow>
      ))}
      <SummaryRow title="Konum" onEdit={() => ctx.goTo("konum")}>
        {neighbourhoodLabel(d.neighbourhoodName)}
        {d.addressNote.trim() ? <span className="mt-0.5 block text-sm font-medium text-muted-foreground">{d.addressNote.trim()}</span> : null}
      </SummaryRow>
      <SummaryRow title="Ne zaman" onEdit={() => ctx.goTo("zaman")}>
        {whenLabel(d.whenType, d.whenDate)}
      </SummaryRow>
      <SummaryRow title="Not" onEdit={() => ctx.goTo("not")}>
        {d.note.trim() ? <span className="font-medium whitespace-pre-line">{d.note.trim()}</span> : <span className="text-muted-foreground">Yok</span>}
      </SummaryRow>
      <SummaryRow title="Fotoğraflar" onEdit={() => ctx.goTo("not")}>
        {photoIds.length ? (
          <span className="mt-1 flex flex-wrap gap-1.5">
            {photoIds.map((id, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={id} src={photos.previews[id]} alt={`Fotoğraf ${i + 1}`} className="size-12 rounded-lg object-cover" />
            ))}
          </span>
        ) : (
          <span className="text-muted-foreground">Yok</span>
        )}
      </SummaryRow>
    </ul>
  );
}

/** `loginNext`: this wizard's URL at the last step (login returns here). */
function ContactStep({ ctx, category, loginNext }: { ctx: Ctx; category: WizardCategory; loginNext: string }) {
  const router = useRouter();
  const { user, loading } = useAuth();
  const d = ctx.data;
  const phone = fromSupabasePhone(user?.phone ?? null);
  const max = category.maxProviders;

  return (
    <div className="flex flex-col gap-4">
      <label
        htmlFor="talep-gizli-numara"
        className="flex min-h-16 cursor-pointer items-start gap-3 rounded-2xl bg-card p-4"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Numaram gizli kalsın, firmaları ben arayayım</span>
          <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
            {d.hidePhone
              ? "Firmalar numaranı görmez. İlgilenen firmaların numaraları talep sayfanda görünür, dilediğini sen ararsın."
              : "Talebinle ilgilenen firmalar seni telefonla arayabilir."}
          </span>
        </span>
        <Switch id="talep-gizli-numara" checked={d.hidePhone} onCheckedChange={(v) => ctx.setData({ hidePhone: v })} className="mt-1" />
      </label>

      <div className="rounded-2xl bg-info-soft px-4 py-3.5 text-sm leading-relaxed">
        <p className="font-semibold">
          {d.hidePhone ? `Talebin en fazla ${max} firmayla paylaşılır; numaran gizli kalır.` : `Talebin ve numaran en fazla ${max} firmayla paylaşılır.`}
        </p>
        <p className="mt-1 text-foreground/80">
          {category.autoDispatch
            ? "Talebin hemen bölgendeki uygun firmalara iletilir."
            : "Talebin önce ekibimiz tarafından kontrol edilir, ardından uygun firmalara iletilir."}{" "}
          Firmalar ilgilendikçe bildirim alırsın.
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-28 w-full rounded-2xl" />
      ) : user ? (
        phone ? (
          <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
            <Phone className="size-4 shrink-0" aria-hidden />
            Hesabın: <strong className="font-semibold text-foreground tabular-nums">{formatPhoneTR(phone)}</strong>
          </p>
        ) : null
      ) : (
        <div className="rounded-2xl bg-card p-4">
          <p className="font-semibold">Göndermek için giriş yap</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Telefon numaranla saniyeler içinde giriş yap. Cevapların bu cihazda kayıtlı; giriş yaptıktan sonra buraya dönüp talebini gönderebilirsin.
          </p>
          <Button
            type="button"
            size="lg"
            className="mt-3 w-full bg-foreground text-background shadow-none hover:bg-foreground/90"
            onClick={() => router.push(routes.auth.login(loginNext))}
          >
            <LogIn /> Giriş yap ve gönder
          </Button>
        </div>
      )}

      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        Göndererek{" "}
        <Link href={routes.legal.terms()} className="font-medium underline underline-offset-2">
          Kullanım Koşulları
        </Link>
        &apos;nı kabul etmiş ve{" "}
        <Link href={routes.legal.kvkk()} className="font-medium underline underline-offset-2">
          KVKK Aydınlatma Metni
        </Link>
        &apos;ni okumuş olursun.
      </p>
    </div>
  );
}
