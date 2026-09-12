import { redirect } from "next/navigation";
import { routes } from "@/core/routes";

/**
 * The separate duty list page is gone (owner, 12.09): Keşfet's Eczane tab with "Nöbetçi" selected is the duty list.
 * Old links, the app shortcut and bookmarks land there.
 */
export default function DutyPharmaciesPage() {
  redirect(routes.nearby.root("nobetci"));
}
