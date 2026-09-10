"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { Bell, CheckCheck, ClipboardList, Star, Store, Tag, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { createClient } from "@/lib/supabase/client";

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

/** G7 - Bildirimler: unread first highlight; tap marks as read and opens the link. */
export function NotificationsList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [readIds, setReadIds] = React.useState<Set<string>>(() => new Set());
  const [markingAll, setMarkingAll] = React.useState(false);
  const isUnread = (n: NotificationItem) => !n.read_at && !readIds.has(n.id);
  const unread = items.filter(isUnread).length;

  const open = (n: NotificationItem) => {
    if (isUnread(n)) {
      setReadIds((s) => new Set(s).add(n.id));
      void createClient()
        .rpc("mark_notifications_read", { p_ids: [n.id] })
        .then(
          () => undefined,
          () => undefined,
        );
    }
    if (n.link && n.link.startsWith("/")) router.push(n.link);
  };

  const markAll = async () => {
    setMarkingAll(true);
    const { error } = await createClient().rpc("mark_notifications_read", {});
    setMarkingAll(false);
    if (error) {
      toast.error("Bildirimler güncellenemedi.");
      return;
    }
    setReadIds(new Set(items.map((i) => i.id)));
    router.refresh();
  };

  if (!items.length) {
    return <EmptyState icon={Bell} title="Bildirimin yok" description="İlanların, taleplerin ve işletmenle ilgili gelişmeler burada görünür." />;
  }

  return (
    <div className="flex flex-col gap-3 px-4 pt-3 pb-6">
      {unread > 0 ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{unread} okunmamış bildirim</p>
          <Button variant="ghost" size="sm" onClick={markAll} disabled={markingAll}>
            <CheckCheck /> Tümünü okundu işaretle
          </Button>
        </div>
      ) : null}
      <ul className="divide-y overflow-hidden rounded-2xl bg-card shadow-soft ring-1 ring-foreground/[0.06]">
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
  );
}
