"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, ExternalLink, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { LatLng } from "@/core/geo";
import { routes } from "@/core/routes";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FilterChip } from "@/components/shared/explore-header";
import { refreshMyBusinessPages } from "../actions";
import { hoursToJson, validateHours, type WorkingHours } from "../lib/hours";
import { normalizeInstagram, normalizeUrl } from "../lib/form-utils";
import { BUSINESS_VERTICALS, PRICE_LEVELS, VERTICAL_INFO, amenitiesFor, hasMenu, type Vertical } from "../lib/verticals";
import { AreaPicker } from "./editor/area-picker";
import { CategoryPicker } from "./editor/category-picker";
import { CharCount, Field } from "./editor/field";
import { HoursEditor } from "./editor/hours-editor";
import { BusinessImagePicker, type PickedImage } from "./editor/image-picker";
import { LocationPicker } from "./editor/location-picker";
import { PhoneField, businessPhoneE164 } from "./editor/phone-field";

export type BusinessEditData = {
  id: string;
  slug: string;
  isService: boolean;
  name: string;
  vertical: Vertical;
  categoryLabel: string;
  description: string;
  logo: PickedImage | null;
  phone: string;
  website: string;
  instagram: string;
  address: string;
  location: LatLng | null;
  neighbourhoodId: string | null;
  priceLevel: number | null;
  starRating: number | null;
  amenities: string[];
  hours: WorkingHours;
  categoryIds: string[];
  areaIds: string[];
};

const DESC_MAX = 2000;

function Card({ title, text, children }: { title: string; text?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-card p-4 shadow-soft ring-1 ring-foreground/[0.05]">
      <h2 className="text-base font-semibold">{title}</h2>
      {text ? <p className="mt-0.5 text-sm text-muted-foreground">{text}</p> : null}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

const ALWAYS_OPEN: WorkingHours = {
  mon: { open: "00:00", close: "23:59" },
  tue: { open: "00:00", close: "23:59" },
  wed: { open: "00:00", close: "23:59" },
  thu: { open: "00:00", close: "23:59" },
  fri: { open: "00:00", close: "23:59" },
  sat: { open: "00:00", close: "23:59" },
  sun: { open: "00:00", close: "23:59" },
};

/** /isletme/duzenle: the owner edits every public field of the business page. */
export function BusinessEditForm({ initial }: { initial: BusinessEditData }) {
  const router = useRouter();
  const [d, setD] = React.useState(initial);
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const set = <K extends keyof BusinessEditData>(key: K, value: BusinessEditData[K]) => setD((s) => ({ ...s, [key]: value }));

  const amenityOptions = amenitiesFor(d.vertical);
  const toggleAmenity = (key: string) => set("amenities", d.amenities.includes(key) ? d.amenities.filter((a) => a !== key) : [...d.amenities, key]);

  const save = async () => {
    const name = d.name.trim();
    if (name.length < 2 || name.length > 80) return toast.error("İşletme adı 2-80 karakter olmalı.");
    if (d.description.length > DESC_MAX) return toast.error(`Açıklama en fazla ${DESC_MAX} karakter olabilir.`);
    const phone = d.phone.trim() ? businessPhoneE164(d.phone) : null;
    if (d.phone.trim() && !phone) return toast.error("Telefon numarası geçersiz.");
    const website = normalizeUrl(d.website, 200);
    if (website === undefined) return toast.error("Web sitesi adresi geçersiz.");
    const instagram = normalizeInstagram(d.instagram);
    if (instagram === undefined) return toast.error("Instagram kullanıcı adı geçersiz.");
    const hoursError = validateHours(d.hours);
    if (hoursError) return toast.error(hoursError);

    setSaving(true);
    const supabase = createClient();
    const allowed = new Set(amenityOptions.map((a) => a.key));
    const { error } = await supabase
      .from("businesses")
      .update({
        name,
        vertical: d.vertical,
        category_label: d.categoryLabel.trim() || null,
        description: d.description.trim() || null,
        logo_url: d.logo?.url ?? null,
        phone,
        website,
        instagram,
        address: d.address.trim() || null,
        location: d.location ? `SRID=4326;POINT(${d.location.lng} ${d.location.lat})` : null,
        neighbourhood_id: d.neighbourhoodId,
        price_level: d.vertical === "otel" ? null : d.priceLevel,
        star_rating: d.vertical === "otel" ? d.starRating : null,
        amenities: d.amenities.filter((a) => allowed.has(a)),
        working_hours: hoursToJson(d.hours),
      })
      .eq("id", d.id);
    if (error) {
      setSaving(false);
      toast.error("Kaydedilemedi. Bilgileri kontrol edip tekrar dene.");
      return;
    }
    if (d.isService) {
      const [c, a] = await Promise.all([
        supabase.from("business_service_categories").delete().eq("business_id", d.id),
        supabase.from("business_service_areas").delete().eq("business_id", d.id),
      ]);
      const inserts = await Promise.all([
        !c.error && d.categoryIds.length
          ? supabase.from("business_service_categories").insert(d.categoryIds.map((category_id) => ({ business_id: d.id, category_id })))
          : Promise.resolve({ error: c.error }),
        !a.error && d.areaIds.length
          ? supabase.from("business_service_areas").insert(d.areaIds.map((neighbourhood_id) => ({ business_id: d.id, neighbourhood_id })))
          : Promise.resolve({ error: a.error }),
      ]);
      if (inserts.some((r) => r.error)) toast.error("Hizmet kategorileri ya da bölgeler kaydedilemedi.");
    }
    await refreshMyBusinessPages().catch(() => undefined);
    setSaving(false);
    toast.success("İşletme sayfan güncellendi");
    router.refresh();
  };

  return (
    <>
      <div className="flex flex-col gap-4 px-4 pt-4 pb-36">
        <Card title="İşletme türü" text="Hangi listede görüneceğini ve sayfanda hangi bölümlerin olacağını belirler.">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="İşletme türü">
            {BUSINESS_VERTICALS.map((v) => {
              const info = VERTICAL_INFO[v];
              const active = d.vertical === v;
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => set("vertical", v)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-2xl p-2.5 text-left text-sm font-semibold ring-1 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    active ? "bg-foreground text-background ring-foreground" : "bg-background ring-foreground/10 hover:bg-muted",
                  )}
                >
                  <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", active ? "bg-background/15" : info.tone)}>
                    <info.icon className="size-5" aria-hidden />
                  </span>
                  {info.label}
                </button>
              );
            })}
          </div>
          {hasMenu(d.vertical) ? <p className="text-xs text-muted-foreground">Bu türde işletme panelinden menü ve QR menü oluşturabilirsin.</p> : null}
          {d.vertical === "otel" ? <p className="text-xs text-muted-foreground">Otellerde işletme panelinden oda ekleyip fiyatlarını girebilirsin.</p> : null}
        </Card>

        <Card title="Temel bilgiler">
          <BusinessImagePicker value={d.logo} onChange={(v) => set("logo", v)} onUploadingChange={setUploading} deleteReplaced />
          <Field label="İşletme adı" htmlFor="ad">
            <Input id="ad" value={d.name} maxLength={80} onChange={(e) => set("name", e.target.value)} autoComplete="organization" />
          </Field>
          <Field label="Kısa tanım" htmlFor="kategori" optional hint="Kartlarda adın üstünde görünür. Örnek: Balık restoranı, Üçüncü dalga kahve.">
            <Input id="kategori" value={d.categoryLabel} maxLength={60} onChange={(e) => set("categoryLabel", e.target.value)} />
          </Field>
          <Field label="Hakkında" htmlFor="aciklama" optional>
            <Textarea
              id="aciklama"
              rows={5}
              value={d.description}
              maxLength={DESC_MAX}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Ne sunuyorsun, seni farklı kılan ne?"
            />
            <CharCount value={d.description} max={DESC_MAX} />
          </Field>
        </Card>

        {d.vertical === "otel" ? (
          <Card title="Yıldız" text="Otelinin resmi yıldız sayısı.">
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <FilterChip key={n} active={d.starRating === n} onClick={() => set("starRating", d.starRating === n ? null : n)} icon={Star}>
                  {n} yıldız
                </FilterChip>
              ))}
            </div>
          </Card>
        ) : (
          <Card title="Fiyat seviyesi" text="Müşterilerin bütçesine göre seçim yapmasına yardım eder.">
            <div className="flex flex-wrap gap-2">
              {([1, 2, 3, 4] as const).map((n) => (
                <FilterChip key={n} active={d.priceLevel === n} onClick={() => set("priceLevel", d.priceLevel === n ? null : n)}>
                  {PRICE_LEVELS[n].symbol} {PRICE_LEVELS[n].label}
                </FilterChip>
              ))}
            </div>
          </Card>
        )}

        {amenityOptions.length ? (
          <Card title="Olanaklar" text="Sayfanda ve listelerde filtre olarak görünür.">
            <div className="flex flex-wrap gap-2">
              {amenityOptions.map((a) => (
                <FilterChip key={a.key} active={d.amenities.includes(a.key)} onClick={() => toggleAmenity(a.key)} icon={a.icon}>
                  {a.label}
                </FilterChip>
              ))}
            </div>
          </Card>
        ) : null}

        <Card title="İletişim">
          <Field label="Telefon" htmlFor="telefon" hint="Müşteriler bu numarayı arar. Mesajlaşma yok, sadece arama.">
            <PhoneField id="telefon" value={d.phone} onChange={(v) => set("phone", v)} />
          </Field>
          <Field label="Web sitesi" htmlFor="web" optional>
            <Input id="web" inputMode="url" value={d.website} maxLength={200} onChange={(e) => set("website", e.target.value)} placeholder="ornek.com" />
          </Field>
          <Field label="Instagram" htmlFor="instagram" optional>
            <Input id="instagram" value={d.instagram} maxLength={60} onChange={(e) => set("instagram", e.target.value)} placeholder="@kullaniciadi" />
          </Field>
        </Card>

        <Card title="Konum" text="Haritada ve yol tarifinde kullanılır.">
          <Field label="Adres" htmlFor="adres" optional>
            <Input id="adres" value={d.address} maxLength={200} onChange={(e) => set("address", e.target.value)} />
          </Field>
          <LocationPicker value={d.location} onChange={(v) => set("location", v)} onNeighbourhood={(n) => set("neighbourhoodId", n.id)} />
        </Card>

        <Card title="Çalışma saatleri">
          {d.vertical === "otel" ? (
            <Button type="button" variant="outline" onClick={() => set("hours", ALWAYS_OPEN)}>
              <Clock /> 7/24 açık yap
            </Button>
          ) : null}
          <HoursEditor value={d.hours} onChange={(v) => set("hours", v)} />
        </Card>

        {d.isService ? (
          <>
            <Card title="Hizmet kategorileri" text="Bu kategorilerdeki talepler sana gelir.">
              <CategoryPicker value={d.categoryIds} onChange={(v) => set("categoryIds", v)} />
            </Card>
            <Card title="Hizmet verdiğin mahalleler">
              <AreaPicker value={d.areaIds} onChange={(v) => set("areaIds", v)} />
            </Card>
          </>
        ) : null}

        <Link href={routes.businesses.detail(d.slug)} className="inline-flex items-center justify-center gap-1.5 py-2 text-sm font-semibold text-primary">
          İşletme sayfamı gör <ExternalLink className="size-4" aria-hidden />
        </Link>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-2xl border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] backdrop-blur-md">
        <Button size="lg" className="w-full" onClick={save} disabled={saving || uploading}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Değişiklikleri kaydet
        </Button>
      </div>
    </>
  );
}
