import type { Metadata } from "next";
import { LegalPage, legalMetadata } from "@/features/legal/legal-page";

// Latest published version (ISR); admin publishes expire this path.
export const revalidate = 3600;
export const metadata: Metadata = legalMetadata("gizlilik");

export default function Page() {
  return <LegalPage slug="gizlilik" />;
}
