"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { routes } from "@/core/routes";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader } from "@/components/shared/image-uploader";
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
import { ClassifiedDetailView } from "./detail-views";
import { CategoryPicker, Field, TextRiskNotice } from "./wizard-bits";

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
  if (field.type === "boolean") {
    return (
      <label htmlFor={id} className="flex min-h-12 items-center justify-between gap-3 rounded-xl border bg-card px-4">
        <span className="text-[15px] font-medium">{field.label}</span>
        <Switch id={id} checked={value === true} onCheckedChange={(c) => onChange(c ? true : undefined)} />
      </label>
    );
  }
  if (field.type === "select") {
    return (
      <Field label={label}>
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
    <Field id={id} label={label}>
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
      seller: { displayName: displayName(profile?.full_name), memberSince: null },
      business: null,
      state: "live",
    };
  };

  const steps: WizardStep<ClassifiedDraft>[] = [
    {
      id: "kategori",
      title: "Ne satıyorsun?",
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
      help: `En az 1, en fazla ${MAX_LISTING_PHOTOS} fotoğraf. İlk fotoğraf kapak olur; sürükleyerek sıralayabilirsin.`,
      validate: (d) => (uploading ? "Fotoğraflar yükleniyor, biraz bekle." : d.images.length ? null : "En az bir fotoğraf ekle."),
      render: (ctx) => (
        <ImageUploader
          value={ctx.data.images}
          onChange={(images) => ctx.setData({ images })}
          max={MAX_LISTING_PHOTOS}
          folder="listings"
          onUploadingChange={setUploading}
        />
      ),
    },
    {
      id: "bilgiler",
      title: "İlan bilgileri",
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
            <Field id="ilan-baslik" label="Başlık" hint={`${d.title.length}/${TITLE_MAX}`}>
              <Input id="ilan-baslik" value={d.title} maxLength={TITLE_MAX} placeholder="Örn. Az kullanılmış çocuk bisikleti" onChange={(e) => ctx.setData({ title: e.target.value })} />
            </Field>
            <Field id="ilan-fiyat" label="Fiyat">
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
            <Field label="Durumu">
              <ChoiceChips options={CONDITIONS} value={d.condition} onChange={(v) => ctx.setData({ condition: v })} ariaLabel="Ürünün durumu" size="sm" />
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
            <Field id="ilan-aciklama" label="Açıklama" hint={`${d.description.length}/${DESCRIPTION_MAX}`}>
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
      help: "İlanın böyle görünecek. Her şey doğruysa yayınla.",
      render: (ctx) => (
        <div className="-mx-4 overflow-hidden rounded-3xl ring-1 ring-foreground/[0.06]">
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
      const del = await supabase.from("listing_media").delete().eq("listing_id", editId);
      if (del.error) return `İlan kaydedildi ama fotoğraflar güncellenemedi: ${del.error.message}`;
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
    if (d.images.length) {
      const media = d.images.map((img, i) => ({ listing_id: id as string, url: img.url, thumb_url: img.thumbUrl, sort: i }));
      const { error } = await supabase.from("listing_media").insert(media);
      if (error) return `İlan kaydedildi ama fotoğraflar eklenemedi: ${error.message}`;
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
      exitHref={editId ? routes.profile.listings() : routes.listings.post()}
    />
  );
}
