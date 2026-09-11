import { NextResponse } from "next/server";
import { IS_ADMIN_SITE } from "@/config/app-mode";
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
  /** Uploaded receipt / invoice in private-docs. */
  document_path: string | null;
  /** Legacy free-text link. */
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
/**
 * Free-text cell. Excel runs a value starting with = + - @ TAB or CR as a formula even when it is quoted, and a business
 * owner controls the business name, so such values get a leading apostrophe. Only for text columns: amounts keep their "-".
 */
const text = (v: string | null | undefined) => {
  const s = v ?? "";
  return cell(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
};

/** GET /admin/muhasebe/csv?bas=YYYY-MM-DD&bit=YYYY-MM-DD: Excel-friendly CSV (UTF-8 BOM, ";" separated, decimal comma). */
export async function GET(req: Request) {
  if (!IS_ADMIN_SITE) return new NextResponse("Bulunamadı", { status: 404 });
  const user = await getCurrentUser();
  const profile = user ? await getProfile() : null;
  if (!user || profile?.role !== "admin") return new NextResponse("Bulunamadı", { status: 404 });

  const sp = new URL(req.url).searchParams;
  const { from, to } = periodRange("ozel", { from: sp.get("bas") ?? undefined, to: sp.get("bit") ?? undefined });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("finance_entries")
    .select("occurred_on,kind,amount,vat_rate,description,counterparty,payment_method,document_path,document_url,finance_categories(name),businesses(name)")
    .gte("occurred_on", from)
    .lte("occurred_on", to)
    .order("occurred_on")
    .limit(20000);
  if (error) return new NextResponse("Veriler alınamadı", { status: 500 });

  const header = ["Tarih", "Tür", "Kategori", "Açıklama", "Karşı taraf", "İşletme", "Ödeme", "Tutar (KDV dahil)", "KDV %", "KDV tutarı", "KDV hariç", "Fiş/fatura", "Belge bağlantısı"];
  const lines = ((data ?? []) as unknown as Row[]).map((r) => {
    const amount = Number(r.amount);
    const rate = Number(r.vat_rate);
    const vat = (amount * rate) / (100 + rate);
    const sign = r.kind === "income" ? 1 : -1;
    return [
      cell(r.occurred_on),
      cell(r.kind === "income" ? "Gelir" : "Gider"),
      text(r.finance_categories?.name),
      text(r.description),
      text(r.counterparty),
      text(r.businesses?.name),
      text(PAY[r.payment_method] ?? r.payment_method),
      cell(num(sign * amount)),
      cell(num(rate)),
      cell(num(sign * vat)),
      cell(num(sign * (amount - vat))),
      cell(r.document_path ? "Var" : "Yok"),
      text(r.document_url),
    ].join(";");
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
