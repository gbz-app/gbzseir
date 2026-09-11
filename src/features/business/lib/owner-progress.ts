import "server-only";
import { createClient } from "@/lib/supabase/server";
import { hasDoctors } from "../components/doctors/doctor-meta";
import { businessChecklist, type Checklist } from "./completeness";
import type { OwnerBusiness } from "./owner-queries";
import { hasMenu, hasRooms, resolveVertical } from "./verticals";

/** Row counts of the type tools of a business; null = not offered for this type, or could not be read. */
export type OwnerToolCounts = { menuItems: number | null; rooms: number | null; services: number | null; doctors: number | null };

type CountResult = { count: number | null; error: unknown };

async function countOf(query: PromiseLike<CountResult>): Promise<number | null> {
  const { count, error } = await query;
  return error ? null : (count ?? 0);
}

/** Menu items (food, hotel), rooms (hotel), active services (service firms) and active doctors (sağlık), read with the owner's session. */
export async function getOwnerToolCounts(b: Pick<OwnerBusiness, "id" | "vertical" | "kinds">): Promise<OwnerToolCounts> {
  const vertical = resolveVertical(b.vertical, b.kinds);
  const offersServices = b.kinds.includes("service") || vertical === "hizmet";
  const supabase = await createClient();
  const [menuItems, rooms, services, doctors] = await Promise.all([
    hasMenu(vertical) ? countOf(supabase.from("business_menu_items").select("id", { count: "exact", head: true }).eq("business_id", b.id)) : null,
    hasRooms(vertical) ? countOf(supabase.from("business_rooms").select("id", { count: "exact", head: true }).eq("business_id", b.id)) : null,
    offersServices
      ? countOf(supabase.from("business_services").select("id", { count: "exact", head: true }).eq("business_id", b.id).eq("is_active", true))
      : null,
    hasDoctors(vertical)
      ? countOf(supabase.from("business_staff").select("id", { count: "exact", head: true }).eq("business_id", b.id).eq("is_active", true))
      : null,
  ]);
  return { menuItems, rooms, services, doctors };
}

/** Profil gücü checklist of an owned business. */
export function ownerChecklist(b: OwnerBusiness, counts: OwnerToolCounts): Checklist {
  return businessChecklist({
    vertical: b.vertical,
    kinds: b.kinds,
    logo_url: b.logo_url,
    cover_url: b.cover_url,
    description: b.description,
    phone: b.phone,
    address: b.address,
    lat: b.lat,
    lng: b.lng,
    district_id: b.district_id,
    working_hours: b.working_hours,
    amenities: b.amenities,
    categoryCount: b.category_ids.length,
    serviceDistrictCount: b.service_district_ids.length,
    photoCount: b.photos.length,
    menuItemCount: counts.menuItems,
    roomCount: counts.rooms,
    serviceCount: counts.services,
    doctorCount: counts.doctors,
  });
}
