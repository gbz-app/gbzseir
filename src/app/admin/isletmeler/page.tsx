import type { Metadata } from "next";
import { AdminPlaceholder } from "@/components/admin/admin-page";

// Placeholder created by the app-shell agent; the admin agent replaces this page.
export const metadata: Metadata = { title: "İşletme başvuruları" };

export default function Page() {
  return <AdminPlaceholder title="İşletme başvuruları" description="Başvuruları incele, onayla ya da reddet." />;
}
