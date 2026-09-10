"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/config/site";
import { routes } from "@/core/routes";
import { Button } from "@/components/ui/button";
import { LocationChip } from "@/components/shared/location-chip";
import { useAuth } from "@/lib/auth/auth-provider";
import { useUnreadNotifications } from "@/lib/notifications/use-unread-notifications";
import { TOPBAR_PATHS } from "./nav-config";
import { useScrolled } from "./nav-visibility";

function NotificationBell() {
  const { count } = useUnreadNotifications();
  const label = count > 0 ? `Bildirimler, ${count} okunmamış` : "Bildirimler";
  return (
    <Button asChild variant="ghost" size="icon" className="relative size-11 rounded-full">
      <Link href={routes.profile.notifications()} aria-label={label}>
        <Bell className="size-5" />
        {count > 0 ? (
          <span className="absolute top-1.5 right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-none font-bold text-white ring-2 ring-background">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </Link>
    </Button>
  );
}

/** App top bar for the 5 main tab pages. Other pages use <PageHeader/>. */
export function TopBar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const scrolled = useScrolled(4);
  if (!TOPBAR_PATHS.includes(pathname)) return null;

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-transparent bg-background/85 pt-safe backdrop-blur-md transition-[box-shadow,border-color] duration-200",
        scrolled && "border-border shadow-soft",
      )}
    >
      <div className="flex h-(--topbar-h) items-center gap-1.5 px-4">
        <Link href={routes.home()} aria-label={`${APP_NAME} ana sayfa`} className="flex min-w-0 items-center rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <span className="truncate font-heading text-xl font-bold tracking-tight">{APP_NAME}</span>
        </Link>
        <div className="ml-auto flex min-w-0 items-center gap-0.5">
          <LocationChip />
          <Button asChild variant="ghost" size="icon" className="size-11 rounded-full">
            <Link href={routes.search()} aria-label="Ara">
              <Search className="size-5" />
            </Link>
          </Button>
          {user ? <NotificationBell /> : null}
        </div>
      </div>
    </header>
  );
}
