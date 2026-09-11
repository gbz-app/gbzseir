import { routes } from "@/core/routes";
import { hasDoctors } from "../components/doctors/doctor-meta";
import { hasAnyHours, parseWorkingHours } from "./hours";
import { hasMenu, hasRooms, resolveVertical } from "./verticals";

export type ChecklistInput = {
  vertical: string | null;
  kinds: readonly string[] | null;
  logo_url: string | null;
  cover_url: string | null;
  description: string | null;
  phone: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** The business's district (public.districts id). */
  district_id: string | null;
  working_hours: unknown;
  amenities: readonly string[] | null;
  categoryCount: number;
  /** Service districts (business_service_districts). */
  serviceDistrictCount: number;
  photoCount: number;
  /** Tool counts of the type (menu items, rooms, active services, active doctors); null or undefined when unknown: the task is left out. */
  menuItemCount?: number | null;
  roomCount?: number | null;
  serviceCount?: number | null;
  doctorCount?: number | null;
};

export type ChecklistKey =
  | "logo"
  | "cover"
  | "photos"
  | "description"
  | "phone"
  | "location"
  | "hours"
  | "amenities"
  | "categories"
  | "areas"
  | "services"
  | "menu"
  | "rooms"
  | "doctors";

export type ChecklistItem = {
  key: ChecklistKey;
  /** Task title ("Logo ekle"); struck through when done. */
  label: string;
  /** "Bunu unuttun" line shown while the task is open. */
  hint: string;
  done: boolean;
  /** Edit screen that completes this task. */
  href: string;
};

export type Checklist = { items: ChecklistItem[]; done: number; total: number; percent: number; complete: boolean };

export const MIN_PORTFOLIO_PHOTOS = 3;

/**
 * "Profil gücü" tasks of a business page, in display order. Common tasks for every type, then per type: service
 * firms get categories, service districts and the price list; others get amenities; food and hotels a menu; hotels
 * rooms. The location task needs the district as well as the address and the map pin.
 */
export function businessChecklist(b: ChecklistInput): Checklist {
  const vertical = resolveVertical(b.vertical, b.kinds);
  const hasScope = !!b.kinds?.includes("service");
  const offersServices = hasScope || vertical === "hizmet";
  const photos = Math.min(b.photoCount, MIN_PORTFOLIO_PHOTOS);
  const step = routes.business.editStep;
  const items: ChecklistItem[] = [];
  const add = (key: ChecklistKey, label: string, done: boolean, hint: string, href: string) => items.push({ key, label, done, hint, href });

  add("logo", "Logo ekle", !!b.logo_url, "Logonu eklemeyi unuttun. Seni listede hemen tanısınlar.", step("temel"));
  add("cover", "Kapak fotoğrafı ekle", !!b.cover_url, "Kapak fotoğrafını unuttun. Sayfanın en üstünde o görünür.", `${routes.business.photos()}#kapak`);
  add(
    "photos",
    `En az ${MIN_PORTFOLIO_PHOTOS} fotoğraf ekle`,
    b.photoCount >= MIN_PORTFOLIO_PHOTOS,
    b.photoCount > 0 ? `Galeride ${photos}/${MIN_PORTFOLIO_PHOTOS} fotoğraf var. Birkaç tane daha ekle.` : "Galeriyi unuttun. Birkaç fotoğraf güven verir.",
    `${routes.business.photos()}#portfolyo`,
  );
  add("description", "Açıklama yaz", !!b.description?.trim(), "Kendini anlatmayı unuttun. İki cümle yeter.", `${step("temel")}#hakkinda`);
  add("phone", "Telefon ekle", !!b.phone?.trim(), "Telefonunu eklemeyi unuttun. Müşteriler seni arayamıyor.", step("iletisim"));
  add(
    "location",
    "Adres ve konum ekle",
    !!b.district_id && !!b.address?.trim() && b.lat !== null && b.lng !== null,
    b.lat !== null && b.lng !== null && !b.district_id ? "İlçeni seçmeyi unuttun. İlçe listelerinde görünmüyorsun." : "Konumunu unuttun. Haritada ve Yakınımda görünmüyorsun.",
    step("konum"),
  );
  add(
    "hours",
    "Çalışma saatlerini gir",
    hasAnyHours(parseWorkingHours(b.working_hours)),
    "Saatlerini unuttun. \"Şu an açık mı?\" sorusu cevapsız kalıyor.",
    step("saatler"),
  );
  if (hasScope) {
    add("categories", "Hizmet kategorilerini seç", b.categoryCount > 0, "Kategori seçmeyi unuttun. Doğru talepler sana gelsin.", step("hizmet-alani"));
    add("areas", "Hizmet verdiğin ilçeleri seç", b.serviceDistrictCount > 0, "İlçe seçmeyi unuttun. Yakınındaki talepler önce sana gelsin.", `${step("hizmet-alani")}#bolgeler`);
  } else {
    add("amenities", "Olanakları seç", !!b.amenities?.length, "Olanaklarını seçmeyi unuttun. Filtrelerde de çıkarsın.", step("ozellikler"));
  }
  if (offersServices && typeof b.serviceCount === "number") {
    add("services", "Hizmet listeni ekle", b.serviceCount > 0, "Hizmetlerini ve fiyatlarını eklemeyi unuttun.", routes.business.services());
  }
  if (hasMenu(vertical) && typeof b.menuItemCount === "number") {
    add(
      "menu",
      "Menünü ekle",
      b.menuItemCount > 0,
      vertical === "otel" ? "Restoran ve oda servisi menünü eklemeyi unuttun." : "Menünü eklemeyi unuttun. QR menün de onunla dolar.",
      routes.business.menu(),
    );
  }
  if (hasRooms(vertical) && typeof b.roomCount === "number") {
    add("rooms", "Odalarını ekle", b.roomCount > 0, "Odalarını eklemeyi unuttun. Gecelik fiyatlar sayfanda görünsün.", routes.business.rooms());
  }
  if (hasDoctors(vertical) && typeof b.doctorCount === "number") {
    add("doctors", "Doktorlarını ekle", b.doctorCount > 0, "Doktorlarını eklemeyi unuttun. Hastalar kime gideceğini görsün.", routes.business.doctors());
  }

  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const percent = total ? Math.round((done / total) * 100) : 100;
  return { items, done, total, percent, complete: done === total };
}
