import type { Metadata } from "next";
import { AdminPlaceholder } from "@/components/admin/admin-page";

// Placeholder created by the app-shell agent; the admin agent replaces this page.
export const metadata: Metadata = { title: "İlan moderasyonu" };

export default function Page() {
  return <AdminPlaceholder title="İlan moderasyonu" description="Onay bekleyen ve işaretlenen ilanlar." />;
}
