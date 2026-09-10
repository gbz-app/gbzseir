import { Megaphone } from "lucide-react";
import { getAppSettings } from "@/lib/app-settings";

/** Admin-controlled banner (Ayarlar > Duyuru bandı). Renders nothing when the text is empty. */
export async function AnnouncementBanner() {
  const { maintenanceBanner } = await getAppSettings();
  if (!maintenanceBanner) return null;
  return (
    <div role="status" className="mx-4 mt-2 flex items-start gap-2.5 rounded-2xl bg-amber-100 px-3.5 py-2.5 text-sm text-amber-950 ring-1 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-100 dark:ring-amber-500/25">
      <Megaphone className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="min-w-0">{maintenanceBanner}</p>
    </div>
  );
}
