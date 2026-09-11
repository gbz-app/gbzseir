"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { routes, type BusinessEditStep } from "@/core/routes";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { BottomDock } from "@/components/shared/bottom-dock";
import { refreshMyBusinessPages } from "../../actions";
import { normalizeInstagram, normalizeUrl } from "../../lib/form-utils";
import { hoursToJson, validateHours } from "../../lib/hours";
import { AMENITIES, amenitiesFor, type AmenityDef, type AmenityOption } from "../../lib/verticals";
import type { PickedImage } from "../editor/image-picker";
import { businessPhoneE164 } from "../editor/phone-field";
import { BasicsSection, ContactSection, FeaturesSection, HoursSection, LocationSection, ServiceScopeSection, type EditSet } from "./sections";
import { DESC_MAX, type BusinessEditData } from "./steps";

type BusinessPatch = Database["public"]["Tables"]["businesses"]["Update"];

const SAVED: Record<BusinessEditStep, string> = {
  temel: "Temel bilgiler kaydedildi",
  iletisim: "İletişim bilgileri kaydedildi",
  konum: "Konum kaydedildi",
  saatler: "Çalışma saatleri kaydedildi",
  ozellikler: "Özellikler kaydedildi",
  "hizmet-alani": "Hizmet alanın kaydedildi",
};

/**
 * Validates the fields of one step and builds its partial update (same checks as the former single form).
 * A string is a Turkish error; null means the step writes no businesses columns.
 */
function buildPatch(step: BusinessEditStep, d: BusinessEditData, amenityOptions: readonly AmenityOption[], amenities: readonly AmenityDef[]): BusinessPatch | string | null {
  switch (step) {
    case "temel": {
      const name = d.name.trim();
      if (name.length < 2 || name.length > 80) return "İşletme adı 2-80 karakter olmalı.";
      if (d.description.length > DESC_MAX) return `Açıklama en fazla ${DESC_MAX} karakter olabilir.`;
      return { name, category_label: d.categoryLabel.trim() || null, description: d.description.trim() || null };
    }
    case "iletisim": {
      const phone = d.phone.trim() ? businessPhoneE164(d.phone) : null;
      if (d.phone.trim() && !phone) return "Telefon numarası geçersiz.";
      const website = normalizeUrl(d.website, 200);
      if (website === undefined) return "Web sitesi adresi geçersiz.";
      const instagram = normalizeInstagram(d.instagram);
      if (instagram === undefined) return "Instagram kullanıcı adı geçersiz.";
      return { phone, website, instagram };
    }
    case "konum":
      return {
        address: d.address.trim() || null,
        location: d.location ? `SRID=4326;POINT(${d.location.lng} ${d.location.lat})` : null,
        neighbourhood_id: d.neighbourhoodId,
      };
    case "saatler": {
      const hoursError = validateHours(d.hours);
      if (hoursError) return hoursError;
      return { working_hours: hoursToJson(d.hours) };
    }
    case "ozellikler": {
      // Amenities of another type are dropped; keys the admin turned off (or a list that could not be read) are kept.
      const offered = new Set(amenityOptions.map((a) => a.key));
      const known = new Set(amenities.filter((a) => a.active).map((a) => a.key));
      return {
        price_level: d.vertical === "otel" ? null : d.priceLevel,
        star_rating: d.vertical === "otel" ? d.starRating : null,
        amenities: d.amenities.filter((a) => offered.has(a) || !known.has(a)),
      };
    }
    case "hizmet-alani":
      return null;
  }
}

/**
 * /isletme/duzenle/<adim>: one section of the business page with a full-width "Kaydet". Saving updates only this
 * section's columns (same RLS + trigger path as before), then goes back to the hub. The type is never sent.
 * `amenities`: public.amenities of scope business (vocabularies.ts); the built-in list when omitted.
 */
export function EditStepForm({ step, initial, amenities = AMENITIES }: { step: BusinessEditStep; initial: BusinessEditData; amenities?: readonly AmenityDef[] }) {
  const router = useRouter();
  const [d, setD] = React.useState(initial);
  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const set: EditSet = (key, value) => setD((s) => ({ ...s, [key]: value }));
  const amenityOptions = amenitiesFor(d.vertical, amenities);

  // The picker deletes the replaced file from storage right away, so the new logo is saved right away too.
  const saveLogo = async (next: PickedImage | null) => {
    set("logo", next);
    const { error } = await createClient()
      .from("businesses")
      .update({ logo_url: next?.url ?? null })
      .eq("id", d.id);
    if (error) {
      toast.error("Logo kaydedilemedi. Tekrar dene.");
      return;
    }
    await refreshMyBusinessPages().catch(() => undefined);
    toast.success(next ? "Logo güncellendi" : "Logo kaldırıldı");
  };

  const save = async () => {
    if (saving || uploading) return;
    const patch = buildPatch(step, d, amenityOptions, amenities);
    if (typeof patch === "string") {
      toast.error(patch);
      return;
    }
    setSaving(true);
    const supabase = createClient();
    if (patch) {
      const { error } = await supabase.from("businesses").update(patch).eq("id", d.id);
      if (error) {
        setSaving(false);
        toast.error("Kaydedilemedi. Bilgileri kontrol edip tekrar dene.");
        return;
      }
    }
    if (step === "hizmet-alani") {
      // One transaction (set_business_service_scope): a failed save keeps the old categories and areas.
      const { error } = await supabase.rpc("set_business_service_scope", {
        p_business_id: d.id,
        p_category_ids: d.categoryIds,
        p_neighbourhood_ids: d.areaIds,
      });
      if (error) {
        setSaving(false);
        toast.error("Hizmet kategorileri ya da bölgeler kaydedilemedi.");
        return;
      }
    }
    await refreshMyBusinessPages().catch(() => undefined);
    toast.success(SAVED[step]);
    // replace, not back(): the hub is rendered fresh with the new statuses.
    router.replace(routes.business.edit());
  };

  return (
    <>
      <div className="flex flex-col gap-4 px-4 pt-4 pb-36">
        {step === "temel" ? <BasicsSection d={d} set={set} onLogoChange={saveLogo} onUploadingChange={setUploading} /> : null}
        {step === "iletisim" ? <ContactSection d={d} set={set} /> : null}
        {step === "konum" ? <LocationSection d={d} set={set} /> : null}
        {step === "saatler" ? <HoursSection d={d} set={set} /> : null}
        {step === "ozellikler" ? <FeaturesSection d={d} set={set} amenityOptions={amenityOptions} /> : null}
        {step === "hizmet-alani" ? <ServiceScopeSection d={d} set={set} /> : null}
      </div>

      <BottomDock>
        <Button size="lg" className="w-full bg-foreground text-background shadow-none hover:bg-foreground/90" onClick={save} disabled={saving || uploading}>
          {saving ? <Loader2 className="animate-spin" /> : null}
          Kaydet
        </Button>
      </BottomDock>
    </>
  );
}
