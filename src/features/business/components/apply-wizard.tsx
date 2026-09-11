"use client";

import * as React from "react";
import { Clock, FileCheck, Info, MapPin, Pencil, Phone, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { Wizard, type WizardStep, type WizardStepContext } from "@/components/wizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DistrictPicker } from "@/components/shared/district-picker";
import { DISTRICT_SLUGS, districtBySlug, type KocaeliDistrict } from "@/config/districts";
import { createClient } from "@/lib/supabase/client";
import { formatPhoneTR } from "@/core/format";
import type { LatLng } from "@/core/geo";
import { routes, withQuery } from "@/core/routes";
import type { BusinessKind } from "@/lib/types";
import { businessLimitText } from "../lib/business-quota";
import { hoursToJson, summarizeHours, validateHours, type WorkingHours } from "../lib/hours";
import { VERTICAL_INFO, VERTICAL_SUBCATEGORIES, type Vertical } from "../lib/verticals";
import { TypeStep } from "./apply/type-step";
import { BusinessLogo } from "./business-logo";
import { AreaPicker } from "./editor/area-picker";
import { CategoryPicker, useServiceCategoryNames } from "./editor/category-picker";
import { DocUpload, type UploadedDoc } from "./editor/doc-upload";
import { CharCount, Field } from "./editor/field";
import { HoursEditor } from "./editor/hours-editor";
import { BusinessImagePicker, type PickedImage } from "./editor/image-picker";
import { LocationPicker } from "./editor/location-picker";
import { PhoneField, businessPhoneE164 } from "./editor/phone-field";

export type ApplyData = {
  /** Derived from the vertical: service firms get leads, every other type is a place customers visit. */
  kinds: BusinessKind[];
  vertical: Vertical | null;
  name: string;
  categoryLabel: string;
  description: string;
  logo: PickedImage | null;
  /** Formatted national number (mobile or landline). */
  phone: string;
  address: string;
  location: LatLng | null;
  /** The business's district (districts.id). */
  districtId: string | null;
  serviceCategoryIds: string[];
  /** Districts a service firm travels to (districts.id). */
  serviceDistrictIds: string[];
  hours: WorkingHours;
  document: UploadedDoc | null;
};

export type ApplyWizardProps = {
  initial: ApplyData;
  /** Finishing this pending/rejected business of the user instead of opening a new one. */
  businessId: string | null;
  /** Editing an existing business (no local draft, old files are kept, the type is locked). */
  resubmit: boolean;
  rejectionReason: string | null;
};

type Ctx = WizardStepContext<ApplyData>;

/** v3: district fields replaced the neighbourhood ones (older drafts are not restored). */
const DRAFT_KEY = "isletme-basvuru-v3";
const NAME_MAX = 80;
const LABEL_MAX = 60;
const DESC_MAX = 2000;
const ADDRESS_MAX = 200;

/** apply_business result reasons and error hints -> Turkish text. */
const RESULT_MESSAGES: Record<string, string> = {
  applications_closed: "Şu an yeni işletme başvurusu alınmıyor. Daha sonra tekrar dene.",
  invalid_kinds: "Geçerli bir işletme türü seç.",
  invalid_vertical: "Geçerli bir işletme türü seç.",
  invalid_phone: "İşletme telefonu geçersiz görünüyor. Kontrol edip tekrar dene.",
  invalid_district: "Geçerli bir ilçe seç.",
  categories_required: "Hizmet veren firmalar için en az bir hizmet kategorisi seçmelisin.",
  business_limit: businessLimitText(1),
  vertical_locked: "İşletme türü değiştirilemez. Farklı bir tür için destek ekibimize yaz.",
  not_editable: "Bu işletme zaten yayında. Bilgilerini işletme panelinden düzenleyebilirsin.",
  not_found: "İşletme bulunamadı.",
  suspended: "İşletme hesabın askıya alındığı için yeni işletme açamazsın. Destek ekibiyle iletişime geç.",
};

const LABEL_PLACEHOLDER: Record<Vertical, string> = {
  yemek: "Ev yemekleri, Dürüm ve kebap",
  restoran: "Balık restoranı, Ocakbaşı",
  kafe: "Kahve ve kahvaltı",
  otel: "Butik otel, Apart otel",
  hizmet: "Ev temizliği, Boya badana",
  magaza: "Kırtasiye, Telefon aksesuarı",
  saglik: "Diş kliniği, Fizik tedavi",
  dugun: "Düğün salonu, Organizasyon",
  egitim: "Dil kursu, Etüt merkezi",
  etkinlik: "Etkinlik alanı",
  diger: "Oto yıkama, Kuru temizleme",
};

/** Kinds follow the vertical: service firms receive leads, every other type is a place customers visit. */
function kindsFor(vertical: Vertical | null): BusinessKind[] {
  return [vertical === "hizmet" ? "service" : "shop"];
}

/** The business's district changes; an empty service district list starts with it (editable on the services step). */
function withDistrict(d: ApplyData, district: KocaeliDistrict | null): ApplyData {
  const slug = district?.slug ?? null;
  return { ...d, districtId: slug, serviceDistrictIds: d.serviceDistrictIds.length || !slug ? d.serviceDistrictIds : [slug] };
}

function BasicsStep({ ctx, deleteReplaced, onUploading }: { ctx: Ctx; deleteReplaced: boolean; onUploading: (b: boolean) => void }) {
  const { data, setData } = ctx;
  const suggestions = data.vertical ? (VERTICAL_SUBCATEGORIES[data.vertical] ?? []) : [];
  const label = data.categoryLabel.trim();
  return (
    <div className="flex flex-col gap-5">
      <Field label="İşletme adı" htmlFor="biz-name">
        <Input
          id="biz-name"
          value={data.name}
          maxLength={NAME_MAX}
          autoComplete="organization"
          autoCapitalize="words"
          placeholder="İşletmenin adı"
          onChange={(e) => setData({ name: e.target.value })}
          className="h-12"
        />
        <CharCount value={data.name} max={NAME_MAX} />
      </Field>
      <Field label="Ne iş yapıyorsun?" htmlFor="biz-label" hint="Kısa bir kategori adı. Listelerde bu başlıkla görünürsün.">
        <Input
          id="biz-label"
          value={data.categoryLabel}
          maxLength={LABEL_MAX}
          placeholder={LABEL_PLACEHOLDER[data.vertical ?? "hizmet"]}
          onChange={(e) => setData({ categoryLabel: e.target.value })}
          className="h-12"
        />
        {suggestions.length ? (
          <div className="mt-2.5 flex flex-wrap gap-1.5" role="group" aria-label="Hızlı seç">
            {suggestions.map((s) => {
              const active = label === s.label;
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setData({ categoryLabel: s.label })}
                  className={cn(
                    "inline-flex h-9 items-center rounded-full px-3.5 text-[13px] font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    active ? "bg-foreground text-background" : "bg-card hover:bg-muted",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        ) : null}
      </Field>
      <Field label="Açıklama" htmlFor="biz-desc" optional hint="Kaç yıldır çalıştığını, neleri iyi yaptığını ve farkını anlat.">
        <Textarea
          id="biz-desc"
          rows={5}
          value={data.description}
          maxLength={DESC_MAX}
          placeholder="Ne sunuyorsun, seni farklı kılan ne?"
          onChange={(e) => setData({ description: e.target.value })}
          className="min-h-32"
        />
        <CharCount value={data.description} max={DESC_MAX} />
      </Field>
      <BusinessImagePicker value={data.logo} onChange={(logo) => setData({ logo })} deleteReplaced={deleteReplaced} onUploadingChange={onUploading} />
    </div>
  );
}

function ContactStep({ ctx }: { ctx: Ctx }) {
  const { data, setData } = ctx;
  const district = districtBySlug(data.districtId);
  const isShop = data.kinds.includes("shop");
  return (
    <div className="flex flex-col gap-5">
      <Field label="İşletme telefonu" htmlFor="biz-phone" hint="İşletme sayfanda herkese açık görünür; müşteriler seni doğrudan arar. Giriş numaran hazır geldi, istersen değiştir.">
        <PhoneField id="biz-phone" value={data.phone} onChange={(phone) => setData({ phone })} />
      </Field>
      <Field label="İlçe" htmlFor="biz-district">
        <DistrictPicker id="biz-district" value={data.districtId} onChange={(d) => ctx.setData((s) => withDistrict(s, d))} title="İşletmen hangi ilçede?" />
      </Field>
      <Field
        label="Açık adres"
        htmlFor="biz-address"
        optional={!isShop}
        hint={isShop ? "Müşterilerin seni kolayca bulsun." : "Müşteriye gidiyorsan boş bırakabilirsin."}
      >
        <Textarea
          id="biz-address"
          rows={2}
          value={data.address}
          maxLength={ADDRESS_MAX}
          autoComplete="street-address"
          placeholder="Cadde, sokak, bina ve kapı no"
          onChange={(e) => setData({ address: e.target.value })}
        />
      </Field>
      <Field label="Haritadaki yeri" optional hint="İşletmen Yakınımda haritasında ve Yol tarifi'nde bu noktada görünür.">
        <LocationPicker
          value={data.location}
          onChange={(location) => setData({ location })}
          fallbackCenter={district?.center ?? null}
          // The pin is exact: its district wins over the one picked above.
          onDistrict={(d) => ctx.setData((s) => withDistrict(s, d))}
        />
      </Field>
    </div>
  );
}

function ServicesStep({ ctx }: { ctx: Ctx }) {
  const { data, setData } = ctx;
  return (
    <div className="flex flex-col gap-8">
      <CategoryPicker value={data.serviceCategoryIds} onChange={(serviceCategoryIds) => setData({ serviceCategoryIds })} />
      <div>
        <h3 className="mb-1 text-lg font-bold">Hangi ilçelere gidiyorsun?</h3>
        <p className="mb-4 text-sm text-muted-foreground">Seçtiğin ilçelerdeki talepler önce sana gelir. Yakın ilçelerden de talep gelebilir.</p>
        <AreaPicker value={data.serviceDistrictIds} onChange={(serviceDistrictIds) => setData({ serviceDistrictIds })} />
      </div>
    </div>
  );
}

function PreviewRow({ icon: Icon, title, children, onEdit }: { icon: typeof Phone; title: string; children: React.ReactNode; onEdit?: () => void }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3.5">
      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{title}</p>
        <div className="mt-0.5 text-muted-foreground">{children}</div>
      </div>
      {onEdit ? (
        <Button type="button" variant="ghost" size="sm" onClick={onEdit} aria-label={`${title}: düzenle`} className="-mr-2 shrink-0 text-primary">
          <Pencil /> Düzenle
        </Button>
      ) : null}
    </li>
  );
}

function PreviewStep({ ctx, resubmit }: { ctx: Ctx; resubmit: boolean }) {
  const { data, goTo } = ctx;
  const categoryNames = useServiceCategoryNames();
  const districtLabel = districtBySlug(data.districtId)?.name;
  const isService = data.kinds.includes("service");
  const serviceDistricts = data.serviceDistrictIds.map((id) => districtBySlug(id)?.name).filter(Boolean) as string[];
  const allDistricts = DISTRICT_SLUGS.every((slug) => data.serviceDistrictIds.includes(slug));
  const phone = businessPhoneE164(data.phone);
  const categories = data.serviceCategoryIds.map((id) => categoryNames.get(id)).filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-3xl bg-card p-4">
        <div className="flex items-center gap-3">
          <BusinessLogo name={data.name || "İşletme"} url={data.logo?.url} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg leading-tight font-extrabold">{data.name.trim() || "İşletme adı"}</p>
            <p className="truncate text-sm text-muted-foreground">
              {[data.categoryLabel.trim(), districtLabel].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        {data.vertical ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="h-6 px-2.5">
              {VERTICAL_INFO[data.vertical].label}
            </Badge>
          </div>
        ) : null}
        {data.description.trim() ? <p className="mt-3 line-clamp-4 text-sm leading-relaxed whitespace-pre-line">{data.description.trim()}</p> : null}
      </div>

      <ul className="divide-y overflow-hidden rounded-3xl bg-card">
        <PreviewRow icon={Info} title="İşletme türü" onEdit={resubmit ? undefined : () => goTo("tur")}>
          {data.vertical ? VERTICAL_INFO[data.vertical].label : "Seçilmedi"}
        </PreviewRow>
        <PreviewRow icon={Phone} title="İletişim ve konum" onEdit={() => goTo("iletisim")}>
          <p className="tabular-nums">{phone ? formatPhoneTR(phone) : "Telefon eksik"}</p>
          <p>{[data.address.trim(), districtLabel].filter(Boolean).join(", ") || "Adres eklenmedi"}</p>
          <p className="flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden />
            {data.location ? "Haritada işaretli" : "Harita konumu eklenmedi"}
          </p>
        </PreviewRow>
        {isService ? (
          <PreviewRow icon={Wrench} title="Hizmetler" onEdit={() => goTo("hizmetler")}>
            <p>{categories.length ? categories.join(", ") : `${data.serviceCategoryIds.length} hizmet`}</p>
            <p>{allDistricts ? "Tüm Kocaeli" : serviceDistricts.length ? serviceDistricts.join(", ") : "İlçe seçilmedi"}</p>
          </PreviewRow>
        ) : null}
        <PreviewRow icon={Clock} title="Çalışma saatleri" onEdit={() => goTo("saatler")}>
          {summarizeHours(data.hours).map((line) => (
            <p key={line} className="tabular-nums">
              {line}
            </p>
          ))}
        </PreviewRow>
        <PreviewRow icon={FileCheck} title="Belgeler" onEdit={() => goTo("belgeler")}>
          {data.document ? `Vergi levhası yüklendi (${data.document.name})` : "Belge yüklenmedi"}
        </PreviewRow>
      </ul>

      <p className="flex items-start gap-2 rounded-2xl bg-info-soft px-4 py-3 text-sm leading-relaxed">
        <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
        Gönderdiğinde işletme sayfan hemen yayına girer. Sonra menü, oda, hizmet ve fotoğraflarını adım adım eklersin.
      </p>
    </div>
  );
}

/** H1: new business wizard (the services step appears only for service businesses). Goes live on submit. */
export function ApplyWizard({ initial, businessId, resubmit, rejectionReason }: ApplyWizardProps) {
  const uploads = React.useRef(0);
  const onUploading = React.useCallback((busy: boolean) => {
    uploads.current = Math.max(0, uploads.current + (busy ? 1 : -1));
  }, []);
  const waitForUploads = React.useCallback(() => (uploads.current > 0 ? "Dosya yükleniyor, lütfen birkaç saniye bekle." : null), []);

  const steps = React.useMemo<WizardStep<ApplyData>[]>(
    () => [
      {
        id: "tur",
        title: resubmit ? "İşletme türün" : "Ne tür bir işletmen var?",
        help: resubmit ? undefined : "Seçtiğin türe göre panelinde sana uygun araçlar açılır.",
        validate: (d) => (d.vertical ? null : "İşletme türünü seç."),
        render: (ctx) => (
          <TypeStep
            value={ctx.data.vertical}
            onChange={(vertical) => ctx.setData({ vertical, kinds: kindsFor(vertical) })}
            rejectionReason={rejectionReason}
            resubmit={resubmit}
          />
        ),
      },
      {
        id: "bilgiler",
        title: "Temel bilgiler",
        help: "Müşterilerin seni bu bilgilerle tanıyacak.",
        validate: (d) => {
          const name = d.name.trim();
          if (name.length < 2) return "İşletme adını yaz (en az 2 karakter).";
          if (name.length > NAME_MAX) return `İşletme adı en fazla ${NAME_MAX} karakter olabilir.`;
          if (d.categoryLabel.trim().length < 2) return "Ne iş yaptığını kısaca yaz.";
          return waitForUploads();
        },
        render: (ctx) => <BasicsStep ctx={ctx} deleteReplaced={!resubmit} onUploading={onUploading} />,
      },
      {
        id: "iletisim",
        title: "İletişim ve konum",
        help: "Seni nerede ve nasıl bulabilirler?",
        validate: (d) => {
          if (!businessPhoneE164(d.phone)) return "Geçerli bir telefon numarası yaz (5XX XXX XX XX ya da 262 XXX XX XX).";
          if (!districtBySlug(d.districtId)) return "İşletmenin bulunduğu ilçeyi seç.";
          if (d.kinds.includes("shop") && d.address.trim().length < 5) return "İşletmenin açık adresini yaz.";
          return null;
        },
        render: (ctx) => <ContactStep ctx={ctx} />,
      },
      {
        id: "hizmetler",
        title: "Hangi hizmetleri veriyorsun?",
        help: "Hizmet talepleri bu seçimlere göre sana gelir.",
        isVisible: (d) => d.kinds.includes("service"),
        validate: (d) => {
          if (d.serviceCategoryIds.length === 0) return "En az bir hizmet kategorisi seç.";
          if (!d.serviceDistrictIds.some((id) => districtBySlug(id))) return "Hizmet verdiğin en az bir ilçe seç (ya da Tüm Kocaeli).";
          return null;
        },
        render: (ctx) => <ServicesStep ctx={ctx} />,
      },
      {
        id: "saatler",
        title: "Çalışma saatlerin",
        help: "Sayfanda \"Şu an açık\" bilgisi bu saatlere göre görünür.",
        validate: (d) => validateHours(d.hours),
        render: (ctx) => <HoursEditor value={ctx.data.hours} onChange={(hours) => ctx.setData({ hours })} />,
      },
      {
        id: "belgeler",
        title: "Belgeler",
        help: "İsteğe bağlı. Vergi levhanı yüklersen ekibimiz işletmeni doğrulayabilir; yoksa bu adımı geçebilirsin.",
        validate: () => waitForUploads(),
        render: (ctx) => <DocUpload value={ctx.data.document} onChange={(document) => ctx.setData({ document })} onUploadingChange={onUploading} />,
      },
      {
        id: "onizleme",
        title: "Son kontrol",
        help: "Bilgilerini gözden geçir, sonra işletmeni yayına al.",
        render: (ctx) => <PreviewStep ctx={ctx} resubmit={resubmit} />,
      },
    ],
    [rejectionReason, resubmit, onUploading, waitForUploads],
  );

  const onComplete = async (d: ApplyData): Promise<string | void> => {
    const supabase = createClient();
    const kinds = kindsFor(d.vertical);
    const isService = kinds.includes("service");
    const { data, error } = await supabase.rpc("apply_business", {
      p_name: d.name.trim(),
      p_kinds: kinds,
      p_phone: businessPhoneE164(d.phone) ?? undefined,
      p_category_label: d.categoryLabel.trim() || undefined,
      p_description: d.description.trim() || undefined,
      p_address: d.address.trim() || undefined,
      // District only (no neighbourhood); an empty service list means the business's own district.
      p_district_id: d.districtId ?? undefined,
      p_service_category_ids: isService ? d.serviceCategoryIds : [],
      p_service_district_ids: isService ? d.serviceDistrictIds : [],
      p_working_hours: hoursToJson(d.hours),
      p_lat: d.location?.lat,
      p_lng: d.location?.lng,
      p_logo_url: d.logo?.url,
      p_vertical: d.vertical ?? undefined,
      p_business_id: businessId ?? undefined,
    });
    if (error) {
      // One business per account: the apply page explains it and links to the support centre (the draft is kept).
      if (error.hint === "business_limit") {
        window.location.assign(routes.business.apply());
        // The database text carries the real limit (Ayarlar + granted slots).
        return error.message || RESULT_MESSAGES.business_limit;
      }
      return (error.hint && RESULT_MESSAGES[error.hint]) || error.message || "İşletmen kaydedilemedi. Lütfen tekrar dene.";
    }
    const result = data as { ok?: boolean; reason?: string; business_id?: string } | null;
    if (!result?.ok || !result.business_id) return (result?.reason && RESULT_MESSAGES[result.reason]) || "İşletmen kaydedilemedi. Lütfen tekrar dene.";
    let docFailed = false;
    if (d.document) {
      const { error: docError } = await supabase
        .from("business_documents")
        .insert({ business_id: result.business_id, path: d.document.path, kind: "vergi_levhasi" });
      docFailed = !!docError;
    }
    // Route handler: makes the new business the active one, then opens the "İşletmen yayında" next-steps page.
    window.location.assign(routes.business.select(result.business_id, withQuery(routes.business.applyDone(), { belge: docFailed ? "hata" : undefined })));
  };

  return (
    <Wizard<ApplyData>
      steps={steps}
      initialData={initial}
      draftKey={resubmit ? undefined : DRAFT_KEY}
      onComplete={onComplete}
      completeLabel={resubmit ? "Kaydet ve yayına al" : "İşletmemi aç"}
      title={resubmit ? "İşletme bilgileri" : "Yeni işletme"}
      exitHref={resubmit ? routes.business.root() : routes.business.intro()}
    />
  );
}
