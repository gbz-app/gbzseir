import type { Metadata } from "next";
import { AdminPlaceholder } from "@/components/admin/admin-page";

// Placeholder created by the app-shell agent; the admin agent replaces this page.
export const metadata: Metadata = { title: "Genel bakış" };

export default function Page() {
  return <AdminPlaceholder title="Genel bakış" description="Bekleyen işler, istatistikler ve kısayollar." />;
}
