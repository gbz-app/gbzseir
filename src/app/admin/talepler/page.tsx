import type { Metadata } from "next";
import { AdminPlaceholder } from "@/components/admin/admin-page";

// Placeholder created by the app-shell agent; the admin agent replaces this page.
export const metadata: Metadata = { title: "Hizmet talepleri" };

export default function Page() {
  return <AdminPlaceholder title="Hizmet talepleri" description="Concierge modu: talepleri eşleştir ve gönder." />;
}
