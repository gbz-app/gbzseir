"use client";

/** Client pieces of the event page (/etkinlik/[slug]): owner state, the hero "⋯" menu, the date row and the text. */

import * as React from "react";
import Link from "next/link";
import { ChevronDown, EllipsisVertical, Flag, ListChecks, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useNow } from "@/components/shared/explore-header";
import { ReportSheet } from "@/components/shared/report-sheet";
import { useAuth } from "@/lib/auth/auth-provider";
import { useRequireAuth } from "@/lib/auth/hooks";
import { createClient } from "@/lib/supabase/client";
import { eventDateParts } from "../format";
import { parseEventStatus, type EventStatus } from "../status";

// ---------------------------------------------------------------------------
// Owner state: the creator of a user event, or the owner of the business of a business event.
// ---------------------------------------------------------------------------

type Ownership = { status: EventStatus; reason: string | null; businessEvent: boolean };

const OwnerContext = React.createContext<Ownership | null>(null);

/**
 * Looks up (signed-in viewers only, RLS-protected reads) whether the viewer owns this event, and its live status: the
 * page itself is cached (ISR), so a pending edit or a rejection shows here even before the cache expires.
 */
export function EventOwnerProvider({ eventId, children }: { eventId: string; children: React.ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = React.useState<{ key: string; value: Ownership | null } | null>(null);
  const key = user ? `${user.id}:${eventId}` : null;

  React.useEffect(() => {
    if (!user) return;
    let active = true;
    const supabase = createClient();
    (async () => {
      const { data } = await supabase.from("events").select("created_by,business_id,status,rejection_reason").eq("id", eventId).maybeSingle();
      if (!data) {
        if (active) setState({ key: `${user.id}:${eventId}`, value: null });
        return;
      }
      let owner = !data.business_id && data.created_by === user.id;
      if (data.business_id) {
        const { data: own } = await supabase.from("businesses").select("id").eq("id", data.business_id).eq("owner_id", user.id).maybeSingle();
        owner = !!own;
      }
      if (!active) return;
      setState({
        key: `${user.id}:${eventId}`,
        value: owner ? { status: parseEventStatus(data.status), reason: data.rejection_reason ?? null, businessEvent: !!data.business_id } : null,
      });
    })().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [user, eventId]);

  const value = key && state?.key === key ? state.value : null;
  return <OwnerContext.Provider value={value}>{children}</OwnerContext.Provider>;
}

/** Same look as the round translucent buttons of DetailHero. */
const OVERLAY_BUTTON =
  "flex size-11 shrink-0 items-center justify-center rounded-full border-0 bg-white/35 text-foreground shadow-none backdrop-blur-md transition-colors outline-none hover:bg-white/50 focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-black/35 dark:text-white dark:hover:bg-black/50";

const ITEM = "min-h-11 px-3 text-[15px]";

/** "⋯" on the hero: Düzenle / Etkinliklerim for the owner, Şikayet et for everyone else. */
export function EventHeroMenu({ eventId, title, className }: { eventId: string; title: string; className?: string }) {
  const own = React.useContext(OwnerContext);
  const ensureAuth = useRequireAuth();
  const [reportOpen, setReportOpen] = React.useState(false);

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Diğer seçenekler" className={cn(OVERLAY_BUTTON, className)}>
            <EllipsisVertical className="size-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {own ? (
            <>
              <DropdownMenuItem asChild className={ITEM}>
                <Link href={routes.events.create({ duzenle: eventId })}>
                  <Pencil /> Etkinliği düzenle
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className={ITEM}>
                <Link href={own.businessEvent ? routes.business.events() : routes.profile.events()}>
                  <ListChecks /> Etkinliklerim
                </Link>
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem
              variant="destructive"
              className={ITEM}
              onSelect={() => {
                if (!ensureAuth()) return;
                window.requestAnimationFrame(() => setReportOpen(true));
              }}
            >
              <Flag /> Şikayet et
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ReportSheet targetType="event" targetId={eventId} open={reportOpen} onOpenChange={setReportOpen} subject={title} />
    </>
  );
}

const OWNER_LINE: Record<EventStatus, { dot: string; text: string }> = {
  published: { dot: "bg-emerald-500", text: "Senin etkinliğin · Yayında" },
  pending_review: { dot: "bg-amber-500", text: "Değişikliklerin onay bekliyor" },
  rejected: { dot: "bg-red-500", text: "Reddedildi" },
  draft: { dot: "bg-muted-foreground", text: "Taslak · yayında değil" },
  cancelled: { dot: "bg-muted-foreground", text: "İptal edildi" },
};

/** One slim line under the title for the owner: live status (and the rejection reason) + "Düzenle". */
export function EventOwnerLine({ eventId }: { eventId: string }) {
  const own = React.useContext(OwnerContext);
  if (!own) return null;
  const line = OWNER_LINE[own.status];
  const text = own.status === "rejected" && own.reason ? `${line.text}: ${own.reason}` : line.text;
  return (
    <p className="mt-2 flex items-center gap-2 text-sm">
      <span className={cn("size-2 shrink-0 rounded-full", line.dot)} aria-hidden />
      <span className="min-w-0 truncate text-muted-foreground" title={text}>
        {text}
      </span>
      <Link href={routes.events.create({ duzenle: eventId })} className="shrink-0 rounded-md font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        Düzenle
      </Link>
    </p>
  );
}

/**
 * "Cumartesi, 14 Eylül" / "20:00 - 22:30". After mount the weekday becomes "Bugün" / "Yarın" when it applies (the
 * server HTML is cached, so the relative word is only decided in the browser).
 */
export function EventDateText({ starts, ends }: { starts: string; ends: string | null }) {
  const now = useNow();
  const { day, time } = eventDateParts(starts, ends, now);
  return (
    <>
      <span className="block text-[15px] leading-snug font-semibold">{day}</span>
      <span className="block text-sm text-muted-foreground">{time}</span>
    </>
  );
}

/**
 * The place row: scrolls to the map section (`targetId`) without adding a history entry, so the hero's back button
 * still leaves the page in one tap. The plain #hash stays as the no-JS fallback.
 */
export function EventPlaceLink({ targetId, children }: { targetId: string; children: React.ReactNode }) {
  return (
    <a
      href={`#${targetId}`}
      onClick={(ev) => {
        const el = document.getElementById(targetId);
        if (!el) return;
        ev.preventDefault();
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
        el.focus({ preventScroll: true });
      }}
      className="block rounded-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {children}
    </a>
  );
}

/** Long descriptions start clamped to 6 lines. Decided from the text, so the server HTML already matches. */
const LONG_CHARS = 300;
const LONG_LINES = 6;

/** The event description with "Devamını oku" (the full text is always in the HTML, only clipped visually). */
export function EventDescription({ text }: { text: string }) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const t = text.trim();
  const long = t.length > LONG_CHARS || t.split(/\n/).length > LONG_LINES;
  return (
    <div>
      <p id={id} className={cn("text-[15px] leading-relaxed whitespace-pre-line text-foreground/90", long && !open && "line-clamp-6")}>
        {t}
      </p>
      {long ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((v) => !v)}
          className="mt-1 -ml-1 inline-flex h-11 items-center gap-1 rounded-full px-1 text-[15px] font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {open ? "Daha az göster" : "Devamını oku"}
          <ChevronDown className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
