"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Clock, FileCheck, Info, MapPin, Pencil, Phone, Wrench } from "lucide-react";
import { toast } from "sonner";
import { Wizard, type WizardStep, type WizardStepContext } from "@/components/wizard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NeighbourhoodPicker } from "@/components/shared/neighbourhood-picker";
import { createClient } from "@/lib/supabase/client";
import { useNeighbourhoods } from "@/lib/neighbourhoods";
import { formatPhoneTR } from "@/core/format";
import type { LatLng } from "@/core/geo";
import { routes } from "@/core/routes";
import type { BusinessKind } from "@/lib/types";
import { hoursToJson, summarizeHours, validateHours, type WorkingHours } from "../lib/hours";
import { KIND_LABELS, KIND_SHORT_LABELS } from "../lib/kinds";
import { BusinessLogo } from "./business-logo";
import { AreaPicker } from "./editor/area-picker";
import { CategoryPicker, useServiceCategoryNames } from "./editor/category-picker";
import { DocUpload, type UploadedDoc } from "./editor/doc-upload";
import { CharCount, Field } from "./editor/field";
import { HoursEditor } from "./editor/hours-editor";
import { BusinessImagePicker, type PickedImage } from "./editor/image-picker";
import { KindsPicker } from "./editor/kinds-picker";
import { LocationPicker } from "./editor/location-picker";
import { PhoneField, businessPhoneE164 } from "./editor/phone-field";

export type ApplyData = {
  kinds: BusinessKind[];
  name: string;
  categoryLabel: string;
  description: string;
  logo: PickedImage | null;
  /** Formatted national number (mobile or landline). */
  phone: string;
  address: string;
  location: LatLng | null;
  neighbourhoodId: string | null;
  serviceCategoryIds: string[];
  areaIds: string[];
  hours: WorkingHours;
  document: UploadedDoc | null;
};

export type ApplyWizardProps = {
  initial: ApplyData;
  /** Editing a pending/rejected application (no local draft, old files are kept). */
  resubmit: boolean;
  rejectionReason: string | null;
};

type Ctx = WizardStepContext<ApplyData>;

const DRAFT_KEY = "isletme-basvuru";
const NAME_MAX = 80;
const LABEL_MAX = 60;
const DESC_MAX = 2000;
const ADDRESS_MAX = 200;

const RESULT_MESSAGES: Record<string, string> = {
  invalid_kinds: "Geçerli bir işletme türü seç.",
  invalid_phone: "İşletme telefonu geçersiz görünüyor. Kontrol edip tekrar dene.",
  categories_required: "Hizmet veren firmalar için en az bir hizmet kategorisi seçmelisin.",
  already_exists: "Zaten onaylı bir işletme hesabın var.",
};

const LABEL_PLACEHOLDER: Record<BusinessKind, string> = {
  service: "Örn. Ev temizliği, Boya badana",
  shop: "Örn. Kırtasiye, Telefon aksesuarı",
  employer: "Örn. Tekstil üretimi, Lojistik",
};

function TypeStep({ ctx, rejectionReason, resubmit }: { ctx: Ctx; rejectionReason: string | null; resubmit: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      {rejectionReason ? (
        <div role="note" className="flex items-start gap-3 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
          <p>
            <strong className="block">Başvurun onaylanmadı</strong>
            <span className="text-foreground">{rejectionReason}</span>
            <span className="mt-1 block text-foreground/80">Bilgilerini düzeltip yeniden gönderebilirsin.</span>
          </p>
        </div>
      ) : resubmit ? (
        <div role="note" className="flex items-start gap-3 rounded-2xl bg-info-soft px-4 py-3 text-sm">
          <Info className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
          <p>Başvurun inceleniyor. Bilgilerini güncelleyip yeniden gönderebilirsin.</p>
        </div>
      ) : null}
      <KindsPicker value={ctx.data.kinds} onChange={(kinds) => ctx.setData({ kinds })} />
    </div>
  );
}

function BasicsStep({ ctx, deleteReplaced, onUploading }: { ctx: Ctx; deleteReplaced: boolean; onUploading: (b: boolean) => void }) {
  const { data, setData } = ctx;
  const mainKind = data.kinds[0] ?? "service";
  return (
    <div className="flex flex-col gap-5">
      <Field label="İşletme adı" htmlFor="biz-name">
        <Input
          id="biz-name"
          value={data.name}
          maxLength={NAME_MAX}
          autoComplete="organization"
          autoCapitalize="words"
          placeholder="Örn. Parlak Temizlik"
          onChange={(e) => setData({ name: e.target.value })}
          className="h-12"
        />
        <CharCount value={data.name} max={NAME_MAX} />
      </Field>
      <Field label="Ne iş yapıyorsun?" htmlFor="biz-label" hint="Kısa bir kategori adı. Firmalar listesinde bu başlıkla görünürsün.">
        <Input
          id="biz-label"
          value={data.categoryLabel}
          maxLength={LABEL_MAX}
          placeholder={LABEL_PLACEHOLDER[mainKind]}
          onChange={(e) => setData({ categoryLabel: e.target.value })}
          className="h-12"
        />
      </Field>
      <Field label="Açıklama" htmlFor="biz-desc" optional hint="Kaç yıldır çalıştığını, neleri iyi yaptığını ve farkını anlat.">
        <Textarea
          id="biz-desc"
          rows={5}
          value={data.description}
          maxLength={DESC_MAX}
          placeholder="Örn. 10 yıldır Gebze'de ev ve ofis temizliği yapıyoruz. Kendi ekipmanımızla geliyoruz."
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
  const { neighbourhoods } = useNeighbourhoods();
  const selected = neighbourhoods.find((n) => String(n.id) === data.neighbourhoodId);
  const centroid = selected && typeof selected.lat === "number" && typeof selected.lng === "number" ? { lat: selected.lat, lng: selected.lng } : null;
  const isShop = data.kinds.includes("shop");
  return (
    <div className="flex flex-col gap-5">
      <Field label="İşletme telefonu" htmlFor="biz-phone" hint="İşletme sayfanda herkese açık görünür; müşteriler seni doğrudan arar. Giriş numaran hazır geldi, istersen değiştir.">
        <PhoneField id="biz-phone" value={data.phone} onChange={(phone) => setData({ phone })} />
      </Field>
      <Field label="Mahalle" htmlFor="biz-neighbourhood">
        <NeighbourhoodPicker
          id="biz-neighbourhood"
          value={data.neighbourhoodId}
          onChange={(n) => setData({ neighbourhoodId: n ? String(n.id) : null })}
          persistDefault={false}
          title="İşletmen hangi mahallede?"
        />
      </Field>
      <Field
        label="Açık adres"
        htmlFor="biz-address"
        optional={!isShop}
        hint={isShop ? "Müşterilerin dükkanını kolayca bulsun." : "Müşteriye gidiyorsan boş bırakabilirsin."}
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
          fallbackCenter={centroid}
          onNeighbourhood={(n) => ctx.setData((d) => (d.neighbourhoodId ? d : { ...d, neighbourhoodId: n.id }))}
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
        <h3 className="mb-1 text-lg font-bold">Hangi mahallelere gidiyorsun?</h3>
        <p className="mb-4 text-sm text-muted-foreground">Bu mahallelerden gelen talepler sana iletilir.</p>
        <AreaPicker value={data.areaIds} onChange={(areaIds) => setData({ areaIds })} />
      </div>
    </div>
  );
}

function PreviewRow({ icon: Icon, title, children, onEdit }: { icon: typeof Phone; title: string; children: React.ReactNode; onEdit: () => void }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3.5">
      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{title}</p>
        <div className="mt-0.5 text-muted-foreground">{children}</div>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onEdit} aria-label={`${title}: düzenle`} className="-mr-2 shrink-0 text-primary">
        <Pencil /> Düzenle
      </Button>
    </li>
  );
}

function PreviewStep({ ctx }: { ctx: Ctx }) {
  const { data, goTo } = ctx;
  const { neighbourhoods } = useNeighbourhoods();
  const categoryNames = useServiceCategoryNames();
  const neighbourhoodName = neighbourhoods.find((n) => String(n.id) === data.neighbourhoodId)?.name;
  const isService = data.kinds.includes("service");
  const allAreas = neighbourhoods.length > 0 && neighbourhoods.every((n) => data.areaIds.includes(String(n.id)));
  const phone = businessPhoneE164(data.phone);
  const categories = data.serviceCategoryIds.map((id) => categoryNames.get(id)).filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl bg-card p-4 shadow-card ring-1 ring-foreground/[0.06]">
        <div className="flex items-center gap-3">
          <BusinessLogo name={data.name || "İşletme"} url={data.logo?.url} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg leading-tight font-extrabold">{data.name.trim() || "İşletme adı"}</p>
            <p className="truncate text-sm text-muted-foreground">
              {[data.categoryLabel.trim(), neighbourhoodName ? `${neighbourhoodName} Mah.` : null].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {data.kinds.map((k) => (
            <Badge key={k} variant="secondary" className="h-6 px-2.5">
              {KIND_SHORT_LABELS[k]}
            </Badge>
          ))}
        </div>
        {data.description.trim() ? <p className="mt-3 line-clamp-4 text-sm leading-relaxed whitespace-pre-line">{data.description.trim()}</p> : null}
      </div>

      <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
        <PreviewRow icon={Info} title="İşletme türü" onEdit={() => goTo("tur")}>
          {data.kinds.map((k) => KIND_LABELS[k]).join(", ")}
        </PreviewRow>
        <PreviewRow icon={Phone} title="İletişim ve konum" onEdit={() => goTo("iletisim")}>
          <p className="tabular-nums">{phone ? formatPhoneTR(phone) : "Telefon eksik"}</p>
          <p>{[data.address.trim(), neighbourhoodName ? `${neighbourhoodName} Mah.` : null].filter(Boolean).join(", ") || "Adres eklenmedi"}</p>
          <p className="flex items-center gap-1">
            <MapPin className="size-3.5" aria-hidden />
            {data.location ? "Haritada işaretli" : "Harita konumu eklenmedi"}
          </p>
        </PreviewRow>
        {isService ? (
          <PreviewRow icon={Wrench} title="Hizmetler" onEdit={() => goTo("hizmetler")}>
            <p>{categories.length ? categories.join(", ") : `${data.serviceCategoryIds.length} hizmet`}</p>
            <p>{allAreas ? "Tüm Gebze" : `${data.areaIds.length} mahalle`}</p>
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
        Başvurun Gebzem ekibine iletilir ve genelde 1 iş günü içinde sonuçlanır. Sonucu bildirimle haber veririz.
      </p>
    </div>
  );
}

/** H1: business application wizard (7 steps; the services step appears only for service businesses). */
export function ApplyWizard({ initial, resubmit, rejectionReason }: ApplyWizardProps) {
  const router = useRouter();
  const uploads = React.useRef(0);
  const onUploading = React.useCallback((busy: boolean) => {
    uploads.current = Math.max(0, uploads.current + (busy ? 1 : -1));
  }, []);
  const waitForUploads = React.useCallback(() => (uploads.current > 0 ? "Dosya yükleniyor, lütfen birkaç saniye bekle." : null), []);

  const steps = React.useMemo<WizardStep<ApplyData>[]>(
    () => [
      {
        id: "tur",
        title: "İşletme türün ne?",
        help: "Birden fazla seçebilirsin. Seçimine göre sana uygun özellikleri açacağız.",
        validate: (d) => (d.kinds.length ? null : "En az bir işletme türü seç."),
        render: (ctx) => <TypeStep ctx={ctx} rejectionReason={rejectionReason} resubmit={resubmit} />,
      },
      {
        id: "bilgiler",
        title: "Temel bilgiler",
        help: "Müşterilerin seni bu bilgilerle tanıyacak.",
        validate: (d) => {
          const name = d.name.trim();
          if (name.length < 2) return "İşletme adını yaz (en az 2 karakter).";
          if (name.length > NAME_MAX) return `İşletme adı en fazla ${NAME_MAX} karakter olabilir.`;
          if (d.categoryLabel.trim().length < 2) return "Ne iş yaptığını kısaca yaz (örn. Ev temizliği).";
          return waitForUploads();
        },
        render: (ctx) => <BasicsStep ctx={ctx} deleteReplaced={!resubmit} onUploading={onUploading} />,
      },
      {
        id: "iletisim",
        title: "İletişim ve konum",
        help: "Seni nerede ve nasıl bulabilirler?",
        validate: (d) => {
          if (!businessPhoneE164(d.phone)) return "Geçerli bir telefon numarası yaz (örn. 5XX XXX XX XX ya da 262 XXX XX XX).";
          if (!d.neighbourhoodId) return "İşletmenin bulunduğu mahalleyi seç.";
          if (d.kinds.includes("shop") && d.address.trim().length < 5) return "Dükkanının açık adresini yaz.";
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
          if (d.areaIds.length === 0) return "Hizmet verdiğin en az bir mahalle seç (ya da Tüm Gebze).";
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
        help: "İsteğe bağlı. Vergi levhası yüklersen başvurun daha hızlı onaylanır; yoksa bu adımı geçebilirsin.",
        validate: () => waitForUploads(),
        render: (ctx) => <DocUpload value={ctx.data.document} onChange={(document) => ctx.setData({ document })} onUploadingChange={onUploading} />,
      },
      {
        id: "onizleme",
        title: "Son kontrol",
        help: "Bilgilerini gözden geçir, sonra başvurunu gönder.",
        render: (ctx) => <PreviewStep ctx={ctx} />,
      },
    ],
    [rejectionReason, resubmit, onUploading, waitForUploads],
  );

  const onComplete = async (d: ApplyData): Promise<string | void> => {
    const supabase = createClient();
    const isService = d.kinds.includes("service");
    const { data, error } = await supabase.rpc("apply_business", {
      p_name: d.name.trim(),
      p_kinds: d.kinds,
      p_phone: businessPhoneE164(d.phone) ?? undefined,
      p_category_label: d.categoryLabel.trim() || undefined,
      p_description: d.description.trim() || undefined,
      p_address: d.address.trim() || undefined,
      p_neighbourhood_id: d.neighbourhoodId ?? undefined,
      p_service_category_ids: isService ? d.serviceCategoryIds : [],
      p_service_area_ids: isService ? d.areaIds : [],
      p_working_hours: hoursToJson(d.hours),
      p_lat: d.location?.lat,
      p_lng: d.location?.lng,
      p_logo_url: d.logo?.url,
    });
    if (error) return error.message || "Başvurun gönderilemedi. Lütfen tekrar dene.";
    const result = data as { ok?: boolean; reason?: string; business_id?: string } | null;
    if (!result?.ok) {
      if (result?.reason === "already_exists") {
        toast.message(RESULT_MESSAGES.already_exists);
        router.replace(routes.business.root());
        return;
      }
      return (result?.reason && RESULT_MESSAGES[result.reason]) || "Başvurun gönderilemedi. Lütfen tekrar dene.";
    }
    if (d.document && result.business_id) {
      const { error: docError } = await supabase
        .from("business_documents")
        .insert({ business_id: result.business_id, path: d.document.path, kind: "vergi_levhasi" });
      if (docError) toast.error("Başvurun alındı ama belge kaydedilemedi. İnceleme sırasında ekibimiz seninle iletişime geçebilir.");
    }
    toast.success("Başvurun alındı");
    router.replace(routes.business.applyDone());
    router.refresh();
  };

  return (
    <Wizard<ApplyData>
      steps={steps}
      initialData={initial}
      draftKey={resubmit ? undefined : DRAFT_KEY}
      onComplete={onComplete}
      completeLabel="Başvuruyu Gönder"
      title={resubmit ? "Başvuruyu düzenle" : "İşletme başvurusu"}
      exitHref={routes.business.intro()}
    />
  );
}
