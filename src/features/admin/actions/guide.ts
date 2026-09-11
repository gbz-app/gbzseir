"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { slugifyTr } from "@/core/tr";
import type { Json, TablesInsert, TablesUpdate } from "@/lib/database.types";
import { revalidatePublic, type PublicPath } from "@/lib/revalidate-public";
import { CATEGORY_KEY_RE } from "@/features/business/lib/category-visuals";
import { GUIDE_LIST_KINDS, GUIDE_SLUG_PREFIX, INSTITUTION_FALLBACK_CATEGORY, guideHref, sectionFor } from "@/features/guide/lib/constants";
import type { GuideListKind } from "@/features/guide/lib/types";
import { dbFail, withAdmin, type AdminContext } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { SOCKET_TYPES, guideDeletable, isGuideKind, istanbulDate } from "../lib/guide-admin";
import { firstIssue, zId } from "../lib/zod";

/**
 * City guide records (poi kinds institution, atm, bank, fuel, ev_charge, place) from /admin/rehber. Writes go straight
 * to public.poi through RLS "admin write" with the admin's session (no service key); the audit_content trigger logs
 * them. Unknown details keys (import key, osm_id, verify_note...) are kept.
 */

const AREA_MSG = "Konum Gebze çevresinde olmalı.";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const key = z.string().regex(CATEGORY_KEY_RE, "Listeden bir seçim yap.");

const photo = z.object({
  url: z
    .string()
    .trim()
    .url()
    .max(1000)
    .refine((u) => u.startsWith("https://"), "Fotoğraf adresi https olmalı."),
  alt: z.string().trim().max(300).nullable(),
  credit: z.string().trim().max(300).nullable(),
  author: z.string().trim().max(200).nullable(),
  licence: z.string().trim().max(80).nullable(),
  licenceUrl: z.string().trim().max(500).nullable(),
  sourcePage: z.string().trim().max(1000).nullable(),
});

const schema = z.object({
  id: zId.optional(),
  kind: z.enum(GUIDE_LIST_KINDS),
  name: z.string().trim().min(2, "Ad yaz.").max(200, "Ad en fazla 200 karakter olabilir."),
  address: z.string().trim().max(300, "Adres en fazla 300 karakter olabilir."),
  neighbourhoodId: zId.nullable(),
  lat: z.number().min(40.5, AREA_MSG).max(41.2, AREA_MSG).nullable(),
  lng: z.number().min(29, AREA_MSG).max(30, AREA_MSG).nullable(),
  phones: z.array(z.string().trim().max(40)).max(8, "En fazla 8 telefon ekleyebilirsin."),
  fax: z.string().trim().max(40),
  email: z.string().trim().max(200, "E-posta en fazla 200 karakter olabilir."),
  website: z.string().trim().max(500, "Web sitesi adresi en fazla 500 karakter olabilir."),
  hours: z.string().trim().max(500, "Çalışma saatleri en fazla 500 karakter olabilir."),
  description: z.string().trim().max(2000, "Açıklama en fazla 2000 karakter olabilir."),
  fee: z.string().trim().max(200),
  category: key.nullable(),
  subkind: key.nullable(),
  ownership: z.enum(["devlet", "ozel"]).nullable(),
  bank: key.nullable(),
  brand: key.nullable(),
  operator: key.nullable(),
  sockets: z.record(z.string(), z.number().int().min(0).max(99).nullable()),
  powerKw: z.number().min(0).max(1000).nullable(),
  capacity: z.number().int().min(0).max(500).nullable(),
  atmCount: z.number().int().min(0).max(50).nullable(),
  curated: z.boolean(),
  photos: z.array(photo).max(12, "En fazla 12 fotoğraf."),
  verified: z.boolean(),
  verifiedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Doğrulama tarihini seç.")
    .nullable(),
  sourceUrls: z.array(z.string().trim().max(1000)).max(20, "En fazla 20 kaynak bağlantısı."),
  hidden: z.boolean(),
  /** Keep the admin's fields when the city guide import or a data sync touches the row again. */
  locked: z.boolean(),
});

type Values = z.infer<typeof schema>;
type Obj = Record<string, Json | undefined>;

const objectOf = (v: Json | null | undefined): Obj => (v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : {});

/** Same normalisation as the import (scripts/db/import-city-guide.mjs phoneOf): E.164, 444/850 short lines, 3-5 digit codes. */
function guidePhone(raw: string): string | null {
  const d = raw.replace(/\D+/g, "");
  if (/^90\d{10}$/.test(d)) return `+${d}`;
  if (/^0\d{10}$/.test(d)) return `+9${d}`;
  if (/^[2-9]\d{9}$/.test(d)) return `+90${d}`;
  if (/^(444|850)\d{4}$/.test(d)) return `+90${d}`;
  // The import stores those 7-digit lines as "+90444XXXX": read them back unchanged.
  if (/^90(444|850)\d{4}$/.test(d)) return `+${d}`;
  if (/^\d{3,5}$/.test(d)) return d;
  return null;
}

/** "gebze.bel.tr" -> "https://gebze.bel.tr"; null when it is not a web address. */
function cleanUrl(raw: string, max: number): string | null {
  let w = raw.trim();
  if (!w) return null;
  if (!/^https?:\/\//i.test(w)) w = `https://${w.replace(/^\/+/, "")}`;
  if (w.length > max || /\s/.test(w)) return null;
  try {
    return new URL(w).hostname.includes(".") ? w : null;
  } catch {
    return null;
  }
}

/** verified_at: the stored time when the day did not change, else noon (Istanbul) of the chosen day; null when off. */
function verifiedAt(v: Pick<Values, "verified" | "verifiedDate">, current: string | null): string | null {
  if (!v.verified) return null;
  const day = v.verifiedDate ?? istanbulDate();
  if (current && istanbulDate(current) === day) return current;
  return `${day}T12:00:00+03:00`;
}

function photoJson(p: Values["photos"][number]): Json {
  const o: Record<string, Json> = { url: p.url };
  if (p.alt) o.alt = p.alt;
  if (p.credit) o.credit = p.credit;
  if (p.author) o.author = p.author;
  if (p.licence) o.licence = p.licence;
  if (p.licenceUrl) o.licence_url = p.licenceUrl;
  if (p.sourcePage) o.source_page = p.sourcePage;
  return o;
}

/** poi.details: the row's keys plus the edited ones of its kind (empty values remove the key). */
function buildDetails(base: Json | null, v: Values, phones: string[], fax: string | null): Json {
  const d: Record<string, Json> = {};
  for (const [k, val] of Object.entries(objectOf(base))) if (val !== undefined) d[k] = val;
  const put = (k: string, val: Json | null | undefined) => {
    const empty =
      val === null ||
      val === undefined ||
      val === "" ||
      (Array.isArray(val) && val.length === 0) ||
      (typeof val === "object" && !Array.isArray(val) && Object.keys(val).length === 0);
    if (empty) delete d[k];
    else d[k] = val;
  };
  put("phones", phones);
  put("hours", v.hours || null);
  put("description", v.description || null);
  put("photos", v.photos.map(photoJson));
  switch (v.kind) {
    case "institution":
      put("category", v.category ?? INSTITUTION_FALLBACK_CATEGORY);
      put("ownership", v.ownership);
      put("fax", fax);
      break;
    case "place":
      put("category", v.category);
      put("subkind", v.subkind);
      put("fee", v.fee || null);
      d.curated = v.curated;
      break;
    case "atm":
      put("bank", v.bank);
      put("atm_count", v.atmCount);
      break;
    case "bank":
      put("bank", v.bank);
      break;
    case "fuel":
      put("brand", v.brand);
      break;
    case "ev_charge": {
      put("operator", v.operator);
      const sockets: Record<string, number> = {};
      // Socket types the form does not edit (source data) stay.
      for (const [t, n] of Object.entries(objectOf(d.sockets))) if (!SOCKET_TYPES.includes(t) && typeof n === "number") sockets[t] = n;
      for (const t of SOCKET_TYPES) {
        const n = v.sockets[t];
        if (typeof n === "number" && n > 0) sockets[t] = n;
      }
      put("sockets", sockets);
      put("power_kw", v.powerKw);
      put("capacity", v.capacity);
      break;
    }
  }
  return d;
}

/** New slug: the /kurum kinds get their prefix (atm-, banka-, akaryakit-, sarj-) so poiFromPagePath finds the kind. */
function newSlug(kind: GuideListKind, name: string): string {
  const prefix = kind === "institution" || kind === "place" ? "" : GUIDE_SLUG_PREFIX[kind];
  let core = slugifyTr(name, 60) || "kayit";
  if (prefix && core.startsWith(prefix)) core = core.slice(prefix.length) || "nokta";
  // An institution slug must not look like another /kurum kind.
  if (kind === "institution" && Object.values(GUIDE_SLUG_PREFIX).some((p) => core.startsWith(p))) core = `kurum-${core}`;
  return `${prefix}${core}-${Math.random().toString(36).slice(2, 6)}`;
}

const pointWkt = (p: { lat: number; lng: number }) => `SRID=4326;POINT(${p.lng} ${p.lat})`;

/** Neighbourhood of a point (polygon, else the nearest centre within 6 km). */
async function neighbourhoodAt(supabase: AdminContext["supabase"], p: { lat: number; lng: number }): Promise<string | null> {
  const { data } = await supabase.rpc("neighbourhood_for_point", { p_lat: p.lat, p_lng: p.lng });
  const hit = Array.isArray(data) ? data[0] : null;
  return hit?.id ?? null;
}

/** Admin lists here, then the public app: /rehber, the section list(s), the detail page and the map lists. */
async function refreshGuide(kind: GuideListKind, slug: string, categories: Array<string | null | undefined>, id?: string) {
  revalidatePath(routes.admin.guide());
  revalidatePath(routes.admin.guideMissingPins());
  revalidatePath(routes.admin.places());
  if (id) revalidatePath(routes.admin.guideItem(id));
  const sections = new Set<string>();
  for (const c of categories.length ? categories : [null]) {
    const s = sectionFor(kind, c ?? null);
    if (s) sections.add(routes.guide.category(s.slug));
  }
  const paths: PublicPath[] = [
    routes.home(),
    routes.guide.root(),
    ...sections,
    guideHref(kind, slug),
    kind === "place" ? routes.nearby.places() : routes.nearby.root(),
  ];
  await revalidatePublic({ tags: ["poi", "nearby"], paths });
}

/** Add or edit a guide record. Saving locks the row unless the admin turns it off. */
export async function saveGuideAction(input: z.input<typeof schema>): Promise<ActionResult<{ id: string; slug: string }>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const v = parsed.data;

    const phones: string[] = [];
    for (const raw of v.phones) {
      if (!raw) continue;
      const p = guidePhone(raw);
      if (!p) return fail(`"${raw.slice(0, 30)}" telefon olarak okunamadı. 0262 123 45 67 biçiminde yaz.`);
      if (!phones.includes(p)) phones.push(p);
    }
    const fax = v.fax ? guidePhone(v.fax) : null;
    if (v.fax && !fax) return fail("Faks numarasını 0262 123 45 67 biçiminde yaz.");
    const email = v.email ? v.email.toLowerCase() : null;
    if (email && !EMAIL_RE.test(email)) return fail("E-posta adresi geçersiz.");
    const website = v.website ? cleanUrl(v.website, 500) : null;
    if (v.website && !website) return fail("Web sitesi adresi geçersiz. https://... biçiminde yaz.");
    const sourceUrls: string[] = [];
    for (const raw of v.sourceUrls) {
      if (!raw) continue;
      const u = cleanUrl(raw, 1000);
      if (!u) return fail(`Kaynak bağlantısı geçersiz: ${raw.slice(0, 80)}`);
      if (!sourceUrls.includes(u)) sourceUrls.push(u);
    }
    if (v.kind === "place" && !v.category) return fail("Kategori seç.");
    if (v.verified && v.verifiedDate && v.verifiedDate > istanbulDate()) return fail("Doğrulama tarihi ileri bir gün olamaz.");
    const point = v.lat !== null && v.lng !== null ? { lat: v.lat, lng: v.lng } : null;

    if (v.id) {
      const { data: current, error: cErr } = await supabase.from("poi").select("kind,slug,details,lat,lng,verified_at").eq("id", v.id).maybeSingle();
      if (cErr) return dbFail(cErr);
      if (!current || current.kind !== v.kind) return fail("Kayıt bulunamadı.", "not_found");
      const oldCategory = objectOf(current.details).category;
      const patch: TablesUpdate<"poi"> = {
        name: v.name,
        address: v.address || null,
        phone: phones[0] ?? null,
        email,
        website,
        source_urls: sourceUrls,
        verified_at: verifiedAt(v, current.verified_at),
        details: buildDetails(current.details, v, phones, fax),
        hidden: v.hidden,
        locked: v.locked,
      };
      // Only a moved (or removed) pin is written.
      const moved = point ? current.lat !== point.lat || current.lng !== point.lng : current.lat !== null;
      if (moved) patch.location = point ? pointWkt(point) : null;
      patch.neighbourhood_id = v.neighbourhoodId ?? (point ? await neighbourhoodAt(supabase, point) : null);
      const { error } = await supabase.from("poi").update(patch).eq("id", v.id);
      if (error) return dbFail(error);
      await refreshGuide(v.kind, current.slug, [v.category, typeof oldCategory === "string" ? oldCategory : null], v.id);
      return ok({ id: v.id, slug: current.slug }, "Kayıt kaydedildi.");
    }

    const neighbourhoodId = v.neighbourhoodId ?? (point ? await neighbourhoodAt(supabase, point) : null);
    for (let attempt = 0; attempt < 3; attempt++) {
      const slug = newSlug(v.kind, v.name);
      const row: TablesInsert<"poi"> = {
        kind: v.kind,
        name: v.name,
        slug,
        address: v.address || null,
        phone: phones[0] ?? null,
        email,
        website,
        source_urls: sourceUrls,
        verified_at: verifiedAt(v, null),
        location: point ? pointWkt(point) : null,
        neighbourhood_id: neighbourhoodId,
        details: buildDetails(null, v, phones, fax),
        source: "manual",
        license: null,
        hidden: v.hidden,
        locked: v.locked,
      };
      const { data, error } = await supabase.from("poi").insert(row).select("id").single();
      // A taken slug (unique): try another random suffix.
      if (error?.code === "23505" && /slug/i.test(`${error.message} ${error.details ?? ""}`)) continue;
      if (error || !data) return dbFail(error, "Kayıt eklenemedi.");
      await refreshGuide(v.kind, slug, [v.category], data.id);
      return ok({ id: data.id, slug }, "Kayıt eklendi.");
    }
    return fail("Kayıt eklenemedi. Tekrar dene.");
  });
}

/**
 * "Sil": rows added in the admin are deleted. Imported rows (city guide import, OSM / KBB) are hidden and locked
 * instead, because the next import would add them again (it never un-hides a row).
 */
export async function deleteGuideAction(input: { id: string }): Promise<ActionResult<{ hidden: boolean }>> {
  return withAdmin<{ hidden: boolean }>(async ({ supabase }) => {
    const id = zId.safeParse(input.id);
    if (!id.success) return fail("Geçersiz kayıt.");
    const { data: current, error: cErr } = await supabase.from("poi").select("kind,source,source_ref,slug,details").eq("id", id.data).maybeSingle();
    if (cErr) return dbFail(cErr);
    if (!current || !isGuideKind(current.kind)) return fail("Kayıt bulunamadı.", "not_found");
    const kind = current.kind;
    const category = objectOf(current.details).category;
    const categories = [typeof category === "string" ? category : null];
    if (guideDeletable(current.source, current.source_ref)) {
      const { error } = await supabase.from("poi").delete().eq("id", id.data);
      if (error) return dbFail(error);
      await refreshGuide(kind, current.slug, categories);
      return ok({ hidden: false }, "Kayıt silindi.");
    }
    const { error } = await supabase.from("poi").update({ hidden: true, locked: true }).eq("id", id.data);
    if (error) return dbFail(error);
    await refreshGuide(kind, current.slug, categories, id.data);
    return ok({ hidden: true }, "Kayıt kaldırıldı. Uygulamada görünmez; içe aktarma da geri getirmez.");
  });
}
