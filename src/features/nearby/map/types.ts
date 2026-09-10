import type { LatLng } from "@/core/geo";
import type { MarkerKind } from "../types";

export type MapPoint = { id: string; lat: number; lng: number; kind: MarkerKind; label: string };
export type MapPadding = { top: number; right: number; bottom: number; left: number };
export type FlyRequest = { lat: number; lng: number; zoom?: number; nonce: number };

export type NearbyMapProps = {
  /** Markers (the first `fitCount` are used to fit the view; pass them sorted by distance). */
  points: MapPoint[];
  /** User location (pulse dot). */
  user?: LatLng | null;
  /** Initial center. */
  center: LatLng;
  zoom?: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Change this value to fit the view to the user + points again. */
  fitKey?: string;
  /** Only fit to the nearest N points (default: all). */
  fitCount?: number;
  /** Map padding used for fit/fly (e.g. the bottom sheet height). */
  padding?: MapPadding;
  /** Fly to a point (a new nonce triggers the animation). */
  flyTo?: FlyRequest | null;
  /** false = static mini map (no gestures, markers are not buttons). */
  interactive?: boolean;
  /** Zoom buttons (hidden on touch devices). */
  showControls?: boolean;
  /** Top offset of the zoom buttons (below overlays). */
  controlsTop?: number;
  /** Show the built-in attribution line (default true). */
  showAttribution?: boolean;
  className?: string;
  ariaLabel?: string;
};
