"use client";

import * as React from "react";
import { Megaphone, SearchX } from "lucide-react";
import { ChipFilter, type ChipOption } from "@/components/shared/chip-filter";
import { EmptyState } from "@/components/shared/empty-state";
import { useLocationPrefs } from "@/lib/location/store";
import { useNow } from "../use-now";
import { AnnouncementCard } from "./announcement-card";
import { ANNOUNCEMENT_KIND_META, ANNOUNCEMENT_KIND_ORDER, announcementPhase, sortAnnouncements, type Announcement, type AnnouncementKind } from "./meta";

type Filter = "all" | "mine" | AnnouncementKind;

/** /duyurular list: kind chips, "Mahallem" (saved neighbourhood) filter, expiry re-checked on the device clock. */
export function AnnouncementsList({ items, renderedAt }: { items: Announcement[]; renderedAt: number }) {
  const now = useNow(renderedAt);
  const { neighbourhood } = useLocationPrefs();
  const myId = neighbourhood ? String(neighbourhood.id) : null;
  const [filter, setFilter] = React.useState<Filter>("all");

  const active = React.useMemo(() => sortAnnouncements(items.filter((a) => announcementPhase(a, now) !== "ended"), now), [items, now]);

  const isMine = React.useCallback((a: Announcement) => !!myId && a.neighbourhoods.some((n) => n.id === myId), [myId]);

  const options = React.useMemo<ChipOption<Filter>[]>(() => {
    const opts: ChipOption<Filter>[] = [{ value: "all", label: "Tümü", count: active.length }];
    const mineCount = active.filter((a) => isMine(a) || a.neighbourhoods.length === 0).length;
    if (myId && active.some(isMine)) opts.push({ value: "mine", label: "Mahallem", count: mineCount });
    for (const kind of ANNOUNCEMENT_KIND_ORDER) {
      const count = active.filter((a) => a.kind === kind).length;
      if (count) opts.push({ value: kind, label: ANNOUNCEMENT_KIND_META[kind].chip, count });
    }
    return opts;
  }, [active, isMine, myId]);

  // A chip can disappear (e.g. the only outage ended); fall back to "Tümü".
  const effective: Filter = options.some((o) => o.value === filter) ? filter : "all";
  const visible =
    effective === "all"
      ? active
      : effective === "mine"
        ? active.filter((a) => isMine(a) || a.neighbourhoods.length === 0)
        : active.filter((a) => a.kind === effective);

  if (!active.length) {
    return (
      <EmptyState
        icon={Megaphone}
        title="Şu an aktif duyuru yok"
        description="Planlı su ve elektrik kesintileri ile belediye duyuruları yayınlandığında burada görünür."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {options.length > 2 ? (
        <ChipFilter options={options} value={effective} onChange={(v) => v && setFilter(v)} ariaLabel="Duyuru türü" size="sm" />
      ) : null}
      {visible.length ? (
        visible.map((a) => <AnnouncementCard key={a.id} item={a} now={now} mine={isMine(a)} />)
      ) : (
        <EmptyState compact icon={SearchX} tone="default" title="Bu filtrede duyuru yok" />
      )}
    </div>
  );
}
