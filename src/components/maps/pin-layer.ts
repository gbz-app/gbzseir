/**
 * All pins of a Google map in ONE OverlayView (works without a Map ID, unlike AdvancedMarkerElement): the teardrop
 * pins and the pulsing location dot from src/features/nearby/map/markers.ts, as DOM elements in the
 * overlayMouseTarget pane. Pins are <button>s with an aria-label when the map is selectable, so taps and keyboard
 * focus work like before. draw() only runs when the projection changes (zoom / resize); panning moves the pane.
 * Browser only: create it after the Maps JS API has loaded (the OverlayView base class comes from the API).
 */
import type { LatLng } from "@/core/geo";
import { createPinElement, createUserDot } from "@/features/nearby/map/markers";
import type { MarkerKind } from "@/features/nearby/types";
import type { GLatLng, GLatLngConstructor, GMapCanvasProjection, GOverlayView, GOverlayViewConstructor } from "@/lib/maps/google";
import type { MapPoint } from "./types";

export interface PinLayer extends GOverlayView {
  /** Replace the pins (diffed by id). `onSelect` null = decorative pins (not buttons). */
  setPoints(points: MapPoint[], onSelect: ((id: string) => void) | null): void;
  setSelected(id: string | null): void;
  setUser(p: LatLng | null): void;
}

type Pin = { root: HTMLElement; pin: HTMLElement; kind: MarkerKind; label: string; selectable: boolean; pos: GLatLng };

function place(el: HTMLElement, proj: GMapCanvasProjection, pos: GLatLng) {
  const pt = proj.fromLatLngToDivPixel(pos);
  if (!pt) return;
  el.style.transform = `translate3d(${Math.round(pt.x)}px, ${Math.round(pt.y)}px, 0)`;
}

export function createPinLayer(OverlayView: GOverlayViewConstructor, LatLng: GLatLngConstructor): PinLayer {
  class Layer extends OverlayView implements PinLayer {
    private readonly box = document.createElement("div");
    private readonly pins = new Map<string, Pin>();
    private user: { el: HTMLElement; pos: GLatLng } | null = null;
    private selectedId: string | null = null;
    private onSelect: ((id: string) => void) | null = null;

    override onAdd() {
      this.box.className = "gz-pin-layer";
      this.getPanes()?.overlayMouseTarget.appendChild(this.box);
    }

    override onRemove() {
      this.box.remove();
    }

    override draw() {
      const proj = this.getProjection();
      if (!proj) return;
      for (const p of this.pins.values()) place(p.root, proj, p.pos);
      if (this.user) place(this.user.el, proj, this.user.pos);
    }

    setPoints(points: MapPoint[], onSelect: ((id: string) => void) | null) {
      this.onSelect = onSelect;
      const selectable = !!onSelect;
      const wanted = new Set(points.map((p) => p.id));
      for (const [id, p] of this.pins) {
        if (wanted.has(id)) continue;
        p.root.remove();
        this.pins.delete(id);
      }
      for (const p of points) {
        const pos = new LatLng(p.lat, p.lng);
        const cur = this.pins.get(p.id);
        if (cur && cur.kind === p.kind && cur.label === p.label && cur.selectable === selectable) {
          cur.pos = pos;
          continue;
        }
        cur?.root.remove();
        const { root, pin } = createPinElement(p.kind, p.label, selectable);
        if (selectable) {
          pin.addEventListener("click", (ev) => {
            ev.stopPropagation();
            this.onSelect?.(p.id);
          });
        }
        this.box.appendChild(root);
        this.pins.set(p.id, { root, pin, kind: p.kind, label: p.label, selectable, pos });
      }
      this.markSelected();
      this.draw();
    }

    setSelected(id: string | null) {
      this.selectedId = id;
      this.markSelected();
    }

    setUser(p: LatLng | null) {
      if (!p) {
        this.user?.el.remove();
        this.user = null;
        return;
      }
      const pos = new LatLng(p.lat, p.lng);
      if (this.user) this.user.pos = pos;
      else {
        const el = createUserDot();
        // Under the pins.
        this.box.prepend(el);
        this.user = { el, pos };
      }
      this.draw();
    }

    private markSelected() {
      for (const [id, p] of this.pins) {
        const on = id === this.selectedId;
        p.root.classList.toggle("is-selected", on);
        if (on) p.pin.setAttribute("aria-current", "true");
        else p.pin.removeAttribute("aria-current");
      }
    }
  }
  return new Layer();
}
