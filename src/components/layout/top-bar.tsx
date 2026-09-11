"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, UserRound } from "lucide-react";
import { routes } from "@/core/routes";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth/auth-provider";
import { useUnreadNotifications } from "@/lib/notifications/use-unread-notifications";
import { WeatherButton } from "@/features/weather/components/weather-sheet";

/** Home header buttons: plain white circles, no border or shadow. */
const BARE_BUTTON =
  "relative flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

/** Istanbul-time greeting: Günaydın (05-12), İyi günler (12-18), İyi akşamlar (18-22), İyi geceler. */
function greetingFor(date: Date): string {
  const hour = Number(new Intl.DateTimeFormat("tr-TR", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Istanbul" }).format(date));
  if (hour >= 5 && hour < 12) return "Günaydın";
  if (hour >= 12 && hour < 18) return "İyi günler";
  if (hour >= 18 && hour < 22) return "İyi akşamlar";
  return "İyi geceler";
}

/** Greeting that is correct after hydration (the home page HTML is cached) and follows the clock. */
function useGreeting(): string {
  const [greeting, setGreeting] = React.useState(() => greetingFor(new Date()));
  React.useEffect(() => {
    const update = () => setGreeting(greetingFor(new Date()));
    const first = window.setTimeout(update, 0);
    const timer = window.setInterval(update, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, []);
  return greeting;
}

function NotificationBell() {
  const { count } = useUnreadNotifications();
  const label = count > 0 ? `Bildirimler, ${count} okunmamış` : "Bildirimler";
  return (
    <Link href={routes.profile.notifications()} aria-label={label} className={BARE_BUTTON}>
      <Bell className="size-5" strokeWidth={1.75} />
      {count > 0 ? <span className="absolute top-2.5 right-2.5 size-2.5 rounded-full bg-primary ring-2 ring-card" aria-hidden /> : null}
    </Link>
  );
}

/** Home avatar: the profile photo, or a plain white circle (no initials, no border). */
function HomeAvatar() {
  const { profile } = useAuth();
  return (
    <Avatar className="size-11">
      {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
      <AvatarFallback className="bg-card text-foreground/70">
        <UserRound className="size-5" strokeWidth={1.75} aria-hidden />
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * Home page header: avatar + time-based greeting / name on the left, weather and notifications on the right; it scrolls
 * away with the page. Rendered by the home page itself (not the shared layout), so the server HTML always contains it.
 */
export function TopBar() {
  const { user, profile } = useAuth();
  const greeting = useGreeting();
  const profileHref = user ? routes.profile.root() : routes.auth.login(routes.home());

  return (
    <header className="pt-safe">
      <div className="mt-[5px] flex h-(--topbar-h) items-center gap-3 px-4">
        <Link
          href={profileHref}
          aria-label={user ? "Profilim" : "Giriş yap"}
          className="flex min-w-0 items-center gap-3 rounded-full pr-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <HomeAvatar />
          <span className="min-w-0">
            <span className="block text-sm text-muted-foreground" suppressHydrationWarning>
              {greeting}
            </span>
            <span className="block truncate text-[17px] leading-tight font-semibold">{user ? profile?.full_name || "Hoş geldin" : "Giriş yap"}</span>
          </span>
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <WeatherButton className="shadow-none ring-0" />
          {user ? (
            <NotificationBell />
          ) : (
            <Link href={profileHref} aria-label="Bildirimler için giriş yap" className={BARE_BUTTON}>
              <Bell className="size-5" strokeWidth={1.75} />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
