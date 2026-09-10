"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type SheetSnap = "peek" | "half" | "full";

/** translateY offsets (px from the top of the area) for each snap point. */
export function sheetOffsets(height: number, topInset: number): Record<SheetSnap, number> {
  const peekVisible = Math.round(Math.min(Math.max(height * 0.3, 176), 260));
  const halfVisible = Math.max(peekVisible + 40, Math.round(height * 0.55));
  const fullVisible = Math.max(height - topInset, halfVisible);
  return { peek: height - peekVisible, half: height - halfVisible, full: height - fullVisible };
}

const ORDER: SheetSnap[] = ["full", "half", "peek"];
const NEXT_ON_TAP: Record<SheetSnap, SheetSnap> = { peek: "half", half: "full", full: "peek" };

export type NearbySheetProps = {
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  /** Height of the map area (px). */
  height: number;
  /** Space kept free above the sheet when fully open (filter chips). */
  topInset: number;
  header: React.ReactNode;
  /** Buttons that float just above the sheet edge (hidden when fully open). Children need pointer-events-auto. */
  floating?: React.ReactNode;
  handleRef?: React.Ref<HTMLButtonElement>;
  listRef?: React.Ref<HTMLDivElement>;
  children: React.ReactNode;
};

/**
 * Draggable bottom sheet over the map with three snap points. Drag the header (or tap / press Enter on the
 * handle to cycle). The transform is written straight to the DOM while dragging (no re-render per frame).
 */
export function NearbySheet({ snap, onSnapChange, height, topInset, header, floating, handleRef, listRef, children }: NearbySheetProps) {
  const offsets = sheetOffsets(height, topInset);
  const target = offsets[snap];
  const sheetRef = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<{ id: number; startY: number; start: number; y: number; lastY: number; lastT: number; v: number; moved: boolean } | null>(null);
  const suppressClick = React.useRef(false);

  const write = (y: number, animate: boolean) => {
    const el = sheetRef.current;
    if (!el) return;
    el.style.transition = animate ? "" : "none";
    el.style.transform = `translate3d(0, ${y}px, 0)`;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, startY: e.clientY, start: target, y: target, lastY: e.clientY, lastT: performance.now(), v: 0, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dy) < 5) return;
    d.moved = true;
    const t = performance.now();
    const dt = Math.max(1, t - d.lastT);
    d.v = 0.8 * ((e.clientY - d.lastY) / dt) + 0.2 * d.v;
    d.lastY = e.clientY;
    d.lastT = t;
    // Light resistance past the peek position.
    let y = d.start + dy;
    if (y > offsets.peek) y = offsets.peek + (y - offsets.peek) * 0.3;
    y = Math.max(offsets.full, y);
    d.y = y;
    write(y, false);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    suppressClick.current = true;
    const projected = d.y + d.v * 160;
    let best: SheetSnap = snap;
    let bestDist = Infinity;
    for (const s of ORDER) {
      const dist = Math.abs(offsets[s] - projected);
      if (dist < bestDist) {
        bestDist = dist;
        best = s;
      }
    }
    write(offsets[best], true);
    if (best !== snap) onSnapChange(best);
  };

  const onHandleClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onSnapChange(NEXT_ON_TAP[snap]);
  };

  const expanded = snap === "full";

  return (
    <div
      ref={sheetRef}
      className="absolute inset-x-0 top-0 z-30 flex h-full flex-col rounded-t-3xl bg-background shadow-[0_-10px_30px_-12px_rgb(0_0_0/0.25)] ring-1 ring-foreground/[0.06] transition-transform duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] will-change-transform"
      style={{ transform: `translate3d(0, ${target}px, 0)` }}
    >
      {floating ? (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 -top-14 flex h-12 items-end justify-between gap-2 px-3 transition-opacity duration-200",
            expanded && "opacity-0 [&_*]:pointer-events-none!",
          )}
        >
          {floating}
        </div>
      ) : null}
      <div
        className="shrink-0 cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <button
          ref={handleRef}
          type="button"
          onClick={onHandleClick}
          aria-expanded={expanded}
          aria-label={expanded ? "Listeyi küçült" : "Listeyi büyüt"}
          className="flex h-8 w-full items-center justify-center rounded-t-3xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
        >
          <span className="h-1.5 w-11 rounded-full bg-muted-foreground/35" aria-hidden />
        </button>
        <div className="px-4 pb-2.5">{header}</div>
      </div>
      <div ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4" style={{ paddingBottom: target + 16 }}>
        {children}
      </div>
    </div>
  );
}
