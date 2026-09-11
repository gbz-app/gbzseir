import { NextResponse } from "next/server";
import { z } from "zod";
import { IS_ADMIN_SITE } from "@/config/app-mode";
import { routes } from "@/core/routes";
import { expirePublicLocally } from "@/lib/revalidate-public";
import { isCronAuthorized } from "@/lib/server/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CINEMA_CACHE_TAG } from "@/features/cinema/config";
import { runCinemaSync, type CinemaPush } from "@/features/cinema/server/sync";

/**
 * Gebze Center AVM cinema import (src/features/cinema/server/sync.ts): reads the Paribu Cineverse Gebze Center
 * programme (every published day) and the "Yakında" list, stores films + sessions with public.cinema_import and
 * expires the cinema caches (home, /sinema, film pages). Returns the counts.
 *
 * Callers:
 *  - pg_cron job `gebzem-cinema-refresh` (06:20 and 15:20 Istanbul) through pg_net: header `x-cron-secret` =
 *    CRON_SECRET (Supabase Vault 'gebzem_push_webhook_secret'), body {source: 'pg_cron'};
 *  - a manual push when the source blocks the Vercel region: POST {pages: [{date: 'YYYY-MM-DD', html}], upcoming_html?}
 *    with the cron secret or an active admin's Supabase access token (`Authorization: Bearer <jwt>`). The pages are
 *    downloaded on a Turkish connection and parsed here with the same parser.
 * `?dry=1` (or `dry_run: true`) parses and reports without writing.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BODY_CHARS = 4_000_000;

const bodySchema = z.object({
  source: z.string().max(40).optional(),
  dry_run: z.boolean().optional(),
  pages: z
    .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), html: z.string().min(1_000).max(2_000_000) }))
    .min(1)
    .max(31)
    .optional(),
  upcoming_html: z.string().max(2_500_000).nullish(),
});

const NO_STORE = { "Cache-Control": "no-store" };

/** Bearer token of an active admin (the manual push; the admin site has no service key of its own). */
async function isAdminBearer(req: Request): Promise<boolean> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (token.length > 4096 || token.split(".").length !== 3) return false;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return false;
    const { data: profile } = await admin.from("profiles").select("role,status").eq("id", data.user.id).maybeSingle();
    return profile?.role === "admin" && profile?.status === "active";
  } catch {
    return false;
  }
}

async function readBody(req: Request): Promise<{ ok: true; body: z.infer<typeof bodySchema> } | { ok: false; status: number; error: string }> {
  if (req.method !== "POST") return { ok: true, body: {} };
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_CHARS) return { ok: false, status: 413, error: "İstek çok büyük" };
  const raw = await req.text();
  if (raw.length > MAX_BODY_CHARS) return { ok: false, status: 413, error: "İstek çok büyük" };
  if (!raw.trim()) return { ok: true, body: {} };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, status: 400, error: "Geçersiz istek" };
  }
  const parsed = bodySchema.safeParse(json);
  return parsed.success ? { ok: true, body: parsed.data } : { ok: false, status: 400, error: "Geçersiz istek" };
}

async function handle(req: Request) {
  if (IS_ADMIN_SITE) return NextResponse.json({ ok: false }, { status: 404 });
  if (!isCronAuthorized(req) && !(await isAdminBearer(req))) {
    return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401, headers: NO_STORE });
  }

  const read = await readBody(req);
  if (!read.ok) return NextResponse.json({ ok: false, error: read.error }, { status: read.status, headers: NO_STORE });
  const { body } = read;
  const dryRun = body.dry_run === true || new URL(req.url).searchParams.get("dry") === "1";
  const push: CinemaPush | null = body.pages ? { pages: body.pages, upcomingHtml: body.upcoming_html ?? null } : null;

  try {
    const result = await runCinemaSync({ push, dryRun });
    if (result.stored) {
      expirePublicLocally([CINEMA_CACHE_TAG], [{ path: routes.home() }, { path: routes.cinema.root() }, { path: "/sinema/[slug]", type: "page" }]);
    }
    if (result.error) console.warn(`[cron/cinema] ${result.mode}: ${result.error}`);
    else if (result.warnings.length) console.warn(`[cron/cinema] ${result.mode} warnings: ${result.warnings.join(" | ")}`);
    return NextResponse.json(result, { status: result.ok ? 200 : 502, headers: NO_STORE });
  } catch (e) {
    console.error("[cron/cinema]", e);
    return NextResponse.json({ ok: false, error: "Seanslar kaydedilemedi" }, { status: 500, headers: NO_STORE });
  }
}

export const POST = handle;
export const GET = handle;
