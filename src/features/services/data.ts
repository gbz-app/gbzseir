import "server-only";
import { cache } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { parseFlowSchema, type FlowSchema } from "@/core/flow";
import type { ServiceCatalog, ServiceCategory, ServiceParent } from "./types";

/**
 * Public (guest-visible) services data for Server Components. Uses a cookie-less anon client so the pages
 * stay static/ISR (reading cookies would make every page dynamic). Every PostgREST GET goes through the Next
 * data cache with a 10 minute revalidation, tagged 'services'.
 */
export const SERVICES_REVALIDATE_SECONDS = 600;

let client: SupabaseClient<Database> | null = null;

function publicClient(): SupabaseClient<Database> {
  if (!client) {
    client = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: (input, init) => fetch(input, { ...init, next: { revalidate: SERVICES_REVALIDATE_SECONDS, tags: ["services"] } }),
      },
    });
  }
  return client;
}

const CATEGORY_COLUMNS = "id,parent_id,name,slug,icon,description,synonyms,sort,popular,max_providers,auto_dispatch";

function toCategory(row: Record<string, unknown>): ServiceCategory {
  return {
    id: String(row.id),
    parent_id: (row.parent_id as string | null) ?? null,
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    icon: (row.icon as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    synonyms: Array.isArray(row.synonyms) ? (row.synonyms as string[]) : [],
    sort: Number(row.sort ?? 0),
    popular: !!row.popular,
    max_providers: Number(row.max_providers ?? 5) || 5,
    auto_dispatch: !!row.auto_dispatch,
  };
}

/** Whole active catalog (10 parents + subs). Throws on a network/DB error (error.tsx shows a retry). */
export const getServiceCatalog = cache(async (): Promise<ServiceCatalog> => {
  const { data, error } = await publicClient()
    .from("service_categories")
    .select(CATEGORY_COLUMNS)
    .eq("active", true)
    .order("sort", { ascending: true });
  if (error) throw new Error(`service_categories: ${error.message}`);
  const rows = (data ?? []).map((r) => toCategory(r as Record<string, unknown>));
  const parents: ServiceParent[] = rows.filter((r) => !r.parent_id).map((p) => ({ ...p, children: [] }));
  const byId = new Map(parents.map((p) => [p.id, p]));
  const subs: ServiceCatalog["subs"] = [];
  for (const r of rows) {
    if (!r.parent_id) continue;
    const parent = byId.get(r.parent_id);
    if (!parent) continue; // parent inactive
    parent.children.push(r);
    subs.push({ ...r, parent });
  }
  subs.sort((a, b) => a.parent.sort - b.parent.sort || a.sort - b.sort);
  return { parents, subs };
});

/** Catalog lookup that never throws (home widget, sitemap). */
export async function getServiceCatalogSafe(): Promise<ServiceCatalog | null> {
  try {
    return await getServiceCatalog();
  } catch {
    return null;
  }
}

export type CategoryLookup =
  | { kind: "parent"; category: ServiceParent }
  | { kind: "sub"; category: ServiceCategory; parent: ServiceParent }
  | null;

export async function findCategory(slug: string): Promise<CategoryLookup> {
  const catalog = await getServiceCatalog();
  const parent = catalog.parents.find((p) => p.slug === slug);
  if (parent) return { kind: "parent", category: parent };
  const sub = catalog.subs.find((s) => s.slug === slug);
  if (sub) return { kind: "sub", category: sub, parent: catalog.parents.find((p) => p.id === sub.parent_id)! };
  return null;
}

/** Latest published question flow of a sub-category (null when none). */
export const getPublishedFlow = cache(async (categoryId: string): Promise<{ id: string; version: number; schema: FlowSchema } | null> => {
  const { data, error } = await publicClient()
    .from("question_flows")
    .select("id,version,schema")
    .eq("category_id", categoryId)
    .eq("published", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`question_flows: ${error.message}`);
  if (!data) return null;
  try {
    return { id: data.id, version: data.version, schema: parseFlowSchema(data.schema) };
  } catch {
    return null; // malformed flow: the wizard continues with the system steps only
  }
});

export type FirmCard = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  verification_level: number;
  category_label: string | null;
  neighbourhood_name: string | null;
};

/** Up to `limit` approved service firms serving any of the given categories (best verified/rated first). */
export async function getFirmsForCategories(categoryIds: string[], limit = 5): Promise<FirmCard[]> {
  if (categoryIds.length === 0) return [];
  const { data, error } = await publicClient()
    .from("businesses")
    .select(
      "id,slug,name,logo_url,rating_avg,rating_count,verification_level,category_label,neighbourhoods(name),business_service_categories!inner(category_id)",
    )
    .eq("status", "approved")
    .contains("kinds", ["service"])
    .in("business_service_categories.category_id", categoryIds)
    .order("verification_level", { ascending: false })
    .order("rating_avg", { ascending: false })
    .order("rating_count", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map((b) => {
    const nb = b.neighbourhoods as { name?: string } | { name?: string }[] | null;
    const nbName = Array.isArray(nb) ? nb[0]?.name : nb?.name;
    return {
      id: b.id,
      slug: b.slug,
      name: b.name,
      logo_url: b.logo_url,
      rating_avg: b.rating_avg === null ? null : Number(b.rating_avg),
      rating_count: b.rating_count,
      verification_level: b.verification_level,
      category_label: b.category_label,
      neighbourhood_name: nbName ?? null,
    };
  });
}
