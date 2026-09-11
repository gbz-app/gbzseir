"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { normalizePhoneTR } from "@/core/phone";
import { routes } from "@/core/routes";
import { slugifyTr } from "@/core/tr";
import type { Json, TablesInsert, TablesUpdate } from "@/lib/database.types";
import { revalidatePublic, type PublicCacheTag } from "@/lib/revalidate-public";
import { CATEGORY_KEY_RE } from "@/features/business/lib/category-visuals";
import type { PoiKind } from "@/features/nearby/types";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { POI_KIND_VALUES, poiDeletable, poiPublicPath } from "../lib/poi-kinds";
import { firstIssue, zId } from "../lib/zod";

// alt / credit up to 300 like the guide form: Commons credit lines (author · licence) can be longer than 160.
const httpsUrl = z.string().trim().url().max(500).refine((u) => /^https:\/\//.test(u), "Fotoğraf adresi https olmalı.");
const photo = z.object({
  url: httpsUrl,
  alt: z.string().trim().max(300).nullable().optional(),
  credit: z.string().trim().max(300).nullable().optional(),
  /** The upload's small variant (new uploads only); a saved photo keeps its stored thumb_url. */
  thumbUrl: httpsUrl.nullable().optional(),
});

type PhotoInput = z.infer<typeof photo>;
type JsonObject = Record<string, Json | undefined>;

const jsonObject = (v: Json | null | undefined): JsonObject => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/**
 * details.photos to store. Each photo keeps every key of the saved photo with the same url (Commons author, licence,
 * licence_url, source_page, credit, the 1024 px thumb_url, width, height), so an admin save never strips CC
 * attribution. The dialog only sets url, alt and credit; an empty alt / credit keeps the saved one.
 */
function photosJson(saved: Json | undefined, photos: PhotoInput[]): Json[] {
  const byUrl = new Map<string, JsonObject>();
  for (const s of Array.isArray(saved) ? saved : []) {
    const o = jsonObject(s);
    if (typeof o.url === "string") byUrl.set(o.url, o);
  }
  return photos.map((p) => {
    const prev = byUrl.get(p.url) ?? {};
    const out: Record<string, Json> = {};
    for (const [k, val] of Object.entries(prev)) if (val !== undefined) out[k] = val;
    out.url = p.url;
    out.alt = p.alt || (typeof prev.alt === "string" ? prev.alt : null);
    out.credit = p.credit || (typeof prev.credit === "string" ? prev.credit : null);
    if (p.thumbUrl && p.thumbUrl !== p.url) out.thumb_url = p.thumbUrl;
    return out;
  });
}

/** Gezilecek yer texts and photos, stored in poi.details (kind 'place' only). */
const placeFields = z.object({
  // A place_categories key (admin-managed); the poi_place_category trigger checks that it exists (2026091363).
  category: z.string().regex(CATEGORY_KEY_RE, "Kategori seç."),
  description: z.string().trim().max(2000, "Açıklama en fazla 2000 karakter olabilir.").optional(),
  hours: z.string().trim().max(200).optional(),
  fee: z.string().trim().max(100).optional(),
  curated: z.boolean(),
  photos: z.array(photo).max(12, "En fazla 12 fotoğraf."),
});

/** A box around Kocaeli's 12 districts (a sanity check; the district comes from the polygons). */
const AREA_MSG = "Konum Kocaeli'de olmalı.";

const schema = z.object({
  id: zId.optional(),
  kind: z.enum(POI_KIND_VALUES),
  name: z.string().trim().min(2, "Yer adı yaz.").max(120),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(200).optional(),
  lat: z.number().min(40.4, AREA_MSG).max(41.3, AREA_MSG).nullable(),
  lng: z.number().min(29.2, AREA_MSG).max(30.5, AREA_MSG).nullable(),
  hidden: z.boolean(),
  /** Keep the admin's fields when a data sync (OSM / KBB) updates the row. */
  locked: z.boolean(),
  place: placeFields.optional(),
});

async function revalidatePois(kind: PoiKind, slug?: string) {
  revalidatePath(routes.admin.places());
  const detail = slug ? poiPublicPath(kind, slug) : null;
  const tags: PublicCacheTag[] = kind === "pharmacy" ? ["poi", "nearby", "duty"] : ["poi", "nearby"];
  await revalidatePublic({
    tags,
    paths: [
      routes.home(),
      kind === "place" ? routes.nearby.places() : routes.nearby.root(),
      ...(kind === "pharmacy" ? [routes.nearby.dutyPharmacies()] : []),
      ...(detail ? [detail] : []),
    ],
  });
}

/** Mobile / landline as +90..., or a 444 short number (taxi cooperatives) as "444 X XXX". */
function poiPhone(raw: string): string | null {
  const d = raw.replace(/\D+/g, "");
  if (/^444\d{4}$/.test(d)) return `444 ${d.slice(3, 4)} ${d.slice(4)}`;
  return normalizePhoneTR(raw, { allowLandline: true });
}

/**
 * Add / edit a poi of any kind: name, phone, address, location and hidden (+ texts, category and photos for places).
 * Saving locks the row unless the admin turns it off; poi.details keeps unknown keys (wikidata, lines, source data).
 */
export async function savePlaceAction(input: z.input<typeof schema>): Promise<ActionResult<{ slug: string }>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const v = parsed.data;
    if (v.kind === "place" && !v.place) return fail("Yer bilgileri eksik.");
    const phone = v.phone ? poiPhone(v.phone) : null;
    if (v.phone && !phone) return fail("Telefonu 0262 123 45 67 ya da 444 1 234 biçiminde yaz.");
    // Photos are merged with the saved ones below (photosJson), so they are not part of these fields.
    const placePhotos = v.kind === "place" && v.place ? v.place.photos : null;
    const place =
      v.kind === "place" && v.place
        ? {
            category: v.place.category,
            description: v.place.description || null,
            hours: v.place.hours || null,
            fee: v.place.fee || null,
            curated: v.place.curated,
          }
        : null;
    const point = v.lat !== null && v.lng !== null ? { lat: v.lat, lng: v.lng } : null;
    const location = point ? `SRID=4326;POINT(${point.lng} ${point.lat})` : undefined;

    if (v.id) {
      const { data: current, error: cErr } = await supabase.from("poi").select("kind,details,slug,lat,lng").eq("id", v.id).maybeSingle();
      if (cErr) return dbFail(cErr);
      if (!current || current.kind !== v.kind) return fail("Yer bulunamadı.", "not_found");
      const patch: TablesUpdate<"poi"> = {
        name: v.name,
        address: v.address || null,
        phone,
        hidden: v.hidden,
        locked: v.locked,
        updated_at: new Date().toISOString(),
      };
      if (place && placePhotos) {
        const base = jsonObject(current.details);
        patch.details = { ...base, ...place, photos: photosJson(base.photos, placePhotos) };
      }
      // Only a moved pin is written; the zz_fill_district trigger moves the district with it.
      if (point && location && (current.lat !== point.lat || current.lng !== point.lng)) patch.location = location;
      const { error } = await supabase.from("poi").update(patch).eq("id", v.id);
      if (error) return dbFail(error);
      await revalidatePois(v.kind, current.slug);
      return ok({ slug: current.slug }, "Yer güncellendi.");
    }

    if (!point || !location) return fail("Haritadan konum seç.");
    const slug = `${slugifyTr(v.name).slice(0, 60) || "yer"}-${Math.random().toString(36).slice(2, 6)}`;
    const row: TablesInsert<"poi"> = {
      kind: v.kind,
      name: v.name,
      slug,
      address: v.address || null,
      phone,
      // district_id: the zz_fill_district trigger takes it from the pin.
      location,
      details: place && placePhotos ? { ...place, photos: photosJson(undefined, placePhotos) } : {},
      source: "manual",
      license: null,
      hidden: v.hidden,
      locked: v.locked,
    };
    const { error } = await supabase.from("poi").insert(row);
    if (error) return dbFail(error, "Yer eklenemedi.");
    await revalidatePois(v.kind, slug);
    return ok({ slug }, "Yer eklendi.");
  });
}

/** Delete a poi. Synced non-place rows (OSM / KBB) are hidden instead (see poiDeletable). */
export async function deletePlaceAction(input: { id: string }): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const id = zId.safeParse(input.id);
    if (!id.success) return fail("Geçersiz yer.");
    const { data: current, error: cErr } = await supabase.from("poi").select("kind,source,source_ref,slug").eq("id", id.data).maybeSingle();
    if (cErr) return dbFail(cErr);
    if (!current) return fail("Yer bulunamadı.", "not_found");
    const kind = current.kind as PoiKind;
    if (!poiDeletable(kind, current.source, current.source_ref)) return fail("Veri kaynağından gelen yer silinmez; gizleyebilirsin.");
    const { error } = await supabase.from("poi").delete().eq("id", id.data);
    if (error) return dbFail(error);
    await revalidatePois(kind, current.slug);
    return ok(null, "Yer silindi.");
  });
}
