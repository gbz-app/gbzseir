"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { slugifyTr } from "@/core/tr";
import { revalidatePublic, type PublicPath } from "@/lib/revalidate-public";
import { DEFAULT_EVENT_CATEGORY, LISTABLE_VERTICALS, VERTICALS, VOCAB_ICON_NAMES, type Vertical } from "@/features/business/lib/verticals";
import { GUIDE_EXTRA_LIST_SLUGS } from "@/features/guide/components/list-config";
import { GUIDE_SECTIONS, parseInstitutionGroup } from "@/features/guide/lib/constants";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { CATEGORY_ICON_SETS } from "../lib/vocab-icons";
import { firstIssue, zId } from "../lib/zod";

/** Trimmed, single-spaced, lower-case (Turkish) terms without duplicates. */
const cleanTerms = (list: string[]) => [...new Set(list.map((t) => t.replace(/\s+/g, " ").trim().toLocaleLowerCase("tr-TR")).filter(Boolean))];

const terms = z
  .array(z.string().max(200))
  .max(100)
  .transform(cleanTerms)
  .refine((l) => l.length <= 40, "En fazla 40 ifade yazabilirsin.")
  .refine((l) => l.every((t) => t.length >= 2 && t.length <= 40), "Her ifade 2-40 karakter olmalı.");

const sort = z.coerce.number().int("Sıra tam sayı olmalı.").min(0, "Sıra 0-10000 arası olmalı.").max(10000, "Sıra 0-10000 arası olmalı.");

/** A row's icon: one of the names its editor offers. */
const iconOf = (names: readonly string[]) =>
  z
    .string()
    .refine((n) => names.includes(n), "Simge geçersiz.")
    .nullable();

const icon = iconOf(VOCAB_ICON_NAMES);

const subcategorySchema = z.object({
  id: zId.optional(),
  vertical: z.string().refine((v) => LISTABLE_VERTICALS.includes(v as Vertical), "İşletme türü geçersiz."),
  label: z.string().trim().min(2, "Chip adı en az 2 karakter olmalı.").max(40, "Chip adı en fazla 40 karakter olabilir."),
  keywords: terms.refine((l) => l.length > 0, "En az bir anahtar kelime yaz."),
  exclude: terms,
  sort,
  active: z.boolean(),
});

const amenitySchema = z
  .object({
    id: zId.optional(),
    scope: z.enum(["business", "room"]),
    label: z.string().trim().min(2, "Olanak adı en az 2 karakter olmalı.").max(60, "Olanak adı en fazla 60 karakter olabilir."),
    icon,
    verticals: z.array(z.enum(VERTICALS)).max(VERTICALS.length),
    sort,
    active: z.boolean(),
  })
  .refine((a) => a.scope === "room" || a.verticals.length > 0, { message: "En az bir işletme türü seç.", path: ["verticals"] });

const eventCategorySchema = z.object({
  id: zId.optional(),
  label: z.string().trim().min(2, "Kategori adı en az 2 karakter olmalı.").max(40, "Kategori adı en fazla 40 karakter olabilir."),
  icon,
  sort,
  active: z.boolean(),
});

/** News, place and institution categories and doctor branches: the event category fields with the kind's icon set and name length. */
const simpleCategorySchema = (names: readonly string[], noun = "Kategori", max = 40) =>
  z.object({
    id: zId.optional(),
    label: z.string().trim().min(2, `${noun} adı en az 2 karakter olmalı.`).max(max, `${noun} adı en fazla ${max} karakter olabilir.`),
    icon: iconOf(names),
    sort,
    active: z.boolean(),
  });

type SimpleCategoryInput = z.input<ReturnType<typeof simpleCategorySchema>>;

/** A new key from the label, unique among `taken`: kebab-case for chips, snake_case for amenities and event categories. */
function newKey(label: string, taken: ReadonlySet<string>, style: "kebab" | "snake", fallback: string): string {
  const slug = slugifyTr(label, 36);
  const base = (style === "kebab" ? slug : slug.replace(/-/g, "_").replace(/^[^a-z]+/, "")) || fallback;
  const sep = style === "kebab" ? "-" : "_";
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}${sep}${n}`;
  return key;
}

/** Keys returned by a `select("key")` query. null when the lookup fails. */
async function takenKeys(query: PromiseLike<{ data: Array<{ key: string }> | null; error: unknown }>): Promise<Set<string> | null> {
  const { data, error } = await query;
  return error ? null : new Set((data ?? []).map((r) => r.key));
}

/** Admin page + public pages that read the vocabularies (the tag also expires firm and event pages that used them). */
async function revalidateVocabularies(paths: PublicPath[] = []) {
  revalidatePath(routes.admin.vocabularies());
  await revalidatePublic({ tags: ["vocabularies"], paths });
}

// ---------------------------------------------------------------------------
// Keşfet chips (vertical_subcategories)
// ---------------------------------------------------------------------------

/** Keşfet chip'i ekle / düzenle. The vertical and key of an existing chip never change. */
export async function saveSubcategoryAction(input: z.input<typeof subcategorySchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = subcategorySchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const v = parsed.data;
    const row = { label: v.label, keywords: v.keywords, exclude: v.exclude, sort: v.sort, active: v.active };
    if (v.id) {
      const { data, error } = await supabase.from("vertical_subcategories").update(row).eq("id", v.id).select("vertical").maybeSingle();
      if (error) return dbFail(error, "Chip kaydedilemedi.");
      if (!data) return fail("Chip bulunamadı.", "not_found");
      await revalidateVocabularies([routes.businesses.vertical(data.vertical)]);
      return ok(null, "Chip güncellendi.");
    }
    const taken = await takenKeys(supabase.from("vertical_subcategories").select("key").eq("vertical", v.vertical).limit(2000));
    if (!taken) return fail("Chip kaydedilemedi. Tekrar dene.");
    const { error } = await supabase.from("vertical_subcategories").insert({ ...row, vertical: v.vertical, key: newKey(v.label, taken, "kebab", "chip") });
    if (error) return dbFail(error, "Chip eklenemedi.");
    await revalidateVocabularies([routes.businesses.vertical(v.vertical)]);
    return ok(null, "Chip eklendi.");
  });
}

export async function deleteSubcategoryAction(input: { id: string }): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const id = zId.safeParse(input.id);
    if (!id.success) return fail("Geçersiz chip.");
    const { data, error } = await supabase.from("vertical_subcategories").delete().eq("id", id.data).select("vertical").maybeSingle();
    if (error) return dbFail(error, "Chip silinemedi.");
    if (!data) return fail("Chip bulunamadı.", "not_found");
    await revalidateVocabularies([routes.businesses.vertical(data.vertical)]);
    return ok(null, "Chip silindi.");
  });
}

// ---------------------------------------------------------------------------
// Amenities (scope business: businesses.amenities, scope room: business_rooms.amenities)
// ---------------------------------------------------------------------------

/** Olanak / oda özelliği ekle / düzenle. The scope and key of an existing row never change. */
export async function saveAmenityAction(input: z.input<typeof amenitySchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = amenitySchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const v = parsed.data;
    const row = { label: v.label, icon: v.icon, verticals: v.scope === "room" ? [] : v.verticals, sort: v.sort, active: v.active };
    if (v.id) {
      const { data, error } = await supabase.from("amenities").update(row).eq("id", v.id).eq("scope", v.scope).select("id").maybeSingle();
      if (error) return dbFail(error, "Olanak kaydedilemedi.");
      if (!data) return fail("Olanak bulunamadı.", "not_found");
      await revalidateVocabularies();
      return ok(null, "Olanak güncellendi.");
    }
    const taken = await takenKeys(supabase.from("amenities").select("key").eq("scope", v.scope).limit(2000));
    if (!taken) return fail("Olanak kaydedilemedi. Tekrar dene.");
    const { error } = await supabase.from("amenities").insert({ ...row, scope: v.scope, key: newKey(v.label, taken, "snake", v.scope === "room" ? "oda_ozelligi" : "olanak") });
    if (error) return dbFail(error, "Olanak eklenemedi.");
    await revalidateVocabularies();
    return ok(null, "Olanak eklendi.");
  });
}

/** Delete an amenity nobody has picked (vocabulary_guard refuses a picked one with the count; it is turned off instead). */
export async function deleteAmenityAction(input: { id: string }): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const id = zId.safeParse(input.id);
    if (!id.success) return fail("Geçersiz olanak.");
    const { data, error } = await supabase.from("amenities").delete().eq("id", id.data).select("id").maybeSingle();
    if (error) return dbFail(error, "Olanak silinemedi.");
    if (!data) return fail("Olanak bulunamadı.", "not_found");
    await revalidateVocabularies();
    return ok(null, "Olanak silindi.");
  });
}

// ---------------------------------------------------------------------------
// Event categories (events.category references event_categories.key)
// ---------------------------------------------------------------------------

async function revalidateEventCategories() {
  revalidatePath(routes.admin.events());
  await revalidateVocabularies([routes.events.root()]);
}

/** Etkinlik kategorisi ekle / düzenle. The key of an existing category never changes (events reference it). */
export async function saveEventCategoryAction(input: z.input<typeof eventCategorySchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = eventCategorySchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const v = parsed.data;
    const row = { label: v.label, icon: v.icon, sort: v.sort, active: v.active };
    if (v.id) {
      const { data, error } = await supabase.from("event_categories").update(row).eq("id", v.id).select("id").maybeSingle();
      if (error) return dbFail(error, "Kategori kaydedilemedi.");
      if (!data) return fail("Kategori bulunamadı.", "not_found");
      await revalidateEventCategories();
      return ok(null, "Kategori güncellendi.");
    }
    const taken = await takenKeys(supabase.from("event_categories").select("key").limit(2000));
    if (!taken) return fail("Kategori kaydedilemedi. Tekrar dene.");
    const { error } = await supabase.from("event_categories").insert({ ...row, key: newKey(v.label, taken, "snake", "kategori") });
    if (error) return dbFail(error, "Kategori eklenemedi.");
    await revalidateEventCategories();
    return ok(null, "Kategori eklendi.");
  });
}

/** Delete an unused event category ("diger" is the events.category default and stays; the database also refuses both). */
export async function deleteEventCategoryAction(input: { id: string }): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const id = zId.safeParse(input.id);
    if (!id.success) return fail("Geçersiz kategori.");
    const { data: current, error: cErr } = await supabase.from("event_categories").select("key").eq("id", id.data).maybeSingle();
    if (cErr) return dbFail(cErr);
    if (!current) return fail("Kategori bulunamadı.", "not_found");
    if (current.key === DEFAULT_EVENT_CATEGORY) return fail("Diğer kategorisi etkinliklerin varsayılanıdır, silinemez.", "in_use");
    const { count, error: nErr } = await supabase.from("events").select("id", { count: "exact", head: true }).eq("category", current.key);
    if (nErr) return dbFail(nErr);
    if (count) return fail(`Bu kategoride ${count} etkinlik var. Silmek yerine pasife alabilirsin.`, "in_use");
    const { error } = await supabase.from("event_categories").delete().eq("id", id.data);
    if (error) return dbFail(error, error.code === "23503" ? "Bu kategoride etkinlik var. Silmek yerine pasife alabilirsin." : "Kategori silinemedi.");
    await revalidateEventCategories();
    return ok(null, "Kategori silindi.");
  });
}

// ---------------------------------------------------------------------------
// News categories (news_articles.category), place categories (poi.details->>'category' of places), 2026091363, and
// doctor branches (business_staff.branch), 2026091377
// ---------------------------------------------------------------------------

/** Filter values of the public chips ("Tümü"), never used as a key. */
const RESERVED_KEYS = ["tumu", "all"];

const SIMPLE_CATEGORIES = {
  news: {
    table: "news_categories",
    icons: CATEGORY_ICON_SETS.news,
    noun: "Kategori",
    fallbackKey: "kategori",
    revalidate: async () => {
      revalidatePath(routes.admin.newsArticles());
      await revalidateVocabularies([routes.home(), routes.content.news()]);
    },
  },
  place: {
    table: "place_categories",
    icons: CATEGORY_ICON_SETS.place,
    noun: "Kategori",
    fallbackKey: "kategori",
    revalidate: async () => {
      revalidatePath(routes.admin.places());
      await revalidateVocabularies([routes.home(), routes.nearby.places()]);
    },
  },
  branch: {
    table: "doctor_branches",
    icons: CATEGORY_ICON_SETS.branch,
    noun: "Branş",
    fallbackKey: "brans",
    // Branches are read through the "businesses" data cache (doctors/queries.ts): the firm pages' Doktorlar tab and the
    // Keşfet > Sağlık doctor list; the admin businesses page shows them in the doctor rows.
    revalidate: async () => {
      revalidatePath(routes.admin.vocabularies());
      revalidatePath(routes.admin.businesses());
      await revalidatePublic({ tags: ["businesses"], paths: [routes.businesses.vertical("saglik"), { path: "/firma/[slug]", type: "page" }] });
    },
  },
} as const;

type SimpleCategoryKind = keyof typeof SIMPLE_CATEGORIES;

/**
 * Add / edit a news or place category or a doctor branch. The key of an existing one never changes (stories, places and
 * doctors reference it; vocabulary_guard refuses a change with a Turkish message).
 */
async function saveSimpleCategory(kind: SimpleCategoryKind, input: SimpleCategoryInput): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const { table, icons, noun, fallbackKey, revalidate } = SIMPLE_CATEGORIES[kind];
    const parsed = simpleCategorySchema(icons, noun).safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const v = parsed.data;
    const row = { label: v.label, icon: v.icon, sort: v.sort, active: v.active };
    if (v.id) {
      const { data, error } = await supabase.from(table).update(row).eq("id", v.id).select("id").maybeSingle();
      if (error) return dbFail(error, `${noun} kaydedilemedi.`);
      if (!data) return fail(`${noun} bulunamadı.`, "not_found");
      await revalidate();
      return ok(null, `${noun} güncellendi.`);
    }
    const taken = await takenKeys(supabase.from(table).select("key").limit(2000));
    if (!taken) return fail(`${noun} kaydedilemedi. Tekrar dene.`);
    for (const k of RESERVED_KEYS) taken.add(k);
    const { error } = await supabase.from(table).insert({ ...row, key: newKey(v.label, taken, "snake", fallbackKey) });
    if (error) return dbFail(error, `${noun} eklenemedi.`);
    await revalidate();
    return ok(null, `${noun} eklendi.`);
  });
}

/**
 * Delete an unused category or branch. vocabulary_guard / doctor_branch_guard refuse a used one (with the count) and the
 * built-in RSS keys / "diger" with a Turkish message (hint in_use), which dbFail passes on.
 */
async function deleteSimpleCategory(kind: SimpleCategoryKind, input: { id: string }): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const { table, noun, revalidate } = SIMPLE_CATEGORIES[kind];
    const id = zId.safeParse(input.id);
    if (!id.success) return fail(`Geçersiz ${noun.toLocaleLowerCase("tr-TR")}.`);
    const { data, error } = await supabase.from(table).delete().eq("id", id.data).select("id").maybeSingle();
    if (error) return dbFail(error, `${noun} silinemedi.`);
    if (!data) return fail(`${noun} bulunamadı.`, "not_found");
    await revalidate();
    return ok(null, `${noun} silindi.`);
  });
}

export async function saveNewsCategoryAction(input: SimpleCategoryInput): Promise<ActionResult<null>> {
  return saveSimpleCategory("news", input);
}

export async function deleteNewsCategoryAction(input: { id: string }): Promise<ActionResult<null>> {
  return deleteSimpleCategory("news", input);
}

export async function savePlaceCategoryAction(input: SimpleCategoryInput): Promise<ActionResult<null>> {
  return saveSimpleCategory("place", input);
}

export async function deletePlaceCategoryAction(input: { id: string }): Promise<ActionResult<null>> {
  return deleteSimpleCategory("place", input);
}

export async function saveDoctorBranchAction(input: SimpleCategoryInput): Promise<ActionResult<null>> {
  return saveSimpleCategory("branch", input);
}

export async function deleteDoctorBranchAction(input: { id: string }): Promise<ActionResult<null>> {
  return deleteSimpleCategory("branch", input);
}

// ---------------------------------------------------------------------------
// Institution categories (poi.details->>'category' of kind institution; label_tr + group_key), 2026091376
// ---------------------------------------------------------------------------

/**
 * /rehber/<slug> resolves section and combined-list slugs before institution category slugs (key with "-" for "_"), so a
 * new category must not take one of those, nor the search index route /rehber/dizin.
 */
const GUIDE_RESERVED_KEYS = [...GUIDE_SECTIONS.map((s) => s.slug), ...GUIDE_EXTRA_LIST_SLUGS, "dizin"].map((s) => s.replace(/-/g, "_"));

const institutionCategorySchema = simpleCategorySchema(CATEGORY_ICON_SETS.institution, "Kategori", 60).extend({
  group: z.string().refine((g) => parseInstitutionGroup(g) !== null, "Bir grup seç."),
});

async function revalidateInstitutionCategories() {
  revalidatePath(routes.admin.guide());
  await revalidateVocabularies([routes.guide.root(), { path: "/rehber/[kategori]", type: "page" }, { path: "/kurum/[slug]", type: "page" }, "/rehber/dizin"]);
}

/** Kurum kategorisi ekle / düzenle: name, group, icon, order, active. The key never changes (poi rows reference it). */
export async function saveInstitutionCategoryAction(input: z.input<typeof institutionCategorySchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = institutionCategorySchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const v = parsed.data;
    const row = { label_tr: v.label, group_key: v.group, icon: v.icon, sort: v.sort, active: v.active };
    if (v.id) {
      const { data, error } = await supabase.from("institution_categories").update(row).eq("id", v.id).select("id").maybeSingle();
      if (error) return dbFail(error, "Kategori kaydedilemedi.");
      if (!data) return fail("Kategori bulunamadı.", "not_found");
      await revalidateInstitutionCategories();
      return ok(null, "Kategori güncellendi.");
    }
    const taken = await takenKeys(supabase.from("institution_categories").select("key").limit(2000));
    if (!taken) return fail("Kategori kaydedilemedi. Tekrar dene.");
    for (const k of [...RESERVED_KEYS, ...GUIDE_RESERVED_KEYS]) taken.add(k);
    const { error } = await supabase.from("institution_categories").insert({ ...row, key: newKey(v.label, taken, "snake", "kurum") });
    if (error) return dbFail(error, "Kategori eklenemedi.");
    await revalidateInstitutionCategories();
    return ok(null, "Kategori eklendi.");
  });
}

/** Delete an unused institution category; vocabulary_guard refuses a used one and "diger_kamu" (Turkish message, hint in_use). */
export async function deleteInstitutionCategoryAction(input: { id: string }): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const id = zId.safeParse(input.id);
    if (!id.success) return fail("Geçersiz kategori.");
    const { data, error } = await supabase.from("institution_categories").delete().eq("id", id.data).select("id").maybeSingle();
    if (error) return dbFail(error, "Kategori silinemedi.");
    if (!data) return fail("Kategori bulunamadı.", "not_found");
    await revalidateInstitutionCategories();
    return ok(null, "Kategori silindi.");
  });
}
