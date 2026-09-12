"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, CloudSun } from "lucide-react";
import { routes } from "@/core/routes";
import { nameWords } from "@/core/name";
import { istanbulParts } from "@/core/time";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth/auth-provider";
import { useUnreadNotifications } from "@/lib/notifications/use-unread-notifications";
import { useIsClient } from "@/lib/use-is-client";
import { WeatherButton } from "@/features/weather/components/weather-sheet";

/** Home header buttons: plain white circles, no border or shadow. */
const BARE_BUTTON =
  "relative flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50";

/** Stroke of the header icons (weather, notifications): a notch bolder than the 1.75 used elsewhere in the app. */
const ICON_STROKE = 2.25;

/** Greeting of an Istanbul hour: 05-12 Günaydın, 12-18 İyi günler, 18-22 İyi akşamlar, else İyi geceler. */
function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Günaydın";
  if (hour >= 12 && hour < 18) return "İyi günler";
  if (hour >= 18 && hour < 22) return "İyi akşamlar";
  return "İyi geceler";
}

/**
 * False on the server, during hydration and in the commit that mounts the page; true once the page has painted
 * (a frame, then a task). Used to mount the weather sheet late: its drawer (vaul) reads window.scrollY while mounting,
 * and on history.back() that read forced a synchronous style + layout of the whole freshly inserted home page inside
 * the navigation commit (about 1 s at 4x CPU throttling in a trace, against about 0.15 s when the browser does the
 * same work in its normal frame).
 */
function usePainted(): boolean {
  const [painted, setPainted] = React.useState(false);
  React.useEffect(() => {
    let timer = 0;
    const frame = window.requestAnimationFrame(() => {
      timer = window.setTimeout(() => setPainted(true), 0);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);
  return painted;
}

/** Same size and look as WeatherButton before its data arrives (icon only), shown until the page has painted. */
function WeatherPlaceholder() {
  return (
    <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-foreground">
      <CloudSun className="size-5" strokeWidth={ICON_STROKE} />
    </span>
  );
}

function NotificationBell() {
  const { count } = useUnreadNotifications();
  const label = count > 0 ? `Bildirimler, ${count} okunmamış` : "Bildirimler";
  return (
    <Link href={routes.profile.notifications()} aria-label={label} className={BARE_BUTTON}>
      <Bell className="size-5" strokeWidth={ICON_STROKE} />
      {count > 0 ? <span className="absolute top-2.5 right-2.5 size-2.5 rounded-full bg-primary ring-2 ring-card" aria-hidden /> : null}
    </Link>
  );
}

/** Home avatar: the profile photo, or just a plain card-coloured circle (no icon, no initials, no outline). */
function HomeAvatar() {
  const { profile } = useAuth();
  return (
    <Avatar className="size-11 after:hidden">
      {profile?.avatar_url ? <AvatarImage src={profile.avatar_url} alt="" /> : null}
      <AvatarFallback className="bg-card" />
    </Avatar>
  );
}

/**
 * Home page header: signed in, avatar + first name on the left; a guest gets no avatar, just the greeting of the hour
 * (Günaydın / İyi günler / İyi akşamlar / İyi geceler) over "Misafir", which opens sign-in. Weather and notifications
 * on the right; it scrolls away with the page. Rendered by the home page itself (not the shared layout), so the server
 * HTML always contains it. The greeting is worked out in the browser (the cached HTML can be minutes old).
 */
export function TopBar() {
  const { user, profile, profileLoading } = useAuth();
  const painted = usePainted();
  const isClient = useIsClient();
  const profileHref = user ? routes.profile.root() : routes.auth.login(routes.home());
  // First word of the profile name ("Ahmet Yılmaz" -> "Ahmet"); left empty while the profile loads so "Profilim" doesn't flash.
  const first = nameWords(profile?.full_name)[0];
  const name = first ?? (profileLoading ? "" : "Profilim");
  const greeting = isClient ? greetingFor(istanbulParts().hour) : "Merhaba";

  return (
    <header className="pt-safe">
      <div className="mt-[5px] flex h-(--topbar-h) items-center gap-3 px-4">
        {user ? (
          // The visible name leads the accessible name (WCAG 2.5.3): "Ahmet, profilim".
          <Link
            href={profileHref}
            aria-label={first ? `${first}, profilim` : "Profilim"}
            className="flex min-w-0 items-center gap-3 rounded-full pr-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <HomeAvatar />
            <span className="truncate text-[19px] leading-tight font-semibold tracking-tight">{name}</span>
          </Link>
        ) : (
          <Link
            href={profileHref}
            aria-label={`${greeting}, Misafir. Giriş yap`}
            className="flex min-w-0 flex-col rounded-2xl pr-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="truncate text-[13px] leading-tight font-medium text-muted-foreground">{greeting}</span>
            <span className="truncate text-[19px] leading-tight font-semibold tracking-tight">Misafir</span>
          </Link>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {painted ? <WeatherButton className={BARE_BUTTON} /> : <WeatherPlaceholder />}
          {user ? (
            <NotificationBell />
          ) : (
            <Link href={profileHref} aria-label="Bildirimler için giriş yap" className={BARE_BUTTON}>
              <Bell className="size-5" strokeWidth={ICON_STROKE} />
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
