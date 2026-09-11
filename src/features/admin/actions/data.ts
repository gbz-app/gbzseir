"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { revalidatePublic } from "@/lib/revalidate-public";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue } from "../lib/zod";

const RPC_SCOPES = ["listings", "reviews", "announcements", "requests", "businesses", "duty", "poi", "users"] as const;
const EXTRA_SCOPES = ["events", "finance"] as const;
const schema = z.object({ scopes: z.array(z.enum([...RPC_SCOPES, ...EXTRA_SCOPES])).min(1, "Temizlenecek veri türü seç."), confirm: z.literal("SİL", { message: "Onay için SİL yaz." }) });

/** Removes rows marked as demo (never real data). Events and finance demo rows are removed here, the rest by the RPC. */
export async function clearDemoDataAction(input: z.input<typeof schema>): Promise<ActionResult<Record<string, number>>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = schema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const scopes = parsed.data.scopes;
    const out: Record<string, number> = {};
    if (scopes.includes("events")) {
      const { data, error } = await supabase.from("events").delete().eq("is_demo", true).select("id");
      if (error) return dbFail(error);
      out.events = data?.length ?? 0;
    }
    if (scopes.includes("finance")) {
      const { data, error } = await supabase.from("finance_entries").delete().eq("is_demo", true).select("id");
      if (error) return dbFail(error);
      out.finance = data?.length ?? 0;
    }
    const rpcScopes = scopes.filter((s): s is (typeof RPC_SCOPES)[number] => (RPC_SCOPES as readonly string[]).includes(s));
    if (rpcScopes.length) {
      const { data, error } = await supabase.rpc("admin_clear_demo_data", { p_scopes: rpcScopes });
      if (error) return dbFail(error);
      Object.assign(out, ((data as { deleted?: Record<string, number> } | null)?.deleted ?? {}) as Record<string, number>);
    }
    await revalidatePublic({
      tags: ["businesses", "content:announcements", "content:news", "poi", "nearby", "duty", "listings", "listing-categories", "services"],
      paths: [{ path: "/", type: "layout" }],
    });
    revalidatePath(routes.admin.data());
    const total = Object.values(out).reduce((a, b) => a + b, 0);
    return ok(out, `${total} örnek kayıt silindi.`);
  });
}
