"use client";

import * as React from "react";
import Link from "next/link";
import { LayoutGrid, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { routes } from "@/core/routes";
import { IDLE_CHIP_BG } from "@/components/shared/chip-filter";
import type { DrillRow } from "../explore-tree";

const CHIP =
  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50";
const ON = "bg-foreground text-background";
const OFF = cn("text-foreground", IDLE_CHIP_BG);

export type DrillChipsProps = {
  row: DrillRow;
  /** Lead the top level with the "Tümü" chip that opens the Şehir Rehberi. */
  guideLink: boolean;
  /** A kind or a list chip: open it. */
  onOpen: (nodeId: string) => void;
  /** A leaf chip (category, bank, brand, operator): on, or off when it is the chosen one. */
  onToggle: (value: string) => void;
  /** A black path chip: back up to that level. */
  onClear: (nodeId: string) => void;
};

/**
 * Chip row of the explore screen, inside the list sheet (owner 12.09: "filtreleme butonların içinde olsun"). Top level:
 * "Tümü" (the Şehir Rehberi) and the kinds, the chosen one black. One level down: the path so far as black chips with an
 * X (a tap goes back up to that level), then that level's choices (Kurum -> Belediye ve kamu -> Kaymakamlık, ATM ->
 * Ziraat); a chosen leaf chip is black with an X too. One scrolling row; on a new path the last black chip slides to
 * the left edge, a chosen chip to the middle.
 */
export function DrillChips({ row, guideLink, onOpen, onToggle, onClear }: DrillChipsProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const moved = React.useRef(false);
  const pathKey = `${row.trail.map((n) => n.id).join(">")}|${row.selected ?? ""}|${row.options.length}`;

  // Scrolls only the row itself (scrollIntoView would also move the sheet). One level down the last black path chip (its X
  // goes back up) stays at the left edge; a chosen chip further right is brought just into view. At the top level the
  // chosen kind sits in the middle.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const rowLeft = el.getBoundingClientRect().left;
    const at = (node: Element) => {
      const box = node.getBoundingClientRect();
      return { left: el.scrollLeft + box.left - rowLeft, width: box.width };
    };
    const trailEnd = el.querySelector("[data-drill-trail-end]");
    const chosen = el.querySelector("[data-drill-chosen]");
    let left = 0;
    if (trailEnd) {
      left = at(trailEnd).left - 16;
      if (chosen) {
        const c = at(chosen);
        left = Math.max(left, c.left + c.width + 16 - el.clientWidth);
      }
    } else if (chosen) {
      const c = at(chosen);
      left = c.left - (el.clientWidth - c.width) / 2;
    }
    el.scrollTo({ left: Math.max(0, left), behavior: moved.current ? "smooth" : "instant" });
    moved.current = true;
  }, [pathKey]);

  const lastTrail = row.trail.length - 1;
  return (
    <div ref={scrollRef} role="group" aria-label="Ne arıyorsun?" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5">
      {guideLink ? (
        <Link href={routes.guide.root()} className={cn(CHIP, OFF)}>
          <LayoutGrid className="size-4" aria-hidden />
          Tümü
        </Link>
      ) : null}
      {row.trail.map((n, i) => {
        const Icon = n.icon;
        return (
          <button
            key={n.id}
            type="button"
            onClick={() => onClear(n.id)}
            aria-label={`${n.label} filtresini kaldır`}
            data-drill-trail-end={i === lastTrail ? "" : undefined}
            className={cn(CHIP, ON, "pr-2.5")}
          >
            <Icon className="size-4" aria-hidden />
            {n.label}
            <X className="size-4 opacity-80" aria-hidden />
          </button>
        );
      })}
      {row.options.map((o) => {
        if (o.type === "node") {
          const Icon = o.icon;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={o.active}
              onClick={() => onOpen(o.id)}
              data-drill-chosen={o.active ? "" : undefined}
              className={cn(CHIP, o.active ? ON : OFF)}
            >
              <Icon className="size-4" aria-hidden />
              {o.label}
            </button>
          );
        }
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.active}
            onClick={() => onToggle(o.value)}
            data-drill-chosen={o.active ? "" : undefined}
            className={cn(CHIP, o.active ? cn(ON, "pr-2.5") : OFF)}
          >
            {o.label}
            {typeof o.count === "number" ? <span className={cn("text-xs font-medium", o.active ? "text-background/75" : "text-muted-foreground")}>{o.count}</span> : null}
            {o.active ? <X className="size-4 opacity-80" aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}
