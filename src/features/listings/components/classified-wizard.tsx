"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlignLeft, Banknote, Eye, FileText, Images, LayoutGrid, MapPin, PenLine, Sparkles } from "lucide-react";
import { routes } from "@/core/routes";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NeighbourhoodPicker } from "@/components/shared/neighbourhood-picker";
import { Wizard, type WizardStep } from "@/components/wizard/wizard";
import { useAuth } from "@/lib/auth/auth-provider";
import { createClient } from "@/lib/supabase/client";
import {
  BANNED_CATEGORIES_TEXT,
  CONDITIONS,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  MAX_LISTING_PHOTOS,
  PRICE_MAX,
  TITLE_MAX,
  TITLE_MIN,
  optionLabel,
} from "../constants";
import type { AttributeField, AttributeValue, ListingCategory } from "../types";
import { categoryPath, describeAttributes, type ClassifiedViewModel } from "../view-models";
import { digitsInput, type ClassifiedDraft } from "../wizard-drafts";
import { ChoiceChips } from "./choice-chips";
import { ClassifiedMediaStep } from "./classified-media-step";
import { ClassifiedDetailView } from "./detail-views";
import { CONDITION_ICONS, attributeIcon, withOptionIcons } from "./listing-icons";
import { CategoryPicker, Field, SwitchRow, TextRiskNotice } from "./wizard-bits";

const CONDITION_OPTIONS = withOptionIcons(CONDITIONS, CONDITION_ICONS);

const EMPTY: ClassifiedDraft = {
  categoryId: null,
  images: [],
  title: "",
  price: "",
  condition: null,
  attrs: {},
  description: "",
  neighbourhoodId: null,
  neighbourhoodName: null,
  video: null,
};

/** Listing caps (DB error hints) -> Turkish text. */
const CAP_MESSAGES: Record<string, string> = {
  listing_daily_cap: "Son 24 saatte çok fazla ilan verdin. Biraz sonra tekrar dene.",
  listing_active_cap: "Açık ilan sınırına ulaştın (yayında, onay bekleyen ve durdurulmuş). Yeni ilan için eski ilanlarından birini sil ya da satıldı olarak işaretle.",
};

function schemaFor(categories: ListingCategory[], categoryId: string | null): AttributeField[] {
  const { category, parent } = categoryPath(categories, categoryId);
  const schema = category?.attributes_schema.length ? category.attributes_schema : (parent?.attributes_schema ?? []);
  // "durum" is asked with the condition chips.
  return schema.filter((f) => f.key !== "durum");
}

function hasValue(v: AttributeValue | undefined): boolean {
  return v !== undefined && v !== "";
}

function displayName(fullName: string | null | undefined): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Sen";
  const last = parts.length > 1 ? ` ${parts[parts.length - 1].charAt(0).toLocaleUpperCase("tr-TR")}.` : "";
  return `${parts[0]}${last}`;
}

function AttributeInput({ field, value, onChange }: { field: AttributeField; value: AttributeValue | undefined; onChange: (v: AttributeValue | undefined) => void }) {
  const id = `attr-${field.key}`;
  const label = field.required ? field.label : `${field.label} (isteğe bağlı)`;
  const icon = attributeIcon(field.key, field.type);
  if (field.type === "boolean") {
    return <SwitchRow id={id} label={field.label} icon={icon} checked={value === true} onCheckedChange={(c) => onChange(c ? true : undefined)} />;
  }
  if (field.type === "select") {
    return (
      <Field label={label} icon={icon}>
        <ChoiceChips
          options={(field.options ?? []).map((o) => ({ value: o.value, label: o.label }))}
          value={typeof value === "string" ? value : null}
          onChange={(v) => onChange(v ?? undefined)}
          allowDeselect={!field.required}
          ariaLabel={field.label}
          size="sm"
        />
      </Field>
    );
  }
  return (
    <Field id={id} label={label} icon={icon}>
      <Input
        id={id}
        inputMode={field.type === "number" ? "decimal" : undefined}
        value={value === undefined ? "" : String(value)}
        maxLength={80}
        onChange={(e) => {
          const v = field.type === "number" ? e.target.value.replace(/[^\d.,]/g, "") : e.target.value;
          onChange(v === "" ? undefined : v);
        }}
      />
    </Field>
  );
}

export type ClassifiedWizardProps = {
  categories: ListingCategory[];
  /** Listing id in edit mode. */
  editId: string | null;
  initial: ClassifiedDraft | null;
};

/** E6 - 2. el ilan verme / düzenleme sihirbazı. */
export function ClassifiedWizard({ categories, editId, initial }: ClassifiedWizardProps) {
  const router = useRouter();
  const { user, profile } = useAuth();
  const [uploading, setUploading] = React.useState(false);

  const initialData = React.useMemo<ClassifiedDraft>(
    () => initial ?? { ...EMPTY, neighbourhoodId: profile?.neighbourhood_id != null ? String(profile.neighbourhood_id) : null },
    // Only the first render matters (the Wizard keeps its own state and draft).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const previewModel = (d: ClassifiedDraft): ClassifiedViewModel => {
    const path = categoryPath(categories, d.categoryId);
    return {
      id: null,
      title: d.title.trim() || "Başlık",
      description: d.description.trim(),
      price: d.price ? Number(d.price) : null,
      categoryName: path.category?.name ?? "İlan",
      categoryTrail: path.trail,
      categorySlug: path.category?.slug ?? null,
      categoryIcon: path.category?.icon ?? path.parent?.icon ?? null,
      conditionLabel: optionLabel(CONDITIONS, d.condition),
      attributes: describeAttributes(schemaFor(categories, d.categoryId), d.attrs),
      neighbourhoodName: d.neighbourhoodName,
      postedAt: new Date().toISOString(),
      listingNo: null,
      images: d.images.map((i) => ({ url: i.url, thumbUrl: i.thumbUrl })),
      video: d.video ?? null,
      seller: { displayName: displayName(profile?.full_name), memberSince: null },
      business: null,
      state: "live",
    };
  };

  const steps: WizardStep<ClassifiedDraft>[] = [
    {
      id: "kategori",
      title: "Ne satıyorsun?",
      icon: LayoutGrid,
      help: BANNED_CATEGORIES_TEXT,
      validate: (d) => (d.categoryId ? null : "Bir kategori seç."),
      hideFooter: (d) => !d.categoryId,
      render: (ctx) => (
        <CategoryPicker
          categories={categories}
          value={ctx.data.categoryId}
          onChange={(id) => {
            ctx.setData((d) => ({ ...d, categoryId: id, attrs: id === d.categoryId ? d.attrs : {} }));
            void ctx.next();
          }}
        />
      ),
    },
    {
      id: "fotograflar",
      title: "Fotoğraf ekle",
      icon: Images,
      help: `En az 1, en fazla ${MAX_LISTING_PHOTOS} fotoğraf. İlk fotoğraf kapak olur; sürükleyerek sıralayabilirsin.`,
      validate: (d) => (uploading ? "Yükleme sürüyor, biraz bekle." : d.images.length ? null : "En az bir fotoğraf ekle."),
      render: (ctx) => (
        <ClassifiedMediaStep
          images={ctx.data.images}
          onImagesChange={(images) => ctx.setData({ images })}
          video={ctx.data.video ?? null}
          onVideoChange={(video) => ctx.setData({ video })}
          persistedVideoUrl={editId ? (initial?.video?.url ?? null) : null}
          onBusyChange={setUploading}
        />
      ),
    },
    {
      id: "bilgiler",
      title: "İlan bilgileri",
      icon: FileText,
      help: "Alıcıların merak edeceği her şeyi yaz. Telefon numaranı yazmana gerek yok.",
      validate: (d) => {
        const title = d.title.trim();
        if (title.length < TITLE_MIN) return `Başlık en az ${TITLE_MIN} karakter olmalı.`;
        if (!d.price) return "Fiyat gir.";
        if (Number(d.price) > PRICE_MAX) return "Fiyat çok yüksek görünüyor.";
        if (!d.condition) return "Ürünün durumunu seç.";
        for (const f of schemaFor(categories, d.categoryId)) {
          if (f.required && !hasValue(d.attrs[f.key])) return `${f.label} bilgisini gir.`;
        }
        if (d.description.trim().length < DESCRIPTION_MIN) return `Açıklama en az ${DESCRIPTION_MIN} karakter olmalı.`;
        return null;
      },
      render: (ctx) => {
        const d = ctx.data;
        const schema = schemaFor(categories, d.categoryId);
        return (
          <div className="flex flex-col gap-5">
            <Field id="ilan-baslik" label="Başlık" icon={PenLine} hint={`${d.title.length}/${TITLE_MAX}`}>
              <Input id="ilan-baslik" value={d.title} maxLength={TITLE_MAX} placeholder="Örn. Az kullanılmış çocuk bisikleti" onChange={(e) => ctx.setData({ title: e.target.value })} />
            </Field>
            <Field id="ilan-fiyat" label="Fiyat" icon={Banknote}>
              <div className="relative">
                <Input
                  id="ilan-fiyat"
                  inputMode="numeric"
                  value={d.price ? Number(d.price).toLocaleString("tr-TR") : ""}
                  placeholder="0"
                  className="pr-12 tabular-nums"
                  onChange={(e) => ctx.setData({ price: digitsInput(e.target.value) })}
                />
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-semibold text-muted-foreground">TL</span>
              </div>
            </Field>
            <Field label="Durumu" icon={Sparkles}>
              <ChoiceChips options={CONDITION_OPTIONS} value={d.condition} onChange={(v) => ctx.setData({ condition: v })} ariaLabel="Ürünün durumu" size="sm" />
            </Field>
            {schema.map((f) => (
              <AttributeInput
                key={f.key}
                field={f}
                value={d.attrs[f.key]}
                onChange={(v) =>
                  ctx.setData((cur) => {
                    const attrs = { ...cur.attrs };
                    if (v === undefined) delete attrs[f.key];
                    else attrs[f.key] = v;
                    return { ...cur, attrs };
                  })
                }
              />
            ))}
            <Field id="ilan-aciklama" label="Açıklama" icon={AlignLeft} hint={`${d.description.length}/${DESCRIPTION_MAX}`}>
              <Textarea
                id="ilan-aciklama"
                value={d.description}
                maxLength={DESCRIPTION_MAX}
                rows={6}
                placeholder="Ürünün durumu, kullanım süresi, varsa kusurları, teslim şekli..."
                onChange={(e) => ctx.setData({ description: e.target.value })}
              />
            </Field>
            <TextRiskNotice texts={[d.title, d.description]} />
          </div>
        );
      },
    },
    {
      id: "konum",
      title: "İlan nerede?",
      icon: MapPin,
      help: "İlanda sadece mahalle görünür; açık adresin paylaşılmaz.",
      validate: (d) => (d.neighbourhoodId ? null : "Mahalle seç."),
      render: (ctx) => (
        <NeighbourhoodPicker
          value={ctx.data.neighbourhoodId}
          onChange={(n) => ctx.setData({ neighbourhoodId: n ? String(n.id) : null, neighbourhoodName: n?.name ?? null })}
          persistDefault={false}
          showUseLocation
        />
      ),
    },
    {
      id: "onizleme",
      title: "Önizleme",
      icon: Eye,
      help: "İlanın böyle görünecek. Her şey doğruysa yayınla.",
      render: (ctx) => (
        <div className="-mx-4 overflow-hidden rounded-3xl">
          <ClassifiedDetailView model={previewModel(ctx.data)} preview />
        </div>
      ),
    },
  ];

  const onComplete = async (d: ClassifiedDraft): Promise<string | void> => {
    if (!user) return "Oturumun kapanmış. Lütfen tekrar giriş yap.";
    if (!d.categoryId) return "Bir kategori seç.";
    const supabase = createClient();
    const attributes: Record<string, AttributeValue> = {};
    for (const f of schemaFor(categories, d.categoryId)) {
      const v = d.attrs[f.key];
      if (hasValue(v)) attributes[f.key] = v as AttributeValue;
    }
    if (d.condition) attributes.durum = d.condition;
    const payload = {
      category_id: d.categoryId,
      title: d.title.trim(),
      description: d.description.trim(),
      price_try: Number(d.price),
      attributes,
      neighbourhood_id: d.neighbourhoodId,
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
        .insert({ ...payload, type: "classified", owner_id: user.id })
        .select("id,status")
        .single();
      if (error) return (error.hint && CAP_MESSAGES[error.hint]) || error.message;
      id = data.id;
      status = data.status;
    }
    if (!id) return "İlan kaydedilemedi. Lütfen tekrar dene.";
    if (editId || d.images.length) {
      // One transaction (set_listing_media): a failed save keeps the old photos.
      const { error } = await supabase.rpc("set_listing_media", {
        p_listing_id: id,
        p_media: d.images.map((img) => ({ url: img.url, thumb_url: img.thumbUrl || null })),
      });
      if (error) return `İlan kaydedildi ama fotoğraflar ${editId ? "güncellenemedi" : "eklenemedi"}: ${error.message}`;
    }
    // Video (set_listing_video): only when it changed; the replaced file is queued for deletion by the DB.
    const video = d.video ?? null;
    if ((video?.url ?? null) !== (editId ? (initial?.video?.url ?? null) : null)) {
      const { error } = await supabase.rpc("set_listing_video", {
        p_listing_id: id,
        p_video: video
          ? { url: video.url, poster_url: video.posterUrl, duration_s: video.durationS, width: video.width ?? null, height: video.height ?? null }
          : null,
      });
      if (error) return `İlan kaydedildi ama video ${video ? "eklenemedi" : "kaldırılamadı"}: ${error.message}`;
    }
    router.push(routes.listings.postDone({ id, tur: "ikinci-el", durum: status ?? undefined }));
  };

  return (
    <Wizard<ClassifiedDraft>
      steps={steps}
      initialData={initialData}
      draftKey={editId ? `ilan-duzenle-${editId}` : "ilan-ikinci-el"}
      onComplete={onComplete}
      completeLabel={editId ? "Kaydet" : "Yayınla"}
      title={editId ? "İlanı düzenle" : "2. el ilan ver"}
      exitHref={editId ? routes.profile.listings() : routes.listings.classifieds()}
    />
  );
}
