"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { formatRelativeTime } from "@/core/format";
import { createClient } from "@/lib/supabase/client";

export type AdminNotice = { id: string; title: string | null; body: string | null; link: string | null; read_at: string | null; created_at: string };

/** Admin notices (new business, unmatched request...) with read state; they are shown only here, never in the app. */
export function AdminNotices({ initial }: { initial: AdminNotice[] }) {
  const router = useRouter();
  const [items, setItems] = React.useState(initial);
  const unread = items.filter((n) => !n.read_at);

  const markRead = async (ids: string[]) => {
    if (!ids.length) return;
    const now = new Date().toISOString();
    setItems((all) => all.map((n) => (ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n)));
    const { error } = await createClient().rpc("mark_notifications_read", { p_ids: ids });
    if (error) toast.error("Bildirim okundu olarak işaretlenemedi.");
  };

  if (!items.length) return <p className="text-sm text-muted-foreground">Yeni bildirim yok.</p>;

  return (
    <div>
      {unread.length ? (
        <button type="button" onClick={() => void markRead(unread.map((n) => n.id))} className="mb-1 text-sm font-semibold text-primary hover:underline">
          Tümünü okundu işaretle
        </button>
      ) : null}
      <ul className="divide-y">
        {items.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => {
                if (!n.read_at) void markRead([n.id]);
                if (n.link?.startsWith("/admin")) router.push(n.link);
              }}
              className="flex w-full items-start gap-3 py-2.5 text-left outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className={n.read_at ? "mt-1.5 size-2 shrink-0 rounded-full bg-transparent" : "mt-1.5 size-2 shrink-0 rounded-full bg-primary"} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{n.title}</span>
                {n.body ? <span className="block truncate text-sm text-muted-foreground">{n.body}</span> : null}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(n.created_at)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
