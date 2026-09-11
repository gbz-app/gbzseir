/** Small pure helpers of the services module (client + server safe). */

import { routes, withQuery } from "@/core/routes";
import type { ServiceCatalog, ServicePickerData } from "./types";

/**
 * `?sec=1` on /hizmet-talebi/<slug>: the request was started from the service picker (/hizmetler), so the
 * wizard keeps the picker as its step 1. Plain deep links (no param) start at the first question.
 */
export const PICKED_PARAM = "sec";

/** Wizard URL of a service chosen in the picker; `adim` 2 opens the step right after the picker. */
export function pickedRequestHref(slug: string, adim?: number): string {
  return withQuery(routes.services.request(slug, adim), { [PICKED_PARAM]: 1 });
}

/** Catalog -> service picker payload (groups without active sub-categories are left out). */
export function servicePickerData(catalog: ServiceCatalog): ServicePickerData {
  return {
    groups: catalog.parents
      .filter((p) => p.children.length > 0)
      .map((p) => ({ slug: p.slug, name: p.name, icon: p.icon, description: p.description })),
    items: catalog.subs.map((s) => ({
      slug: s.slug,
      name: s.name,
      icon: s.icon,
      parentSlug: s.parent.slug,
      popular: s.popular,
      comingSoon: s.provider_count === 0,
      terms: [...s.synonyms, s.parent.name, ...s.parent.synonyms, s.description ?? ""].filter(Boolean),
    })),
  };
}

/** service_requests.public_code: 8 chars from [A-Z2-9] (no 0/O/1/I). */
export const REQUEST_CODE_RE = /^[A-HJ-NP-Z2-9]{8}$/;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeRequestCode(input: string | string[] | null | undefined): string | null {
  const v = (Array.isArray(input) ? input[0] : input)?.trim().toUpperCase() ?? "";
  return REQUEST_CODE_RE.test(v) ? v : null;
}

type RpcError = { message?: string; hint?: string | null; code?: string | null } | null | undefined;

/**
 * User-facing text for a PostgREST/RPC error. Our RPCs raise Turkish messages with a machine `hint`
 * (and SQLSTATE P0001); everything else (network, permission) gets a generic Turkish text.
 */
export function rpcErrorMessage(error: RpcError, fallback = "İşlem tamamlanamadı. Lütfen tekrar dene."): string {
  if (!error) return fallback;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "İnternet bağlantın yok gibi görünüyor. Bağlantını kontrol edip tekrar dene.";
  if ((error.hint || error.code === "P0001") && error.message) return error.message;
  if (!error.code || /fetch|network|timeout|abort/i.test(error.message ?? "")) return "Bağlantı sorunu oluştu. Lütfen tekrar dene.";
  return fallback;
}

/** "Hacıhalil" -> "Hacıhalil Mah." (neighbourhood names are stored short). */
export function neighbourhoodLabel(name: string | null | undefined): string {
  if (!name) return "Gebze";
  return /\bmah/i.test(name) ? name : `${name} Mah.`;
}
