import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { IS_ADMIN_SITE } from "@/config/app-mode";
import { PUBLIC_CACHE_TAGS, expirePublicLocally, revalidateSecretHeader } from "@/lib/revalidate-public";

/**
 * POST /api/revalidate - called by the separate admin site after a change (see revalidatePublic). Expires the given
 * public data-cache tags and pages in THIS (public) deployment. Shared secret REVALIDATE_SECRET in both projects.
 */
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  tags: z.array(z.enum(PUBLIC_CACHE_TAGS)).max(20).default([]),
  paths: z
    .array(
      z.object({
        path: z
          .string()
          .max(200)
          .regex(/^\/[\w\-/[\]]*$/)
          .refine((p) => !p.startsWith("/admin") && !p.startsWith("/api"), "not a public page"),
        type: z.enum(["page", "layout"]).optional(),
      }),
    )
    .max(40)
    .default([]),
});

function authorized(req: Request): boolean {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get(revalidateSecretHeader) ?? "");
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (IS_ADMIN_SITE) return NextResponse.json({ ok: false }, { status: 404 });
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Yetkisiz" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Geçersiz istek" }, { status: 400 });
  expirePublicLocally(parsed.data.tags, parsed.data.paths);
  return NextResponse.json({ ok: true, tags: parsed.data.tags.length, paths: parsed.data.paths.length }, { headers: { "Cache-Control": "no-store" } });
}
