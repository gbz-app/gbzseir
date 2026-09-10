import "server-only";
import { cache } from "react";
import { createPublicClient } from "./public-client";
import { resolveVertical, type Vertical } from "./verticals";

/** Card data for the vertical list pages (/kesfet/[tur]). Anon client, ISR friendly. */
export type VerticalCard = {
  id: string;
  slug: string;
  name: string;
  /** Cover photo, else the first portfolio photo. */
  photo_url: string | null;
  logo_url: string | null;
  category_label: string | null;
  neighbourhood_name: string | null;
  lat: number | null;
  lng: number | null;
  rating_avg: number;
  rating_count: number;
  price_level: number | null;
  star_rating: number | null;
  amenities: string[];
  vertical: Vertical;
  working_hours: unknown;
  vacation_mode: boolean;
  /** Hotels: cheapest available room per night. */
  min_room_price: number | null;
  photo_count: number;
};

type Raw = {
  id: string;
  slug: string;
  name: string;
  cover_url: string | null;
  logo_url: string | null;
  category_label: string | null;
  lat: number | null;
  lng: number | null;
  rating_avg: number | string | null;
  rating_count: number | null;
  price_level: number | null;
  star_rating: number | null;
  amenities: string[] | null;
  vertical: string | null;
  kinds: string[] | null;
  working_hours: unknown;
  vacation_mode: boolean | null;
  neighbourhoods: { name: string } | null;
  business_photos: Array<{ url: string; sort: number }> | null;
  business_rooms: Array<{ price_try: number | string | null; is_available: boolean }> | null;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

export type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price_try: number | null;
  photo_url: string | null;
  tags: string[];
  is_available: boolean;
  sort: number;
};
export type MenuSection = { id: string; name: string; sort: number; items: MenuItem[] };

type RawSection = { id: string; name: string; sort: number; business_menu_items: Array<Omit<MenuItem, "price_try" | "tags"> & { price_try: unknown; tags: string[] | null }> | null };

/** Digital menu of a business (sections with items, both sorted). Public when the business is approved. */
export const getBusinessMenu = cache(async (businessId: string): Promise<MenuSection[]> => {
  const { data, error } = await createPublicClient()
    .from("business_menu_sections")
    .select("id,name,sort,business_menu_items(id,name,description,price_try,photo_url,tags,is_available,sort)")
    .eq("business_id", businessId)
    .order("sort");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawSection[]).map((s) => ({
    id: s.id,
    name: s.name,
    sort: s.sort,
    items: [...(s.business_menu_items ?? [])].sort((a, b) => a.sort - b.sort).map((i) => ({ ...i, price_try: num(i.price_try), tags: i.tags ?? [] })),
  }));
});

export type Room = {
  id: string;
  name: string;
  description: string | null;
  price_try: number | null;
  capacity: number;
  bed_info: string | null;
  size_m2: number | null;
  amenities: string[];
  photos: string[];
  is_available: boolean;
  sort: number;
};

/** Hotel rooms of a business, sorted. */
export const getBusinessRooms = cache(async (businessId: string): Promise<Room[]> => {
  const { data, error } = await createPublicClient()
    .from("business_rooms")
    .select("id,name,description,price_try,capacity,bed_info,size_m2,amenities,photos,is_available,sort")
    .eq("business_id", businessId)
    .order("sort");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Array<Omit<Room, "price_try"> & { price_try: unknown }>).map((r) => ({
    ...r,
    price_try: num(r.price_try),
    amenities: r.amenities ?? [],
    photos: r.photos ?? [],
  }));
});

export const listVerticalBusinesses = cache(async (vertical: Vertical): Promise<VerticalCard[]> => {
  const { data, error } = await createPublicClient()
    .from("businesses")
    .select(
      "id,slug,name,cover_url,logo_url,category_label,lat,lng,rating_avg,rating_count,price_level,star_rating,amenities,vertical,kinds,working_hours,vacation_mode,neighbourhoods!businesses_neighbourhood_id_fkey(name),business_photos(url,sort),business_rooms(price_try,is_available)",
    )
    .eq("status", "approved")
    .eq("vertical", vertical)
    .order("rating_avg", { ascending: false })
    .order("rating_count", { ascending: false })
    .order("name")
    .limit(300);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as Raw[]).map((b) => {
    const photos = [...(b.business_photos ?? [])].sort((x, y) => x.sort - y.sort);
    const prices = (b.business_rooms ?? []).filter((r) => r.is_available).map((r) => num(r.price_try)).filter((p): p is number => p !== null);
    return {
      id: b.id,
      slug: b.slug,
      name: b.name,
      photo_url: b.cover_url ?? photos[0]?.url ?? null,
      logo_url: b.logo_url,
      category_label: b.category_label,
      neighbourhood_name: b.neighbourhoods?.name ?? null,
      lat: b.lat,
      lng: b.lng,
      rating_avg: num(b.rating_avg) ?? 0,
      rating_count: b.rating_count ?? 0,
      price_level: b.price_level,
      star_rating: b.star_rating,
      amenities: b.amenities ?? [],
      vertical: resolveVertical(b.vertical, b.kinds),
      working_hours: b.working_hours,
      vacation_mode: !!b.vacation_mode,
      min_room_price: prices.length ? Math.min(...prices) : null,
      photo_count: photos.length,
    };
  });
});
