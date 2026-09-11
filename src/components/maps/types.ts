import type { MarkerKind } from "@/features/nearby/types";

/** One pin: `kind` picks its colour and glyph (src/features/nearby/map/markers.ts), `label` is its accessible name. */
export type MapPoint = { id: string; lat: number; lng: number; kind: MarkerKind; label: string };

/** Space (px) kept free around fitted / flown-to content, e.g. the bottom sheet over the map. */
export type MapPadding = { top: number; right: number; bottom: number; left: number };

/** Move the view to a point; a new `nonce` triggers the move. */
export type FlyRequest = { lat: number; lng: number; zoom?: number; nonce: number };
