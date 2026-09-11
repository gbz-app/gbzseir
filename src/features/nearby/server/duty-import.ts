import "server-only";
import { DUTY_SWITCH_TIME, dutyDayFor } from "@/core/duty";
import { toNationalDigits } from "@/core/phone";
import { routes } from "@/core/routes";
import { istanbulParts } from "@/core/time";
import { trNormalize } from "@/core/tr";
import { revalidatePublic } from "@/lib/revalidate-public";
import { createAdminClient, type AdminSupabase } from "@/lib/supabase/admin";

/**
 * Real duty list import (pharmacy_duty). An adapter reads the Gebze duty list from one source; its entries are matched
 * to poi kind 'pharmacy' (phone first, then name) and written for the current duty day with the adapter id as source
 * through duty_import_record (2026091344_duty_import.sql). Every run is logged in duty_import_runs (/admin/nobet).
 * A day the admin entered by hand (source 'manual') is never overwritten.
 */

/** One pharmacy as the source lists it. */
export type DutySourceEntry = { name: string; phone: string | null; address: string | null };

export type DutySourceList = {
  entries: DutySourceEntry[];
  /** Duty day ('YYYY-MM-DD') the source says the list is for; null when it does not say. */
  day: string | null;
};

export type DutySourceAdapter = {
  /** pharmacy_duty.source of the written rows: lowercase, never 'demo' or 'manual'. */
  id: string;
  label: string;
  /** Istanbul 'HH:mm' from which the source has the new duty day's list; earlier runs of that day are skipped. */
  readyAt?: string;
  fetchList: () => Promise<DutySourceList>;
};

const NOSYAPI_URL = "https://www.nosyapi.com/apiv2/service/pharmacies-on-duty";

/** First non-empty string among the keys. */
function pick(o: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

/** 'YYYY-MM-DD' of "2026-09-11..." or "11.09.2026", else null. */
function dayKey(v: string | null): string | null {
  if (!v) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const tr = /^(\d{2})[./](\d{2})[./](\d{4})/.exec(v);
  return tr ? `${tr[3]}-${tr[2]}-${tr[1]}` : null;
}

/**
 * NosyAPI duty pharmacies (paid; key in NOSYAPI_KEY, NOSYAPI_URL overrides the endpoint). Endpoint, auth header and field
 * names follow the public docs and were not tried with a real key yet. NosyAPI publishes the day's list from 09:00.
 */
export function nosyApiAdapter(apiKey: string): DutySourceAdapter {
  return {
    id: "nosyapi",
    label: "NosyAPI",
    readyAt: "09:05",
    async fetchList() {
      const url = new URL(process.env.NOSYAPI_URL?.trim() || NOSYAPI_URL);
      url.searchParams.set("city", "kocaeli");
      url.searchParams.set("county", "gebze");
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: unknown = await res.json();
      const body = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
      const status = typeof body.status === "string" ? body.status.toLowerCase() : null;
      if (status && status !== "success" && status !== "ok") throw new Error(String(body.message ?? status).slice(0, 200));
      const rows: unknown[] = Array.isArray(body.data) ? body.data : Array.isArray(json) ? json : [];
      const entries: DutySourceEntry[] = [];
      for (const row of rows) {
        if (!row || typeof row !== "object") continue;
        const o = row as Record<string, unknown>;
        const name = pick(o, ["pharmacyName", "name", "eczaneAdi", "title"]);
        const district = pick(o, ["district", "county", "ilce"]);
        if (!name || (district && trNormalize(district) !== "gebze")) continue;
        entries.push({ name, phone: pick(o, ["phone", "phoneNumber", "telefon", "tel"]), address: pick(o, ["address", "adres"]) });
      }
      return { entries, day: dayKey(pick(body, ["date", "day", "tarih"])) };
    },
  };
}

/** The configured source, or null (no key yet: runs are logged as 'no_source'). */
export function activeDutyAdapter(): DutySourceAdapter | null {
  const key = process.env.NOSYAPI_KEY?.trim();
  return key ? nosyApiAdapter(key) : null;
}

export type PharmacyRef = { id: string; name: string; phone: string | null };

/** Comparable pharmacy name: "YENİ GEBZE ECZ." / "Yeni Gebze Eczanesi" -> "yeni gebze". */
export function pharmacyNameKey(name: string): string {
  return trNormalize(name)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(eczanesi|eczane|ecz)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Source entries -> poi ids: phone (national digits) first, then the exact name key, then the one pharmacy whose name
 * words all appear in the other name (two words at least). Ambiguous keys never match; unmatched names are logged.
 */
export function matchPharmacies(entries: DutySourceEntry[], pharmacies: PharmacyRef[]): { ids: string[]; unmatched: string[] } {
  const byPhone = new Map<string, string | null>();
  const byName = new Map<string, string | null>();
  const put = (m: Map<string, string | null>, key: string | null, id: string) => {
    if (key) m.set(key, m.has(key) && m.get(key) !== id ? null : id);
  };
  const keyed = pharmacies.map((p) => ({ id: p.id, words: pharmacyNameKey(p.name).split(" ").filter(Boolean) }));
  for (const p of pharmacies) {
    put(byPhone, toNationalDigits(p.phone, { allowLandline: true }), p.id);
    put(byName, pharmacyNameKey(p.name) || null, p.id);
  }
  const ids = new Set<string>();
  const unmatched: string[] = [];
  for (const e of entries) {
    const phone = toNationalDigits(e.phone, { allowLandline: true });
    const key = pharmacyNameKey(e.name);
    let id = (phone ? byPhone.get(phone) : null) ?? (key ? byName.get(key) : null) ?? null;
    if (!id) {
      const words = key.split(" ").filter(Boolean);
      const hits = keyed.filter((p) => {
        const [short, long] = p.words.length <= words.length ? [p.words, words] : [words, p.words];
        return short.length >= 2 && short.every((w) => long.includes(w));
      });
      if (hits.length === 1) id = hits[0].id;
    }
    if (id) ids.add(id);
    else unmatched.push(e.name);
  }
  return { ids: [...ids], unmatched };
}

export type DutyImportStatus = "ok" | "skipped" | "empty" | "stale" | "no_source" | "error";

export type DutyImportResult = {
  status: DutyImportStatus;
  /** Adapter id, or 'none'. */
  source: string;
  day: string;
  fetched: number;
  matched: number;
  written: number;
  unmatched: string[];
  message: string | null;
};

type RecordArgs = {
  p_source: string;
  p_status: Exclude<DutyImportStatus, "skipped">;
  p_day: string;
  p_poi_ids?: string[];
  p_fetched?: number;
  p_unmatched?: string[];
  p_message?: string;
};

/** duty_import_record: writes an 'ok' list and logs every run. Throws when the DB call fails. */
async function record(admin: AdminSupabase, args: RecordArgs): Promise<{ status: DutyImportStatus; written: number; removed: number }> {
  const { data, error } = await admin.rpc("duty_import_record", args);
  if (error) throw new Error(`duty_import_record failed: ${error.message}`);
  const r = (data ?? {}) as { status?: DutyImportStatus; written?: number; removed?: number };
  return { status: r.status ?? args.p_status, written: r.written ?? 0, removed: r.removed ?? 0 };
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * One import run for the current duty day (/api/cron/duty). `adapter` defaults to the configured source (pass one to
 * test with a fixture). Source problems are logged as runs, never thrown; only a failing DB call throws.
 */
export async function runDutyImport(opts: { adapter?: DutySourceAdapter | null; now?: Date } = {}): Promise<DutyImportResult> {
  const adapter = opts.adapter === undefined ? activeDutyAdapter() : opts.adapter;
  const now = opts.now ?? new Date();
  const day = dutyDayFor(now);
  const admin = createAdminClient();
  const result: DutyImportResult = { status: "no_source", source: adapter?.id ?? "none", day, fetched: 0, matched: 0, written: 0, unmatched: [], message: null };

  const log = async (status: RecordArgs["p_status"], message: string): Promise<DutyImportResult> => {
    await record(admin, { p_source: result.source, p_status: status, p_day: day, p_fetched: result.fetched, p_unmatched: result.unmatched, p_message: message });
    return { ...result, status, message };
  };

  if (!adapter) return log("no_source", "Nöbet kaynağı tanımlı değil (NOSYAPI_KEY yok).");

  if (adapter.readyAt) {
    const p = istanbulParts(now);
    const t = p.hour * 60 + p.minute;
    if (t >= toMinutes(DUTY_SWITCH_TIME) && t < toMinutes(adapter.readyAt)) {
      return log("stale", `${adapter.label} günün listesini saat ${adapter.readyAt} sonrasında yayınlıyor; sonraki denemede alınacak.`);
    }
  }

  let list: DutySourceList;
  try {
    list = await adapter.fetchList();
  } catch (e) {
    return log("error", `${adapter.label} okunamadı: ${(e instanceof Error ? e.message : String(e)).slice(0, 300)}`);
  }
  result.fetched = list.entries.length;
  if (list.day && list.day !== day) return log("stale", `${adapter.label} listesi ${list.day} tarihli; bugünün (${day}) listesi değil.`);
  if (!list.entries.length) return log("empty", `${adapter.label} boş liste döndürdü.`);

  const { data: pharmacies, error } = await admin.from("poi").select("id,name,phone").eq("kind", "pharmacy").eq("hidden", false).limit(1000);
  if (error) return log("error", "Eczaneler okunamadı.");
  const m = matchPharmacies(list.entries, pharmacies ?? []);
  result.matched = m.ids.length;
  result.unmatched = m.unmatched;
  if (!m.ids.length) return log("empty", "Listedeki eczanelerin hiçbiri eşleşmedi.");

  const message = m.unmatched.length ? `${m.unmatched.length} eczane eşleşmedi; gerekirse listeye elle ekle.` : null;
  const r = await record(admin, {
    p_source: adapter.id,
    p_status: "ok",
    p_day: day,
    p_poi_ids: m.ids,
    p_fetched: result.fetched,
    p_unmatched: m.unmatched,
    p_message: message ?? undefined,
  });
  if (r.written || r.removed) {
    await revalidatePublic({ tags: ["duty", "nearby"], paths: [routes.nearby.dutyPharmacies(), routes.home()] });
  }
  return {
    ...result,
    status: r.status,
    written: r.written,
    message: r.status === "skipped" ? "Bu gün için elle girilen liste var; aktarım yazmadı." : message,
  };
}
