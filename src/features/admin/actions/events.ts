"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { revalidatePublic } from "@/lib/revalidate-public";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";

async function revalidateEvents(slug?: string | null) {
  revalidatePath(routes.admin.events());
  revalidatePath(routes.admin.root());
  await revalidatePublic({
    tags: ["businesses"],
    paths: [
      routes.events.root(),
      ...(slug ? [routes.events.detail(slug)] : []),
      { path: "/firma/[slug]", type: "page" },
      routes.home(),
    ],
  });
}

const statusSchema = z.object({ id: zId, status: z.enum(["published", "draft", "cancelled"]) });

/**
 * Yayına al / taslağa çek / iptal et. An admin take-down is sticky (admin_hidden): the owner cannot re-publish it,
 * only edit and resubmit it for review.
 */
export async function setEventStatusAction(input: z.input<typeof statusSchema>): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = statusSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { status } = parsed.data;
    const { data, error } = await supabase
      .from("events")
      .update({ status, admin_hidden: status !== "published" })
      .eq("id", parsed.data.id)
      .select("slug")
      .maybeSingle();
    if (error) return dbFail(error);
    if (!data) return fail("Etkinlik bulunamadı.", "not_found");
    await revalidateEvents(data.slug);
    return ok(null, status === "published" ? "Etkinlik yayında." : status === "cancelled" ? "Etkinlik iptal edildi." : "Etkinlik taslağa alındı.");
  });
}

const reviewSchema = z.object({
  id: zId,
  approve: z.boolean(),
  reason: z.string().trim().max(300, "Gerekçe en fazla 300 karakter olabilir.").optional(),
});

/** Onayla / Reddet / Yayından kaldır (admin_review_event: sticky take-down, notifies the creator, audit log). */
export async function reviewEventAction(input: z.input<typeof reviewSchema>): Promise<ActionResult<{ status: string }>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = reviewSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { id, approve, reason } = parsed.data;
    if (!approve && !reason) return fail("Reddetmek için bir gerekçe seç.");
    const { data, error } = await supabase.rpc("admin_review_event", { p_event: id, p_approve: approve, ...(approve ? {} : { p_reason: reason }) });
    if (error) return dbFail(error);
    const res = data as { ok?: boolean; status?: string; slug?: string | null } | null;
    if (!res?.ok) return fail("Etkinlik bulunamadı.", "not_found");
    await revalidateEvents(res.slug);
    return ok({ status: res.status ?? "" }, approve ? "Etkinlik onaylandı, yayında." : "Etkinlik yayından kaldırıldı.");
  });
}

export async function deleteEventAction(input: { id: string }): Promise<ActionResult<null>> {
  return withAdmin(async ({ supabase }) => {
    const id = zId.safeParse(input.id);
    if (!id.success) return fail("Geçersiz etkinlik.");
    const { data, error } = await supabase.from("events").delete().eq("id", id.data).select("slug").maybeSingle();
    if (error) return dbFail(error);
    if (!data) return fail("Etkinlik bulunamadı.", "not_found");
    await revalidateEvents(data.slug);
    return ok(null, "Etkinlik silindi.");
  });
}
