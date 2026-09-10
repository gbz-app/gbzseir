import { NextResponse } from "next/server";
import { getCurrentUser, getProfile } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { periodRange } from "@/features/admin/lib/finance-period";

export const dynamic = "force-dynamic";

type Row = {
  occurred_on: string;
  kind: string;
  amount: number | string;
  vat_rate: number | string;
  description: string | null;
  counterparty: string | null;
  payment_method: string;
  document_url: string | null;
  finance_categories: { name: string } | null;
  businesses: { name: string } | null;
};

const PAY: Record<string, string> = { nakit: "Nakit", havale: "Havale/EFT", kart: "Kart", diger: "Diğer" };
const num = (v: number) => v.toFixed(2).replace(".", ",");
const cell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** GET /admin/muhasebe/csv?bas=YYYY-MM-DD&bit=YYYY-MM-DD: Excel-friendly CSV (UTF-8 BOM, ";" separated, decimal comma). */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  const profile = user ? await getProfile() : null;
  if (!user || profile?.role !== "admin") return new NextResponse("Bulunamadı", { status: 404 });

  const sp = new URL(req.url).searchParams;
  const { from, to } = periodRange("ozel", { from: sp.get("bas") ?? undefined, to: sp.get("bit") ?? undefined });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("finance_entries")
    .select("occurred_on,kind,amount,vat_rate,description,counterparty,payment_method,document_url,finance_categories(name),businesses(name)")
    .gte("occurred_on", from)
    .lte("occurred_on", to)
    .order("occurred_on")
    .limit(20000);
  if (error) return new NextResponse("Veriler alınamadı", { status: 500 });

  const header = ["Tarih", "Tür", "Kategori", "Açıklama", "Karşı taraf", "İşletme", "Ödeme", "Tutar (KDV dahil)", "KDV %", "KDV tutarı", "KDV hariç", "Belge"];
  const lines = ((data ?? []) as unknown as Row[]).map((r) => {
    const amount = Number(r.amount);
    const rate = Number(r.vat_rate);
    const vat = (amount * rate) / (100 + rate);
    const sign = r.kind === "income" ? 1 : -1;
    return [
      r.occurred_on,
      r.kind === "income" ? "Gelir" : "Gider",
      r.finance_categories?.name ?? "",
      r.description ?? "",
      r.counterparty ?? "",
      r.businesses?.name ?? "",
      PAY[r.payment_method] ?? r.payment_method,
      num(sign * amount),
      num(rate),
      num(sign * vat),
      num(sign * (amount - vat)),
      r.document_url ?? "",
    ]
      .map(cell)
      .join(";");
  });
  const csv = `﻿${header.join(";")}\r\n${lines.join("\r\n")}\r\n`;
  return new NextResponse(csv.charCodeAt(0) === 0xfeff ? csv : `﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="muhasebe-${from}_${to}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
