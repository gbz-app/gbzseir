"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { routes } from "@/core/routes";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { NeighbourhoodPicker } from "@/components/shared/neighbourhood-picker";
import { Wizard, type WizardStep } from "@/components/wizard/wizard";
import { useAuth } from "@/lib/auth/auth-provider";
import { createClient } from "@/lib/supabase/client";
import {
  EXPERIENCE_LEVELS,
  JOB_BENEFITS,
  JOB_DESCRIPTION_MAX,
  JOB_DESCRIPTION_MIN,
  JOB_LOCATIONS,
  JOB_QUALIFICATIONS_MAX,
  JOB_SAFETY_TEXT,
  SALARY_MAX,
  TITLE_MAX,
  TITLE_MIN,
  WORK_TYPES,
  jobLocationByKey,
  optionLabel,
} from "../constants";
import { isSalaryVisible, salaryText } from "../format";
import { composeJobDescription } from "../job-description";
import type { BusinessRef, ListingCategory } from "../types";
import { benefitOptions, type JobViewModel } from "../view-models";
import { digitsInput, type JobDraft } from "../wizard-drafts";
import { ChoiceChips } from "./choice-chips";
import { JobDetailView } from "./detail-views";
import { Field, TextRiskNotice } from "./wizard-bits";

const EMPTY: JobDraft = {
  sectorId: null,
  title: "",
  workType: null,
  salaryMin: "",
  salaryMax: "",
  salaryHidden: false,
  experience: "farketmez",
  benefits: [],
  description: "",
  qualifications: "",
  locationKey: null,
  neighbourhoodId: null,
  neighbourhoodName: null,
};

const toNum = (s: string): number | null => (s ? Number(s) : null);

/** Listing caps (DB error hints) -> Turkish text. */
const CAP_MESSAGES: Record<string, string> = {
  listing_daily_cap: "Son 24 saatte çok fazla ilan verdin. Biraz sonra tekrar dene.",
  listing_active_cap: "Açık ilan sınırına ulaştın (yayında, onay bekleyen ve durdurulmuş). Yeni ilan için eski ilanlarından birini sil ya da doldu olarak işaretle.",
};

export type JobWizardProps = {
  /** Job sectors (listing_categories.type = 'job'). */
  sectors: ListingCategory[];
  business: { id: string } & BusinessRef;
  editId: string | null;
  initial: JobDraft | null;
};

/** E7 - İş ilanı verme / düzenleme sihirbazı (sadece onaylı işletmeler). */
export function JobWizard({ sectors, business, editId, initial }: JobWizardProps) {
  const router = useRouter();
  const { user } = useAuth();
  const initialData = React.useMemo<JobDraft>(() => initial ?? EMPTY, [initial]);
  const topSectors = sectors.filter((s) => !s.parent_id);

  const previewModel = (d: JobDraft): JobViewModel => {
    const sector = sectors.find((s) => s.id === d.sectorId) ?? null;
    const min = d.salaryHidden ? null : toNum(d.salaryMin);
    const max = d.salaryHidden ? null : toNum(d.salaryMax);
    return {
      id: null,
      title: d.title.trim() || "Pozisyon",
      sectorName: sector?.name ?? null,
      sectorSlug: sector?.slug ?? null,
      workTypeLabel: optionLabel(WORK_TYPES, d.workType),
      salaryText: salaryText(min, max, d.salaryHidden),
      salaryVisible: isSalaryVisible(min, max, d.salaryHidden),
      experienceLabel: optionLabel(EXPERIENCE_LEVELS, d.experience),
      benefits: benefitOptions(d.benefits),
      description: d.description.trim(),
      qualifications: d.qualifications.trim(),
      locationLabel: jobLocationByKey(d.locationKey)?.label ?? null,
      neighbourhoodName: d.neighbourhoodName,
      postedAt: new Date().toISOString(),
      listingNo: null,
      company: business,
      state: "live",
    };
  };

  const steps: WizardStep<JobDraft>[] = [
    {
      id: "pozisyon",
      title: "Hangi pozisyon için arıyorsun?",
      help: `${business.name} adına yayınlanır.`,
      validate: (d) => {
        if (d.title.trim().length < TITLE_MIN) return `Pozisyon adı en az ${TITLE_MIN} karakter olmalı.`;
        if (!d.sectorId) return "Sektör seç.";
        return null;
      },
      render: (ctx) => (
        <div className="flex flex-col gap-5">
          <Field id="is-pozisyon" label="Pozisyon">
            <Input
              id="is-pozisyon"
              value={ctx.data.title}
              maxLength={TITLE_MAX}
              placeholder="Örn. CNC Operatörü"
              onChange={(e) => ctx.setData({ title: e.target.value })}
            />
          </Field>
          <Field label="Sektör">
            <ChoiceChips
              options={topSectors.map((s) => ({ value: s.id, label: s.name }))}
              value={ctx.data.sectorId}
              onChange={(v) => ctx.setData({ sectorId: v })}
              ariaLabel="Sektör"
              size="sm"
            />
          </Field>
        </div>
      ),
    },
    {
      id: "kosullar",
      title: "Çalışma koşulları",
      validate: (d) => {
        if (!d.workType) return "Çalışma şeklini seç.";
        if (!d.salaryHidden) {
          const min = toNum(d.salaryMin);
          const max = toNum(d.salaryMax);
          if ((min ?? 0) > SALARY_MAX || (max ?? 0) > SALARY_MAX) return "Maaş çok yüksek görünüyor.";
          if (min != null && max != null && min > max) return "En düşük maaş, en yüksek maaştan büyük olamaz.";
        }
        return null;
      },
      render: (ctx) => {
        const d = ctx.data;
        return (
          <div className="flex flex-col gap-6">
            <Field label="Çalışma şekli">
              <ChoiceChips options={WORK_TYPES} value={d.workType} onChange={(v) => ctx.setData({ workType: v })} ariaLabel="Çalışma şekli" size="sm" />
            </Field>
            <div className="flex flex-col gap-3">
              <p className="text-[15px] font-semibold">Maaş (aylık, net)</p>
              {!d.salaryHidden ? (
                <div className="grid grid-cols-2 gap-3">
                  <Field id="maas-min" label={<span className="text-sm font-medium text-muted-foreground">En az</span>}>
                    <Input id="maas-min" inputMode="numeric" className="tabular-nums" value={d.salaryMin ? Number(d.salaryMin).toLocaleString("tr-TR") : ""} placeholder="TL" onChange={(e) => ctx.setData({ salaryMin: digitsInput(e.target.value) })} />
                  </Field>
                  <Field id="maas-max" label={<span className="text-sm font-medium text-muted-foreground">En çok</span>}>
                    <Input id="maas-max" inputMode="numeric" className="tabular-nums" value={d.salaryMax ? Number(d.salaryMax).toLocaleString("tr-TR") : ""} placeholder="TL" onChange={(e) => ctx.setData({ salaryMax: digitsInput(e.target.value) })} />
                  </Field>
                </div>
              ) : null}
              <label htmlFor="maas-gizli" className="flex min-h-12 items-center justify-between gap-3 rounded-xl border bg-card px-4">
                <span className="text-[15px] font-medium">Maaşı gösterme (&quot;Görüşülür&quot;)</span>
                <Switch id="maas-gizli" checked={d.salaryHidden} onCheckedChange={(c) => ctx.setData({ salaryHidden: c })} />
              </label>
            </div>
            <Field label="Deneyim">
              <ChoiceChips options={EXPERIENCE_LEVELS} value={d.experience} onChange={(v) => ctx.setData({ experience: v })} ariaLabel="Deneyim" size="sm" />
            </Field>
            <Field label="Yan haklar (isteğe bağlı)">
              <ChoiceChips multiple options={JOB_BENEFITS} value={d.benefits} onChange={(v) => ctx.setData({ benefits: v })} ariaLabel="Yan haklar" size="sm" />
            </Field>
          </div>
        );
      },
    },
    {
      id: "aciklama",
      title: "İşi anlat",
      help: "Görevler, çalışma saatleri, vardiya düzeni... Başvuranlar seni telefonla arayacak.",
      validate: (d) => (d.description.trim().length < JOB_DESCRIPTION_MIN ? `İş tanımı en az ${JOB_DESCRIPTION_MIN} karakter olmalı.` : null),
      render: (ctx) => (
        <div className="flex flex-col gap-5">
          <Field id="is-tanim" label="İş tanımı" hint={`${ctx.data.description.length}/${JOB_DESCRIPTION_MAX}`}>
            <Textarea id="is-tanim" rows={6} maxLength={JOB_DESCRIPTION_MAX} value={ctx.data.description} onChange={(e) => ctx.setData({ description: e.target.value })} />
          </Field>
          <Field id="is-nitelik" label="Aranan nitelikler (isteğe bağlı)" hint={`${ctx.data.qualifications.length}/${JOB_QUALIFICATIONS_MAX}`}>
            <Textarea
              id="is-nitelik"
              rows={4}
              maxLength={JOB_QUALIFICATIONS_MAX}
              placeholder="Örn. Forklift ehliyeti, vardiyalı çalışabilecek"
              value={ctx.data.qualifications}
              onChange={(e) => ctx.setData({ qualifications: e.target.value })}
            />
          </Field>
          <TextRiskNotice texts={[ctx.data.title, ctx.data.description, ctx.data.qualifications]} />
          <p className="text-xs leading-relaxed text-muted-foreground">{JOB_SAFETY_TEXT}</p>
        </div>
      ),
    },
    {
      id: "konum",
      title: "İş yeri nerede?",
      validate: (d) => (d.locationKey ? null : "Bölge seç."),
      render: (ctx) => (
        <div className="flex flex-col gap-5">
          <Field label="Bölge / OSB">
            <ChoiceChips
              options={JOB_LOCATIONS.map((l) => ({ value: l.key, label: l.label }))}
              value={ctx.data.locationKey}
              onChange={(v) => ctx.setData({ locationKey: v })}
              ariaLabel="Bölge"
              size="sm"
            />
          </Field>
          <Field label="Mahalle (isteğe bağlı)">
            <NeighbourhoodPicker
              value={ctx.data.neighbourhoodId}
              onChange={(n) => ctx.setData({ neighbourhoodId: n ? String(n.id) : null, neighbourhoodName: n?.name ?? null })}
              persistDefault={false}
              allowClear
            />
          </Field>
        </div>
      ),
    },
    {
      id: "onizleme",
      title: "Önizleme",
      help: "İlanın böyle görünecek. Her şey doğruysa yayınla.",
      render: (ctx) => (
        <div className="-mx-4 overflow-hidden rounded-3xl ring-1 ring-foreground/[0.06]">
          <JobDetailView model={previewModel(ctx.data)} preview />
        </div>
      ),
    },
  ];

  const onComplete = async (d: JobDraft): Promise<string | void> => {
    if (!user) return "Oturumun kapanmış. Lütfen tekrar giriş yap.";
    if (!d.sectorId) return "Sektör seç.";
    const supabase = createClient();
    const payload = {
      category_id: d.sectorId,
      business_id: business.id,
      title: d.title.trim(),
      description: composeJobDescription(d.description, d.qualifications),
      neighbourhood_id: d.neighbourhoodId,
      job_work_type: d.workType,
      job_salary_min: d.salaryHidden ? null : toNum(d.salaryMin),
      job_salary_max: d.salaryHidden ? null : toNum(d.salaryMax),
      job_salary_hidden: d.salaryHidden,
      job_experience: d.experience,
      job_benefits: d.benefits,
      job_location_label: jobLocationByKey(d.locationKey)?.label ?? null,
    };
    let id = editId;
    let status: string | null = null;
    if (editId) {
      const { data, error } = await supabase.from("listings").update(payload).eq("id", editId).eq("owner_id", user.id).select("id,status").single();
      if (error) return error.message;
      status = data.status;
    } else {
      const { data, error } = await supabase
        .from("listings")
        .insert({ ...payload, type: "job", owner_id: user.id })
        .select("id,status")
        .single();
      if (error) return (error.hint && CAP_MESSAGES[error.hint]) || error.message;
      id = data.id;
      status = data.status;
    }
    if (!id) return "İlan kaydedilemedi. Lütfen tekrar dene.";
    router.push(routes.listings.postDone({ id, tur: "is-ilani", durum: status ?? undefined }));
  };

  return (
    <Wizard<JobDraft>
      steps={steps}
      initialData={initialData}
      draftKey={editId ? `is-ilani-duzenle-${editId}` : "is-ilani"}
      onComplete={onComplete}
      completeLabel={editId ? "Kaydet" : "Yayınla"}
      title={editId ? "İş ilanını düzenle" : "İş ilanı ver"}
      exitHref={editId ? routes.profile.jobs() : routes.listings.post()}
    />
  );
}
