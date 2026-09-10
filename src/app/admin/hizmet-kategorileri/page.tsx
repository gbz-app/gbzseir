import type { Metadata } from "next";
import { AdminPlaceholder } from "@/components/admin/admin-page";

// Placeholder created by the app-shell agent; the admin agent replaces this page.
export const metadata: Metadata = { title: "Hizmet kategorileri" };

export default function Page() {
  return <AdminPlaceholder title="Hizmet kategorileri" description="Kategoriler, soru akışları ve otomatik eşleştirme ayarı." />;
}
