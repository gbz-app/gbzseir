import "server-only";
import { getMyBusinesses, getRememberedBusinessId } from "@/lib/auth/server";
import type { BusinessSummary } from "@/lib/types";

export type ServiceBusinessGate =
  | { ok: true; business: BusinessSummary }
  | { ok: false; reason: "no_business" | "not_approved" | "not_service"; business: BusinessSummary | null };

const isService = (b: BusinessSummary) => ((b.kinds ?? []) as string[]).includes("service");

/**
 * The caller's approved service business (H4/H5 guard; call after requireAuth). An owner can have several
 * businesses: the active one wins when it is an approved service firm, else the first approved service firm.
 */
export async function getServiceBusiness(): Promise<ServiceBusinessGate> {
  const list = await getMyBusinesses();
  if (list.length === 0) return { ok: false, reason: "no_business", business: null };
  const approved = list.filter((b) => b.status === "approved");
  if (approved.length === 0) return { ok: false, reason: "not_approved", business: list[0] };
  const remembered = await getRememberedBusinessId();
  const service = approved.find((b) => b.id === remembered && isService(b)) ?? approved.find(isService);
  if (!service) return { ok: false, reason: "not_service", business: approved[0] };
  return { ok: true, business: service };
}

export const SERVICE_GATE_COPY: Record<Exclude<ServiceBusinessGate, { ok: true }>["reason"], { title: string; description: string }> = {
  no_business: {
    title: "Hizmet talepleri işletmeler içindir",
    description: "Gebze'de hizmet veriyorsan ücretsiz işletme hesabı aç; bölgendeki müşteri talepleri buraya düşsün.",
  },
  not_approved: {
    title: "İşletme hesabın şu an kapalı",
    description: "İşletmen yayında olduğunda bölgendeki hizmet talepleri burada görünür. Durumunu işletme panelinden görebilirsin.",
  },
  not_service: {
    title: "İşletmen hizmet vermiyor görünüyor",
    description: "Talepleri almak için işletme bilgilerinde 'Hizmet veriyorum' seçeneğini ve hizmet kategorilerini eklemelisin.",
  },
};
