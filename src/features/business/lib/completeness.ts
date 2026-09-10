import { routes } from "@/core/routes";
import { hasAnyHours, parseWorkingHours } from "./hours";

export type ChecklistInput = {
  kinds: readonly string[] | null;
  logo_url: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  cover_url: string | null;
  working_hours: unknown;
  categoryCount: number;
  photoCount: number;
};

export type ChecklistKey = "logo" | "location" | "categories" | "cover" | "photos" | "hours";

export type ChecklistItem = {
  key: ChecklistKey;
  label: string;
  hint: string;
  done: boolean;
  /** Edit screen that completes this item. */
  href: string;
};

export type Checklist = { items: ChecklistItem[]; done: number; total: number; percent: number; complete: boolean };

export const MIN_PORTFOLIO_PHOTOS = 3;

/** "Profilini tamamla" (3b) checklist; the categories item exists only for service businesses. */
export function businessChecklist(b: ChecklistInput): Checklist {
  const isService = !!b.kinds?.includes("service");
  const items: ChecklistItem[] = [
    { key: "logo", label: "Logo", hint: "Müşterilerin seni kolayca tanısın.", done: !!b.logo_url, href: `${routes.business.edit()}#logo` },
    {
      key: "location",
      label: "Adres ve konum",
      hint: "Yakınımda haritasında görün.",
      done: !!b.address?.trim() && b.lat !== null && b.lng !== null,
      href: `${routes.business.edit()}#konum`,
    },
    ...(isService
      ? [
          {
            key: "categories" as const,
            label: "Hizmet kategorileri",
            hint: "Doğru talepler sana gelsin.",
            done: b.categoryCount > 0,
            href: `${routes.business.edit()}#kategoriler`,
          },
        ]
      : []),
    { key: "cover", label: "Kapak fotoğrafı", hint: "Sayfanın en üstünde görünür.", done: !!b.cover_url, href: routes.business.photos() },
    {
      key: "photos",
      label: `En az ${MIN_PORTFOLIO_PHOTOS} iş fotoğrafı`,
      hint: `${Math.min(b.photoCount, MIN_PORTFOLIO_PHOTOS)}/${MIN_PORTFOLIO_PHOTOS} fotoğraf eklendi.`,
      done: b.photoCount >= MIN_PORTFOLIO_PHOTOS,
      href: routes.business.photos(),
    },
    {
      key: "hours",
      label: "Çalışma saatleri",
      hint: "\"Şu an açık mı?\" sorusunun cevabı.",
      done: hasAnyHours(parseWorkingHours(b.working_hours)),
      href: `${routes.business.edit()}#saatler`,
    },
  ];
  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const percent = Math.round((done / total) * 100);
  return { items, done, total, percent, complete: done === total };
}
