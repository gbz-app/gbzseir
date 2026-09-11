"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlignLeft,
  Briefcase,
  BriefcaseBusiness,
  CalendarClock,
  Clock,
  Eye,
  EyeOff,
  Factory,
  FileText,
  Gift,
  GraduationCap,
  LayoutGrid,
  ListChecks,
  MapPin,
  Wallet,
} from "lucide-react";
import { routes } from "@/core/routes";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DistrictPicker } from "@/components/shared/district-picker";
import { Wizard, type WizardStep } from "@/components/wizard/wizard";
import { districtBySlug, isDistrictSlug } from "@/config/districts";
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
import { digitsInput, districtPatch, draftDistrict, type JobDraft } from "../wizard-drafts";
import { CategoryIcon } from "./category-icon";
import { ChoiceChips } from "./choice-chips";
import { JobDetailView } from "./detail-views";
import { BENEFIT_ICONS, WORK_TYPE_ICONS, jobLocationIcon, withOptionIcons } from "./listing-icons";
import { Field, SwitchRow, TextRiskNotice } from "./wizard-bits";

const WORK_TYPE_OPTIONS = withOptionIcons(WORK_TYPES, WORK_TYPE_ICONS);
const BENEFIT_OPTIONS = withOptionIcons(JOB_BENEFITS, BENEFIT_ICONS);
const LOCATION_OPTIONS = withOptionIcons(
  JOB_LOCATIONS.map((l) => ({ value: l.key, label: l.label })),
  Object.fromEntries(JOB_LOCATIONS.map((l) => [l.key, jobLocationIcon(l.label)])),
);

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
  districtId: null,
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
  /** `district_id`: the business district, pre-selected for a new ad. */
  business: { id: string; district_id?: string | null } & BusinessRef;
  editId: string | null;
  initial: JobDraft | null;
};

/** E7 - İş ilanı verme / düzenleme sihirbazı (sadece onaylı işletmeler). */
export function JobWizard({ sectors, business, editId, initial }: JobWizardProps) {
  const router = useRouter();
  const { user } = useAuth();
  const businessDistrict = isDistrictSlug(business.district_id) ? business.district_id : null;
  const initialData = React.useMemo<JobDraft>(() => initial ?? { ...EMPTY, districtId: businessDistrict }, [initial, businessDistrict]);
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
      districtName: districtBySlug(draftDistrict(d))?.name ?? null,
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
      icon: Briefcase,
      help: `${business.name} adına yayınlanır.`,
      validate: (d) => {
        if (d.title.trim().length < TITLE_MIN) return `Pozisyon adı en az ${TITLE_MIN} karakter olmalı.`;
        if (!d.sectorId) return "Sektör seç.";
        return null;
      },
      render: (ctx) => (
        <div className="flex flex-col gap-5">
          <Field id="is-pozisyon" label="Pozisyon" icon={BriefcaseBusiness}>
            <Input
              id="is-pozisyon"
              value={ctx.data.title}
              maxLength={TITLE_MAX}
              placeholder="Aradığın pozisyonun adı"
              onChange={(e) => ctx.setData({ title: e.target.value })}
            />
          </Field>
          <Field label="Sektör" icon={LayoutGrid}>
            <ChoiceChips
              options={topSectors.map((s) => ({ value: s.id, label: s.name, icon: <CategoryIcon iconName={s.icon} fallback="briefcase" /> }))}
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
      icon: Clock,
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
            <Field label="Çalışma şekli" icon={CalendarClock}>
              <ChoiceChips options={WORK_TYPE_OPTIONS} value={d.workType} onChange={(v) => ctx.setData({ workType: v })} ariaLabel="Çalışma şekli" size="sm" />
            </Field>
            <div className="flex flex-col gap-3">
              <p className="flex items-center gap-2 text-[15px] leading-snug font-semibold">
                <Wallet className="size-[18px] shrink-0 text-primary" aria-hidden />
                Maaş (aylık, net)
              </p>
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
              <SwitchRow
                id="maas-gizli"
                label={<>Maaşı gösterme (&quot;Görüşülür&quot;)</>}
                icon={EyeOff}
                checked={d.salaryHidden}
                onCheckedChange={(c) => ctx.setData({ salaryHidden: c })}
              />
            </div>
            <Field label="Deneyim" icon={GraduationCap}>
              <ChoiceChips options={EXPERIENCE_LEVELS} value={d.experience} onChange={(v) => ctx.setData({ experience: v })} ariaLabel="Deneyim" size="sm" />
            </Field>
            <Field label="Yan haklar (isteğe bağlı)" icon={Gift}>
              <ChoiceChips multiple options={BENEFIT_OPTIONS} value={d.benefits} onChange={(v) => ctx.setData({ benefits: v })} ariaLabel="Yan haklar" size="sm" />
            </Field>
          </div>
        );
      },
    },
    {
      id: "aciklama",
      title: "İşi anlat",
      icon: FileText,
      help: "Görevler, çalışma saatleri, vardiya düzeni... Başvuranlar seni telefonla arayacak.",
      validate: (d) => (d.description.trim().length < JOB_DESCRIPTION_MIN ? `İş tanımı en az ${JOB_DESCRIPTION_MIN} karakter olmalı.` : null),
      render: (ctx) => (
        <div className="flex flex-col gap-5">
          <Field id="is-tanim" label="İş tanımı" icon={AlignLeft} hint={`${ctx.data.description.length}/${JOB_DESCRIPTION_MAX}`}>
            <Textarea id="is-tanim" rows={6} maxLength={JOB_DESCRIPTION_MAX} value={ctx.data.description} onChange={(e) => ctx.setData({ description: e.target.value })} />
          </Field>
          <Field id="is-nitelik" label="Aranan nitelikler (isteğe bağlı)" icon={ListChecks} hint={`${ctx.data.qualifications.length}/${JOB_QUALIFICATIONS_MAX}`}>
            <Textarea
              id="is-nitelik"
              rows={4}
              maxLength={JOB_QUALIFICATIONS_MAX}
              placeholder="Aradığın belge, ehliyet ya da deneyim"
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
      icon: MapPin,
      validate: (d) => (d.locationKey ? null : "Bölge seç."),
      render: (ctx) => (
        <div className="flex flex-col gap-5">
          <Field label="Bölge / OSB" icon={Factory}>
            <ChoiceChips
              options={LOCATION_OPTIONS}
              value={ctx.data.locationKey}
              onChange={(v) => ctx.setData({ locationKey: v })}
              ariaLabel="Bölge"
              size="sm"
            />
          </Field>
          <Field label="İlçe (isteğe bağlı)" icon={MapPin}>
            <DistrictPicker
              value={draftDistrict(ctx.data)}
              onChange={(dist) => ctx.setData(districtPatch(dist?.slug ?? null))}
              allowClear
              title="İlçe seç"
              description="İşin olduğu ilçeyi seç."
            />
          </Field>
        </div>
      ),
    },
    {
      id: "onizleme",
      title: "Önizleme",
      icon: Eye,
      help: "İlanın böyle görünecek. Her şey doğruysa yayınla.",
      render: (ctx) => (
        <div className="-mx-4 overflow-hidden rounded-3xl">
          <JobDetailView model={previewModel(ctx.data)} preview />
        </div>
      ),
    },
  ];

  const onComplete = async (d: JobDraft): Promise<string | void> => {
    if (!user) return "Oturumun kapanmış. Lütfen tekrar giriş yap.";
    if (!d.sectorId) return "Sektör seç.";
    const supabase = createClient();
    const district = draftDistrict(d);
    const payload = {
      category_id: d.sectorId,
      business_id: business.id,
      title: d.title.trim(),
      description: composeJobDescription(d.description, d.qualifications),
      district_id: district,
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
      // A new district drops the ad's old neighbourhood (it would contradict the district until the column goes).
      const moved = district !== (initial?.districtId ?? null);
      const { data, error } = await supabase
        .from("listings")
        .update(moved ? { ...payload, neighbourhood_id: null } : payload)
        .eq("id", editId)
        .eq("owner_id", user.id)
        .select("id,status")
        .single();
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
      exitHref={editId ? routes.profile.jobs() : routes.listings.jobs()}
    />
  );
}
