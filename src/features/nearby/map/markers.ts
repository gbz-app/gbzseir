/**
 * DOM builders for map markers: colored round pins with lucide glyphs (ISC-licensed path data)
 * and the user's pulsing location dot. Plain DOM because they live in a Google Maps OverlayView
 * (src/components/maps/pin-layer.ts), not in React. Styles: src/components/maps/maps.css.
 */
import { KIND_META } from "../config";
import type { MarkerKind } from "../types";

const PLUS = '<path d="M5 12h14"/><path d="M12 5v14"/>';

const GLYPHS: Record<MarkerKind, string> = {
  duty: PLUS,
  pharmacy: PLUS,
  mosque:
    '<path d="M18 5h4"/><path d="M20 3v4"/><path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"/>',
  bus_stop:
    '<path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>',
  taxi: '<path d="M10 2h4"/><path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8"/><path d="M7 14h.01"/><path d="M17 14h.01"/><rect width="18" height="8" x="3" y="10" rx="2"/><path d="M5 18v2"/><path d="M19 18v2"/>',
  atm: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  place:
    '<path d="M10 18v-7"/><path d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>',
  business:
    '<path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5"/><path d="M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244"/><path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05"/>',
  // building-2
  institution:
    '<path d="M10 12h4"/><path d="M10 8h4"/><path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="M6 10H4a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-2"/><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/>',
  fuel: '<path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5"/><path d="M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16"/><path d="M2 21h13"/><path d="M3 9h11"/>',
  // ev-charger
  ev_charge:
    '<path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 4 0v-6.998a2 2 0 0 0-.59-1.42L18 5"/><path d="M14 21V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v16"/><path d="M2 21h13"/><path d="M3 7h11"/><path d="m9 11-2 3h3l-2 3"/>',
  // vault (without the four filled dots, which would take the page's currentColor)
  bank: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m7.9 7.9 2.7 2.7"/><path d="m13.4 10.6 2.7-2.7"/><path d="m7.9 16.1 2.7-2.7"/><path d="m13.4 13.4 2.7 2.7"/><circle cx="12" cy="12" r="2"/>',
};

/**
 * 40x40 round pin SVG, centred on the point: the kind's colour with a 2px white border and its glyph. About 20% larger
 * than the former teardrop head (38px across instead of 32px, glyph 21.6px instead of 18px).
 */
export function pinSvg(kind: MarkerKind): string {
  const meta = KIND_META[kind];
  const strokeWidth = kind === "duty" || kind === "pharmacy" ? 3.4 : 2.3;
  return (
    '<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" focusable="false">' +
    `<circle cx="20" cy="20" r="18" fill="${meta.pin}" stroke="#fff" stroke-width="2"/>` +
    `<g transform="translate(9.2 9.2) scale(0.9)" fill="none" stroke="${meta.glyph}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[kind]}</g>` +
    "</svg>"
  );
}

/** Marker root (positioned by the pin layer) + inner pin (scaled when selected). */
export function createPinElement(kind: MarkerKind, label: string, interactive: boolean): { root: HTMLDivElement; pin: HTMLElement } {
  const root = document.createElement("div");
  root.className = "gz-marker";
  const pin = document.createElement(interactive ? "button" : "div");
  pin.className = interactive ? "gz-pin" : "gz-pin gz-pin-static";
  if (interactive) {
    (pin as HTMLButtonElement).type = "button";
    pin.setAttribute("aria-label", label);
    pin.title = label;
  } else {
    pin.setAttribute("aria-hidden", "true");
  }
  pin.innerHTML = pinSvg(kind);
  root.appendChild(pin);
  return { root, pin };
}

export function createUserDot(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "gz-user";
  el.setAttribute("aria-label", "Konumun");
  el.setAttribute("role", "img");
  return el;
}
