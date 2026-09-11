"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { Bell, CheckCheck, ClipboardList, Loader2, Star, Store, Tag, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { ProfilePageHeader } from "@/components/shared/profile-page-header";
import { createClient } from "@/lib/supabase/client";
import {
  adjustUnreadNotifications,
  refreshUnreadNotifications,
  useUnreadNotifications,
} from "@/lib/notifications/use-unread-notifications";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

function iconFor(type: string): LucideIcon {
  if (type.includes("lead") || type.includes("request") || type.includes("talep")) return ClipboardList;
  if (type.includes("listing") || type.includes("ilan")) return Tag;
  if (type.includes("business") || type.includes("isletme")) return Store;
  if (type.includes("review")) return Star;
  return Bell;
}

function timeAgo(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatDistanceToNow(d, { addSuffix: true, locale: tr });
}

/**
 * G7 - Bildirimler: header with "Tümünü okundu yap", unread first highlight; tap marks as read and opens the link.
 * Every change also updates useUnreadNotifications() so the home bell, the profile badge and the bottom-nav dot follow.
 */
export function NotificationsList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const { count } = useUnreadNotifications();
  const [readIds, setReadIds] = React.useState<Set<string>>(() => new Set());
  const [markingAll, setMarkingAll] = React.useState(false);
  const markAllRef = React.useRef<HTMLButtonElement>(null);
  const statusRef = React.useRef<HTMLParagraphElement>(null);
  const isUnread = (n: NotificationItem) => !n.read_at && !readIds.has(n.id);
  const loadedUnread = items.filter(isUnread).length;
  // The counter also sees unread rows beyond the 100 loaded ones; loaded rows cover the moment before it answers.
  const unread = Math.max(count, loadedUnread);

  // Opening the page syncs the bell, the badge and the nav dot with what the list shows.
  React.useEffect(() => {
    refreshUnreadNotifications();
  }, []);

  const unmark = (ids: string[]) =>
    setReadIds((s) => {
      const next = new Set(s);
      ids.forEach((id) => next.delete(id));
      return next;
    });

  const open = (n: NotificationItem) => {
    let marked: PromiseLike<unknown> = Promise.resolve();
    if (isUnread(n)) {
      setReadIds((s) => new Set(s).add(n.id));
      adjustUnreadNotifications((c) => c - 1);
      const undo = () => {
        unmark([n.id]);
        adjustUnreadNotifications((c) => c + 1);
      };
      marked = createClient()
        .rpc("mark_notifications_read", { p_ids: [n.id] })
        .then(
          ({ error }) => {
            if (error) undo();
            refreshUnreadNotifications();
          },
          () => {
            undo();
            refreshUnreadNotifications();
          },
        );
    }
    const link = n.link;
    if (!link || !link.startsWith("/")) return;
    // /isletme/sec is a route handler that switches the active business (cookie) and redirects: full navigation,
    // after the read mark is saved (waiting at most 1.5 s) so the page unload cannot cancel it.
    if (link.startsWith("/isletme/sec")) {
      const timeout = new Promise((resolve) => window.setTimeout(resolve, 1500));
      void Promise.race([marked, timeout]).then(() => window.location.assign(link));
    } else router.push(link);
  };

  const markAll = async () => {
    if (markingAll) return;
    const ids = items.filter(isUnread).map((i) => i.id);
    const before = unread;
    const hadFocus = document.activeElement === markAllRef.current;
    setMarkingAll(true);
    setReadIds((s) => new Set([...s, ...ids]));
    adjustUnreadNotifications(() => 0);
    let failed = false;
    try {
      const { error } = await createClient().rpc("mark_all_notifications_read");
      failed = Boolean(error);
    } catch {
      failed = true;
    }
    if (failed) {
      unmark(ids);
      // Dots back at once: when offline the re-count below fails too and would leave them cleared.
      adjustUnreadNotifications(() => before);
      toast.error("Bildirimler güncellenemedi, tekrar dene.");
    } else {
      toast.success("Tüm bildirimler okundu olarak işaretlendi");
      // The button goes away: keep keyboard focus on the page instead of dropping it to <body>.
      if (hadFocus) statusRef.current?.focus({ preventScroll: true });
      router.refresh();
    }
    // Confirms the cleared count, or brings the real one back after a failure.
    refreshUnreadNotifications();
    setMarkingAll(false);
  };

  const markAllButton =
    markingAll || unread > 0 ? (
      <button
        ref={markAllRef}
        type="button"
        onClick={markAll}
        disabled={markingAll}
        aria-busy={markingAll || undefined}
        className="flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full bg-card text-xs font-semibold text-foreground transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60 min-[390px]:pr-3 min-[390px]:pl-2.5"
      >
        {markingAll ? (
          <Loader2 className="size-4 text-primary motion-safe:animate-spin" strokeWidth={2} aria-hidden />
        ) : (
          <CheckCheck className="size-4 text-primary" strokeWidth={2} aria-hidden />
        )}
        {/* Below 390px only the icon fits next to the title; the label stays for screen readers. */}
        <span className="sr-only min-[390px]:not-sr-only">Tümünü okundu yap</span>
      </button>
    ) : null;

  return (
    <>
      <ProfilePageHeader title="Bildirimler" actions={markAllButton} />
      {items.length ? (
        <div className="flex flex-col gap-3 px-4 pt-3 pb-6">
          <p ref={statusRef} tabIndex={-1} className="px-1 text-sm text-muted-foreground outline-none" aria-live="polite">
            {unread > 0 ? `${unread} okunmamış bildirim` : "Hepsini okudun, yeni bir şey olunca burada görürsün."}
          </p>
          <ul className="divide-y overflow-hidden rounded-2xl bg-card">
            {items.map((n) => {
              const Icon = iconFor(n.type);
              const fresh = isUnread(n);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => open(n)}
                    className={cn(
                      "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60",
                      fresh && "bg-brand-soft/60",
                    )}
                  >
                    <span className={cn("mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl", fresh ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                      <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[15px] leading-snug", fresh ? "font-bold" : "font-medium")}>{n.title}</span>
                      {n.body ? <span className="mt-0.5 block text-sm leading-snug text-muted-foreground">{n.body}</span> : null}
                      <span className="mt-1 block text-xs text-muted-foreground">{timeAgo(n.created_at)}</span>
                    </span>
                    {fresh ? <span className="mt-2 size-2.5 shrink-0 rounded-full bg-primary" aria-label="Okunmadı" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <EmptyState icon={Bell} title="Bildirimin yok" description="İlanların, taleplerin ve işletmenle ilgili gelişmeler burada görünür." />
      )}
    </>
  );
}
