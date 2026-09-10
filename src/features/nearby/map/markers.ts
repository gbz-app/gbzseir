/**
 * DOM builders for map markers: colored teardrop pins with lucide glyphs (ISC-licensed path data)
 * and the user's pulsing location dot. Plain DOM because maplibre markers are not React-managed.
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
  place:
    '<path d="M10 18v-7"/><path d="M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>',
  business:
    '<path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5"/><path d="M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244"/><path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05"/>',
};

/** 34x44 pin SVG (tip at the bottom center). */
export function pinSvg(kind: MarkerKind): string {
  const meta = KIND_META[kind];
  const strokeWidth = kind === "duty" || kind === "pharmacy" ? 3.4 : 2.3;
  return (
    '<svg width="34" height="44" viewBox="0 0 34 44" aria-hidden="true" focusable="false">' +
    `<path d="M17 43c-.7 0-1.3-.3-1.7-.9C10.9 36.6 2 26 2 17a15 15 0 0 1 30 0c0 9-8.9 19.6-13.3 25.1-.4.6-1 .9-1.7.9Z" fill="${meta.pin}" stroke="#fff" stroke-width="2"/>` +
    `<g transform="translate(8 8) scale(0.75)" fill="none" stroke="${meta.glyph}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[kind]}</g>` +
    "</svg>"
  );
}

/** Marker root (positioned by maplibre) + inner pin (scaled when selected). */
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
