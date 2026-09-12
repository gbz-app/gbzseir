"use client";

import * as React from "react";
import Link from "next/link";
import { Clock, Lock, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DistrictPicker } from "@/components/shared/district-picker";
import { FilterChip } from "@/components/shared/explore-header";
import { districtBySlug } from "@/config/districts";
import type { WorkingHours } from "../../lib/hours";
import { PRICE_LEVELS, VERTICAL_INFO, type AmenityOption } from "../../lib/verticals";
import { AreaPicker } from "../editor/area-picker";
import { CategoryPicker } from "../editor/category-picker";
import { CharCount, Field } from "../editor/field";
import { HoursEditor } from "../editor/hours-editor";
import { BusinessImagePicker, type PickedImage } from "../editor/image-picker";
import { LocationPicker } from "../editor/location-picker";
import { PhoneField } from "../editor/phone-field";
import { DESC_MAX, type BusinessEditData } from "./steps";

export type EditSet = <K extends keyof BusinessEditData>(key: K, value: BusinessEditData[K]) => void;
type SectionProps = { d: BusinessEditData; set: EditSet };

/** White section card (no border, no shadow). `id` is a deep-link target below the sticky header. */
export function EditCard({ id, title, text, children }: { id?: string; title?: string; text?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-3xl bg-card p-4">
      {title ? <h2 className="text-base font-semibold">{title}</h2> : null}
      {text ? <p className="mt-0.5 text-sm text-muted-foreground">{text}</p> : null}
      <div className={cn("flex flex-col gap-4", (title || text) && "mt-4")}>{children}</div>
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

/** Temel bilgiler: logo (saved at once), name, short label, about text and the locked type. */
export function BasicsSection({
  d,
  set,
  onLogoChange,
  onUploadingChange,
}: SectionProps & { onLogoChange: (value: PickedImage | null) => void; onUploadingChange: (uploading: boolean) => void }) {
  const info = VERTICAL_INFO[d.vertical];
  return (
    <>
      <EditCard>
        <BusinessImagePicker
          id="logo"
          value={d.logo}
          onChange={onLogoChange}
          onUploadingChange={onUploadingChange}
          hint="Kare, sade bir logo en iyi görünür. Seçince hemen kaydedilir."
          deleteReplaced
        />
        <Field label="İşletme adı" htmlFor="ad">
          <Input id="ad" value={d.name} maxLength={80} onChange={(e) => set("name", e.target.value)} autoComplete="organization" />
        </Field>
        <Field label="Kısa tanım" htmlFor="kategori" optional hint="Kartlarda adın üstünde görünür.">
          <Input id="kategori" value={d.categoryLabel} maxLength={60} onChange={(e) => set("categoryLabel", e.target.value)} />
        </Field>
      </EditCard>

      <EditCard id="hakkinda">
        <Field label="Hakkında" htmlFor="aciklama" optional>
          <Textarea
            id="aciklama"
            rows={6}
            value={d.description}
            maxLength={DESC_MAX}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Ne sunuyorsun, seni farklı kılan ne?"
          />
          <CharCount value={d.description} max={DESC_MAX} />
        </Field>
      </EditCard>

      <EditCard>
        <div className="flex items-center gap-3">
          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", info.tone)}>
            <info.icon className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted-foreground">İşletme türü</span>
            <span className="block text-[15px] font-semibold">{info.label}</span>
          </span>
          <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          İşletme türü değiştirilemez. Değişiklik için{" "}
          <Link href={routes.content.help("isletme")} className="font-semibold text-primary underline-offset-4 hover:underline">
            destek ekibine yaz
          </Link>
          .
        </p>
      </EditCard>
    </>
  );
}

export function ContactSection({ d, set }: SectionProps) {
  return (
    <EditCard>
      <Field label="Telefon" htmlFor="telefon" hint="Müşteriler bu numarayı arar. Mesajlaşma yok, sadece arama.">
        <PhoneField id="telefon" value={d.phone} onChange={(v) => set("phone", v)} />
      </Field>
      <Field label="Web sitesi" htmlFor="web" optional>
        <Input id="web" inputMode="url" value={d.website} maxLength={200} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
      </Field>
      <Field label="Instagram" htmlFor="instagram" optional>
        <Input id="instagram" value={d.instagram} maxLength={60} onChange={(e) => set("instagram", e.target.value)} placeholder="@kullaniciadi" />
      </Field>
    </EditCard>
  );
}

export function LocationSection({ d, set }: SectionProps) {
  return (
    <EditCard text="Haritada ve yol tarifinde kullanılır. Pini koyunca ilçen de seçilir.">
      <Field label="İlçe" htmlFor="ilce">
        <DistrictPicker id="ilce" value={d.districtId} onChange={(x) => set("districtId", x?.slug ?? null)} title="İşletmen hangi ilçede?" />
      </Field>
      <Field label="Adres" htmlFor="adres" optional>
        <Input id="adres" value={d.address} maxLength={200} onChange={(e) => set("address", e.target.value)} />
      </Field>
      <LocationPicker
        value={d.location}
        onChange={(v) => set("location", v)}
        fallbackCenter={districtBySlug(d.districtId)?.center ?? null}
        onDistrict={(x) => set("districtId", x.slug)}
      />
    </EditCard>
  );
}

export function HoursSection({ d, set }: SectionProps) {
  return (
    <div className="flex flex-col gap-3">
      {d.vertical === "otel" ? (
        <Button type="button" variant="outline" className="self-start" onClick={() => set("hours", ALWAYS_OPEN)}>
          <Clock /> 7/24 açık yap
        </Button>
      ) : null}
      <HoursEditor value={d.hours} onChange={(v) => set("hours", v)} />
    </div>
  );
}

export function FeaturesSection({ d, set, amenityOptions }: SectionProps & { amenityOptions: readonly AmenityOption[] }) {
  const toggleAmenity = (key: string) => set("amenities", d.amenities.includes(key) ? d.amenities.filter((a) => a !== key) : [...d.amenities, key]);
  return (
    <>
      {d.vertical === "otel" ? (
        <EditCard title="Yıldız" text="Otelinin resmi yıldız sayısı.">
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <FilterChip key={n} active={d.starRating === n} onClick={() => set("starRating", d.starRating === n ? null : n)} icon={Star}>
                {n} yıldız
              </FilterChip>
            ))}
          </div>
        </EditCard>
      ) : (
        <EditCard title="Fiyat seviyesi" text="Müşterilerin bütçesine göre seçim yapmasına yardım eder.">
          <div className="flex flex-wrap gap-2">
            {([1, 2, 3, 4] as const).map((n) => (
              <FilterChip key={n} active={d.priceLevel === n} onClick={() => set("priceLevel", d.priceLevel === n ? null : n)}>
                {PRICE_LEVELS[n].label}
              </FilterChip>
            ))}
          </div>
        </EditCard>
      )}

      {amenityOptions.length ? (
        <EditCard title="Olanaklar" text="Sayfanda ve listelerde filtre olarak görünür.">
          <div className="flex flex-wrap gap-2">
            {amenityOptions.map((a) => (
              <FilterChip key={a.key} active={d.amenities.includes(a.key)} onClick={() => toggleAmenity(a.key)} icon={a.icon}>
                {a.label}
              </FilterChip>
            ))}
          </div>
        </EditCard>
      ) : null}
    </>
  );
}

export function ServiceScopeSection({ d, set }: SectionProps) {
  return (
    <>
      <EditCard title="Hizmet kategorileri" text="Bu kategorilerdeki talepler sana gelir.">
        <CategoryPicker value={d.categoryIds} onChange={(v) => set("categoryIds", v)} />
      </EditCard>
      <EditCard id="bolgeler" title="Hizmet verdiğin ilçeler" text="Seçtiğin ilçelerdeki talepler önce sana gelir. Yakın ilçelerden de talep gelebilir.">
        <AreaPicker value={d.serviceDistrictIds} onChange={(v) => set("serviceDistrictIds", v)} />
      </EditCard>
    </>
  );
}
