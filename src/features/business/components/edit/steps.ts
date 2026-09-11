/**
 * Business page editor: /isletme/duzenle is a hub, each section is its own screen at /isletme/duzenle/<adim> and saves
 * only its own columns. Pure TS + lucide icons (server and client safe).
 */
import { Clock, FileText, MapPin, MapPinned, Phone, Sparkles, type LucideIcon } from "lucide-react";
import type { LatLng } from "@/core/geo";
import type { BusinessEditStep } from "@/core/routes";
import type { WorkingHours } from "../../lib/hours";
import type { Vertical } from "../../lib/verticals";
import type { PickedImage } from "../editor/image-picker";

export type BusinessEditData = {
  id: string;
  slug: string;
  /** kinds contains "service": the service categories and areas step exists. */
  isService: boolean;
  name: string;
  /** Read-only: the type is locked after the application. */
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

export const DESC_MAX = 2000;

export const EDIT_STEP_IDS: readonly BusinessEditStep[] = ["temel", "iletisim", "konum", "saatler", "ozellikler", "hizmet-alani"];

export function parseEditStep(value: unknown): BusinessEditStep | null {
  return typeof value === "string" && (EDIT_STEP_IDS as readonly string[]).includes(value) ? (value as BusinessEditStep) : null;
}

export const EDIT_STEP_ICONS: Record<BusinessEditStep, LucideIcon> = {
  temel: FileText,
  iletisim: Phone,
  konum: MapPin,
  saatler: Clock,
  ozellikler: Sparkles,
  "hizmet-alani": MapPinned,
};

export function editStepTitle(step: BusinessEditStep, vertical: Vertical): string {
  switch (step) {
    case "temel":
      return "Temel bilgiler";
    case "iletisim":
      return "İletişim";
    case "konum":
      return "Konum";
    case "saatler":
      return "Çalışma saatleri";
    case "ozellikler":
      return vertical === "otel" ? "Yıldız ve olanaklar" : "Fiyat ve olanaklar";
    case "hizmet-alani":
      return "Hizmet kategorileri ve mahalleler";
  }
}
