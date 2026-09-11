"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/core/format";
import { MESSAGE_STATUS_LABELS, TOPIC_INFO, type MessageTopic } from "./topics";

export type MyMessage = { id: string; topic: string; subject: string | null; message: string; status: string; created_at: string };

const PREVIEW = 3;

/** "Mesajlarım": the signed-in user's previous support messages with their status (first 3, then "Tümünü göster"). */
export function MyMessages({ messages }: { messages: MyMessage[] }) {
  const [all, setAll] = React.useState(false);
  const shown = all ? messages : messages.slice(0, PREVIEW);

  return (
    <section id="mesajlarim" className="scroll-mt-4" aria-labelledby="mesajlarim-baslik">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="mesajlarim-baslik" className="text-lg font-semibold">
          Mesajlarım
        </h2>
        {messages.length ? <span className="text-sm text-muted-foreground tabular-nums">{messages.length}</span> : null}
      </div>
      {messages.length ? (
        <ul className="divide-y rounded-3xl bg-card">
          {shown.map((m) => {
            const st = MESSAGE_STATUS_LABELS[m.status] ?? MESSAGE_STATUS_LABELS.new;
            const info = TOPIC_INFO[m.topic in TOPIC_INFO ? (m.topic as MessageTopic) : "diger"];
            return (
              <li key={m.id} className="flex items-start gap-3 p-4">
                <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", info.tone)}>
                  <info.icon className="size-5" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-semibold">{m.subject || info.label}</p>
                    <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", st.tone)}>{st.label}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{m.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    #{m.id.slice(0, 8).toUpperCase()} · {formatRelativeTime(m.created_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-3xl bg-card px-4 py-4 text-sm text-muted-foreground">Henüz mesaj göndermedin.</p>
      )}
      {messages.length > PREVIEW ? (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          className="mt-2.5 flex h-11 w-full items-center justify-center rounded-full bg-card text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {all ? "Daha az göster" : `Tümünü göster (${messages.length})`}
        </button>
      ) : null}
    </section>
  );
}
