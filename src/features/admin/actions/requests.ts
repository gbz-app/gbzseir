"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routes } from "@/core/routes";
import { parseFlowSchema, summarizeAnswers, type FlowAnswers } from "@/core/flow";
import { dbFail, withAdmin } from "../server/guard";
import { fail, ok, type ActionResult } from "../lib/action-result";
import { firstIssue, zId } from "../lib/zod";
import type { DispatchResult, RequestDetail } from "../lib/request-types";

const DISPATCHABLE = ["admin_review", "open", "no_match"];

/** Drawer data: answers resolved with the request's own flow version, leads, and match candidates. */
export async function getRequestDetailAction(input: { requestId: string }): Promise<ActionResult<RequestDetail>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = z.object({ requestId: zId }).safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { data: r, error } = await supabase
      .from("service_requests")
      .select(
        "id,public_code,status,created_at,closed_at,when_type,when_date,note,address_note,photos,hide_phone,accepted_count,max_providers,dispatch_note,is_demo,answers,flow_id,category_id," +
          "customer:profiles!service_requests_customer_id_fkey(id,full_name,phone,status),neighbourhoods(name)," +
          "leads(id,status,wave_no,match_score,offer_price_try,offer_note,seen_at,accepted_at,created_at,businesses(id,name,slug,phone))",
      )
      .eq("id", parsed.data.requestId)
      .maybeSingle();
    if (error) return dbFail(error);
    if (!r) return fail("Talep bulunamadı.", "not_found");
    const row = r as unknown as {
      id: string;
      public_code: string;
      status: string;
      created_at: string;
      closed_at: string | null;
      when_type: string;
      when_date: string | null;
      note: string | null;
      address_note: string | null;
      photos: string[];
      hide_phone: boolean;
      accepted_count: number;
      max_providers: number;
      dispatch_note: string | null;
      is_demo: boolean;
      answers: unknown;
      flow_id: string | null;
      category_id: string;
      customer: { id: string; full_name: string | null; phone: string | null; status: string } | null;
      neighbourhoods: { name: string } | null;
      leads: Array<{
        id: string;
        status: string;
        wave_no: number;
        match_score: number | null;
        offer_price_try: number | null;
        offer_note: string | null;
        seen_at: string | null;
        accepted_at: string | null;
        created_at: string;
        businesses: { id: string; name: string; slug: string; phone: string | null } | null;
      }>;
    };

    const canDispatch = DISPATCHABLE.includes(row.status);
    const [{ data: cat }, flowRes, candRes] = await Promise.all([
      supabase.from("service_categories").select("id,name,parent_id,auto_dispatch,notify_pool_size").eq("id", row.category_id).maybeSingle(),
      row.flow_id ? supabase.from("question_flows").select("version,schema").eq("id", row.flow_id).maybeSingle() : Promise.resolve({ data: null }),
      canDispatch ? supabase.rpc("admin_request_candidates", { p_request_id: row.id }) : Promise.resolve({ data: null, error: null }),
    ]);
    let parentName: string | null = null;
    if (cat?.parent_id) {
      const { data: parent } = await supabase.from("service_categories").select("name").eq("id", cat.parent_id).maybeSingle();
      parentName = parent?.name ?? null;
    }

    const rawAnswers = (row.answers && typeof row.answers === "object" && !Array.isArray(row.answers) ? row.answers : {}) as FlowAnswers;
    let answers: Array<{ title: string; answer: string }> = [];
    const flow = flowRes.data as { version: number; schema: unknown } | null;
    try {
      if (!flow) throw new Error("no flow");
      answers = summarizeAnswers(parseFlowSchema(flow.schema), rawAnswers).map((a) => ({ title: a.title, answer: a.answer }));
    } catch {
      answers = Object.entries(rawAnswers).map(([k, v]) => ({ title: k, answer: Array.isArray(v) ? v.join(", ") : String(v ?? "") }));
    }

    const media = supabase.storage.from("media");
    const photos = (row.photos ?? []).map((p) => (/^https?:\/\//.test(p) ? p : media.getPublicUrl(p).data.publicUrl));
    const leads = [...(row.leads ?? [])].sort((a, b) => a.wave_no - b.wave_no || a.created_at.localeCompare(b.created_at));
    const candidates = (candRes.data as Array<{ business_id: string; business_name: string; area_match: boolean; score: number }> | null) ?? null;

    return ok({
      id: row.id,
      code: row.public_code,
      status: row.status,
      createdAt: row.created_at,
      closedAt: row.closed_at,
      whenType: row.when_type,
      whenDate: row.when_date,
      note: row.note,
      addressNote: row.address_note,
      photos,
      hidePhone: row.hide_phone,
      acceptedCount: row.accepted_count,
      maxProviders: row.max_providers,
      dispatchNote: row.dispatch_note,
      isDemo: row.is_demo,
      category: {
        id: row.category_id,
        name: cat?.name ?? "Kategori",
        parentName,
        autoDispatch: !!cat?.auto_dispatch,
        notifyPoolSize: cat?.notify_pool_size ?? 8,
      },
      neighbourhood: row.neighbourhoods?.name ?? null,
      customer: row.customer ? { id: row.customer.id, name: row.customer.full_name, phone: row.customer.phone, status: row.customer.status } : null,
      flowVersion: flow?.version ?? null,
      answers,
      leads: leads.map((l) => ({
        id: l.id,
        status: l.status,
        waveNo: l.wave_no,
        matchScore: l.match_score,
        offerPrice: l.offer_price_try,
        offerNote: l.offer_note,
        seenAt: l.seen_at,
        acceptedAt: l.accepted_at,
        createdAt: l.created_at,
        business: l.businesses,
      })),
      candidates: candidates
        ? candidates.map((c) => ({ businessId: c.business_id, name: c.business_name, areaMatch: c.area_match, score: Number(c.score) }))
        : null,
      canDispatch,
      nextWave: leads.reduce((m, l) => Math.max(m, l.wave_no), 0) + 1,
    });
  });
}

const dispatchSchema = z.object({
  requestId: zId,
  businessIds: z.array(zId).max(50, "En fazla 50 firma seçebilirsin.").optional(),
});

/** "Eşleştir ve gönder": dispatch_request as the next wave, optionally to hand-picked firms. */
export async function dispatchRequestAction(input: z.input<typeof dispatchSchema>): Promise<ActionResult<DispatchResult>> {
  return withAdmin(async ({ supabase }) => {
    const parsed = dispatchSchema.safeParse(input);
    if (!parsed.success) return fail(firstIssue(parsed.error));
    const { requestId, businessIds } = parsed.data;
    const { data: waves } = await supabase.from("leads").select("wave_no").eq("request_id", requestId).order("wave_no", { ascending: false }).limit(1);
    const wave = (waves?.[0]?.wave_no ?? 0) + 1;
    const { data, error } = await supabase.rpc("dispatch_request", {
      p_request_id: requestId,
      p_wave: wave,
      ...(businessIds && businessIds.length ? { p_business_ids: businessIds } : {}),
    });
    if (error) return dbFail(error);
    const res = data as { ok?: boolean; reason?: string; lead_count?: number; total_leads?: number; fallback?: boolean; status?: string } | null;
    if (!res?.ok) {
      return fail(res?.reason === "closed" ? "Bu talep artık gönderilemez (kapanmış ya da dolmuş)." : "Talep bulunamadı.", res?.reason ?? "failed");
    }
    revalidatePath(routes.admin.requests());
    revalidatePath(routes.admin.root());
    const result: DispatchResult = {
      leadCount: res.lead_count ?? 0,
      totalLeads: res.total_leads ?? 0,
      fallback: !!res.fallback,
      status: res.status ?? "",
    };
    const message =
      result.leadCount > 0
        ? `${result.leadCount} firmaya gönderildi${result.fallback ? " (mahallede firma olmadığı için tüm Gebze'ye)" : ""}.`
        : result.status === "no_match"
          ? "Uygun firma bulunamadı; talep 'Eşleşme yok' durumunda."
          : "Yeni firma bulunamadı; talep daha önce gönderilen firmalarda.";
    return ok(result, message);
  });
}
