/**
 * What each business type unlocks ("Sana neler açılır" in the apply wizard) and the one-line type descriptions.
 * Pure TS + lucide icons.
 */
import {
  BedDouble,
  BookOpen,
  Briefcase,
  Clock,
  Images,
  Inbox,
  MapPinned,
  QrCode,
  ReceiptText,
  Sparkles,
  Stethoscope,
  Ticket,
  type LucideIcon,
} from "lucide-react";
import type { Vertical } from "../../lib/verticals";

export type TypeFeature = { key: string; label: string; icon: LucideIcon };

const f = (key: string, label: string, icon: LucideIcon): TypeFeature => ({ key, label, icon });

const MENU = f("menu", "Dijital menü", BookOpen);
const QR = f("qr", "QR menü", QrCode);
const GALLERY = f("gallery", "Galeri", Images);
const HOURS = f("hours", "Çalışma saatleri", Clock);
const JOBS = f("jobs", "İş ilanı", Briefcase);
const EVENTS = f("events", "Etkinlik", Ticket);

const FOOD: readonly TypeFeature[] = [MENU, QR, GALLERY, HOURS, JOBS, EVENTS];
const PLACE: readonly TypeFeature[] = [GALLERY, HOURS, JOBS, EVENTS];

export const TYPE_FEATURES: Record<Vertical, readonly TypeFeature[]> = {
  yemek: FOOD,
  restoran: FOOD,
  kafe: FOOD,
  otel: [f("rooms", "Odalar ve fiyatlar", BedDouble), QR, GALLERY, f("amenities", "Olanaklar", Sparkles), JOBS, EVENTS],
  hizmet: [f("leads", "Hizmet talepleri", Inbox), f("prices", "Fiyat listesi", ReceiptText), f("areas", "Hizmet bölgeleri", MapPinned), GALLERY, JOBS],
  magaza: PLACE,
  saglik: [...PLACE, f("doctors", "Doktorlar", Stethoscope)],
  dugun: PLACE,
  egitim: PLACE,
  spor: PLACE,
  etkinlik: [EVENTS, GALLERY],
  diger: PLACE,
};

/** One line under the type name. */
export const TYPE_DESCRIPTIONS: Record<Vertical, string> = {
  yemek: "Lokanta, ev yemekleri, dürüm ve kebap",
  restoran: "Balık, ocakbaşı, pizza ve akşam yemeği",
  kafe: "Kahve, kahvaltı, pastane ve çay bahçesi",
  otel: "Otel, apart ve pansiyon",
  hizmet: "Temizlik, tadilat, nakliyat gibi hizmetler",
  magaza: "Dükkan, market ve mağazalar",
  saglik: "Klinik, diş hekimi, poliklinik",
  dugun: "Düğün salonu, organizasyon, gelinlik",
  egitim: "Kurs, etüt, anaokulu ve özel ders",
  spor: "Pilates, fitness, yoga ve spor salonu",
  etkinlik: "Etkinlik alanı",
  diger: "Oto yıkama, kuru temizleme ve diğerleri",
};
