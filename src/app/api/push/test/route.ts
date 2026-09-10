import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { notifyUser } from "@/lib/notify";
import { routes } from "@/core/routes";

/** Best-effort per-instance throttle (1 test per user per 15 s). */
const lastSent = new Map<string, number>();

/** POST /api/push/test: sends a test notification (in-app row + web push) to the signed-in user. */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Bu işlem için giriş yapmalısın." }, { status: 401 });

  const now = Date.now();
  if (now - (lastSent.get(user.id) ?? 0) < 15_000) {
    return NextResponse.json({ ok: false, error: "Biraz bekleyip tekrar dene." }, { status: 429 });
  }
  lastSent.set(user.id, now);

  const result = await notifyUser(user.id, {
    type: "test",
    title: "Test bildirimi",
    body: "Bildirimler bu cihazda çalışıyor.",
    link: routes.profile.notifications(),
  });
  return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
}
