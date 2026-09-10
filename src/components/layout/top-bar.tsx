"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Search, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { initials } from "@/core/format";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { LocationChip } from "@/components/shared/location-chip";
import { useAuth } from "@/lib/auth/auth-provider";
import { useUnreadNotifications } from "@/lib/notifications/use-unread-notifications";
import { TOPBAR_PATHS } from "./nav-config";
import { useScrolled } from "./nav-visibility";

const ROUND_BUTTON =
  "relative flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground shadow-soft ring-1 ring-foreground/[0.06] transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

function NotificationBell() {
  const { count } = useUnreadNotifications();
  const label = count > 0 ? `Bildirimler, ${count} okunmamış` : "Bildirimler";
  return (
    <Link href={routes.profile.notifications()} aria-label={label} className={ROUND_BUTTON}>
      <Bell className="size-5" strokeWidth={1.75} />
      {count > 0 ? <span className="absolute top-2.5 right-2.5 size-2.5 rounded-full bg-primary ring-2 ring-card" aria-hidden /> : null}
    </Link>
  );
}

/** Top bar of the 5 tab roots: avatar + bell + search on the left, location pill on the right. Other pages use <PageHeader/>. */
export function TopBar() {
  const pathname = usePathname();
  const { user, profile } = useAuth();
  const scrolled = useScrolled(4);
  if (!TOPBAR_PATHS.includes(pathname)) return null;

  return (
    <header className={cn("sticky top-0 z-40 pt-safe transition-[background-color,box-shadow] duration-200", scrolled && "bg-background/80 shadow-soft backdrop-blur-md")}>
      <div className="flex h-(--topbar-h) items-center gap-2 px-4">
        <Link
          href={user ? routes.profile.root() : routes.auth.login(pathname)}
          aria-label={user ? "Profilim" : "Giriş yap"}
          className="shrink-0 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Avatar className="size-11 shadow-soft ring-2 ring-card">
            {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
            <AvatarFallback className="bg-brand-soft text-sm font-semibold text-primary">
              {user && profile?.full_name ? initials(profile.full_name) : <UserRound className="size-5" strokeWidth={1.75} aria-hidden />}
            </AvatarFallback>
          </Avatar>
        </Link>
        {user ? <NotificationBell /> : null}
        <Link href={routes.search()} aria-label="Ara" className={ROUND_BUTTON}>
          <Search className="size-5" strokeWidth={1.75} />
        </Link>
        <LocationChip className="ml-auto" />
      </div>
    </header>
  );
}
