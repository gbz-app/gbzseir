import "server-only";
import { getMyBusinesses } from "@/lib/auth/server";
import type { BusinessSummary } from "@/lib/types";

export type ServiceBusinessGate =
  | { ok: true; business: BusinessSummary }
  | { ok: false; reason: "no_business" | "not_approved" | "not_service"; business: BusinessSummary | null };

/** The caller's approved business whose kinds include 'service' (H4/H5 guard; call after requireAuth). */
export async function getServiceBusiness(): Promise<ServiceBusinessGate> {
  const list = await getMyBusinesses();
  if (list.length === 0) return { ok: false, reason: "no_business", business: null };
  const approved = list.find((b) => b.status === "approved");
  if (!approved) return { ok: false, reason: "not_approved", business: list[0] };
  const kinds = (approved.kinds ?? []) as string[];
  if (!kinds.includes("service")) return { ok: false, reason: "not_service", business: approved };
  return { ok: true, business: approved };
}

export const SERVICE_GATE_COPY: Record<Exclude<ServiceBusinessGate, { ok: true }>["reason"], { title: string; description: string }> = {
  no_business: {
    title: "Hizmet talepleri işletmeler içindir",
    description: "Gebze'de hizmet veriyorsan ücretsiz işletme hesabı aç; bölgendeki müşteri talepleri buraya düşsün.",
  },
  not_approved: {
    title: "İşletmen henüz onaylanmadı",
    description: "Başvurun onaylandığında bölgendeki hizmet talepleri burada görünecek. Durumunu işletme panelinden takip edebilirsin.",
  },
  not_service: {
    title: "İşletmen hizmet vermiyor görünüyor",
    description: "Talepleri almak için işletme bilgilerinde 'Hizmet veriyorum' seçeneğini ve hizmet kategorilerini eklemelisin.",
  },
};
