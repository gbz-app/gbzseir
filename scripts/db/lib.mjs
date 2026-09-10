// Shared helpers for DB seed scripts (Node 24, built-in fetch). Never prints secrets.
import { runSql } from "./sql.mjs";

export { runSql };

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const UA = "Gebzem-prototype/0.1 (city guide prototype; contact info@aksedigital.com)";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** SQL string literal (dollar-quoting safe for any text). */
export function lit(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  const s = String(v);
  let tag = "q";
  while (s.includes(`$${tag}$`)) tag += "q";
  return `$${tag}$${s}$${tag}$`;
}

export function jsonLit(obj) {
  return `${lit(JSON.stringify(obj))}::jsonb`;
}

/** Run SQL with retries (transient network failures are expected). */
export async function sql(query, attempts = 5) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await runSql(query);
    } catch (e) {
      last = e;
      // 401/429/5xx and network errors from the Management API have been transient; SQL errors (400) are not.
      if (e.status && e.status >= 400 && e.status < 500 && e.status !== 429 && e.status !== 401) throw e;
      await sleep(2000 * i);
    }
  }
  throw last;
}

const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

/** One polite Overpass query with retry + mirror fallback. Returns parsed JSON. */
export async function overpass(query) {
  let last;
  for (let round = 0; round < 3; round++) {
    for (const url of OVERPASS) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
          body: "data=" + encodeURIComponent(query),
          signal: AbortSignal.timeout(200_000),
        });
        const text = await res.text();
        if (!res.ok || text.trimStart().startsWith("<")) throw new Error(`overpass ${url} ${res.status}: ${text.slice(0, 160).replace(/\s+/g, " ")}`);
        return JSON.parse(text);
      } catch (e) {
        last = e;
        console.error(String(e.message).slice(0, 200));
        await sleep(5000);
      }
    }
    await sleep(15000);
  }
  throw last;
}

/** Supabase REST/GoTrue fetch with service role. */
export async function adminFetch(path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, ok: res.ok, body: json };
}

/** Turkish slug (mirrors public.tr_slug). */
export function trSlug(s) {
  const map = { İ: "i", I: "i", ı: "i", Ğ: "g", ğ: "g", Ü: "u", ü: "u", Ş: "s", ş: "s", Ö: "o", ö: "o", Ç: "c", ç: "c", Â: "a", â: "a", Î: "i", î: "i", Û: "u", û: "u" };
  return String(s || "")
    .replace(/[İIıĞğÜüŞşÖöÇçÂâÎîÛû]/g, (c) => map[c])
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
