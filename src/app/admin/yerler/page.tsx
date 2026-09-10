import type { Metadata } from "next";
import { AdminPlaceholder } from "@/components/admin/admin-page";

// Placeholder created by the app-shell agent; the admin agent replaces this page.
export const metadata: Metadata = { title: "Yerler" };

export default function Page() {
  return <AdminPlaceholder title="Yerler" description="Eczane, cami, durak ve gezilecek yer kayıtları." />;
}
