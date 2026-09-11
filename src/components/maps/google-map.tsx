"use client";

import * as React from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import type { LatLng } from "@/core/geo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { googleMapsAvailable, loadGoogleMaps, onGoogleMapsAuthFailure, type GMap, type GMapsEventListener } from "@/lib/maps/google";
import { MAP_UNAVAILABLE_TITLE, MapNotice } from "./map-states";
import { mapStyles } from "./map-styles";
import { createPinLayer, type PinLayer } from "./pin-layer";
import type { FlyRequest, MapPadding, MapPoint } from "./types";
import { clampPadding, fitCamera, paddedCenter } from "./viewport";

const READY_TIMEOUT_MS = 15_000;
const MIN_ZOOM = 8;
const MAX_ZOOM = 19;
/** Fitting never zooms in closer than this; a single point is shown at SINGLE_ZOOM. */
const FIT_MAX_ZOOM = 16;
const SINGLE_ZOOM = 15;
const DEFAULT_PADDING: MapPadding = { top: 40, right: 40, bottom: 40, left: 40 };
/** Same tones as .gz-map-pattern, so the map div does not flash grey while tiles load. */
const MAP_BG = { light: "#efe9e1", dark: "#1f2826" } as const;
const NOTICE_TEXT = "Yol tarifi çalışmaya devam eder.";

const ZOOM_BUTTON =
  "flex size-10 items-center justify-center text-foreground outline-none hover:bg-muted focus-visible:bg-muted disabled:pointer-events-none disabled:opacity-50";

export type GoogleMapProps = {
  /** Pins (the first `fitCount` are used to fit the view; pass them sorted by distance). */
  points: MapPoint[];
  /** User location (pulsing dot). */
  user?: LatLng | null;
  /** Initial centre and zoom (later moves go through fitKey / flyTo). */
  center: LatLng;
  zoom?: number;
  selectedId?: string | null;
  /** Makes the pins buttons; called with the tapped pin's id. */
  onSelect?: (id: string) => void;
  /** Change this value to fit the view to the user + points again (also applied once the map is created). */
  fitKey?: string;
  /** Only fit to the nearest N points (default: all). */
  fitCount?: number;
  /** Space kept free for overlays when fitting / flying (e.g. the bottom sheet height). */
  padding?: MapPadding;
  /** Move to a point (a new nonce triggers it; a pending request is applied once the map is created). */
  flyTo?: FlyRequest | null;
  /** "greedy" in full-screen map views, "cooperative" (two-finger pan) inside scrolling pages. */
  gestures?: "greedy" | "cooperative";
  /** Zoom buttons on devices with a mouse (touch devices pinch). */
  showZoomButtons?: boolean;
  /** Top offset (px) of the zoom buttons, below overlays such as chips. */
  controlsTop?: number;
  className?: string;
  ariaLabel?: string;
};

/** True when a key is configured and Google has not refused it in this tab; re-renders when Google refuses it. */
export function useGoogleMapsAvailable(): boolean {
  return React.useSyncExternalStore(onGoogleMapsAuthFailure, googleMapsAvailable, googleMapsAvailable);
}

/**
 * Interactive Google map with the app's pins; Google's own places are hidden (map-styles.ts). Creating it is a billed
 * map load: map-first screens (Yakınımda, the guide category maps) render it on page load, everything else only after
 * the user asked for a map (detail pages' "Haritada göster"). Without a key, or when Google refuses it, shows the calm
 * "Harita şu an kullanılamıyor" state; a failed load offers "Tekrar dene".
 */
export function GoogleMap(props: GoogleMapProps) {
  const available = useGoogleMapsAvailable();
  const [attempt, setAttempt] = React.useState(0);
  if (!available) {
    return (
      <MapFrame className={props.className} ariaLabel={props.ariaLabel}>
        <MapNotice title={MAP_UNAVAILABLE_TITLE} description={NOTICE_TEXT} />
      </MapFrame>
    );
  }
  return <MapCanvas key={attempt} {...props} onRetry={() => setAttempt((n) => n + 1)} />;
}

function MapFrame({ className, ariaLabel = "Harita", children }: { className?: string; ariaLabel?: string; children: React.ReactNode }) {
  return (
    <div className={cn("gz-map-pattern relative overflow-hidden", className)} role="region" aria-label={ariaLabel}>
      {children}
    </div>
  );
}

/** Camera move: a smooth pan when the zoom stays, otherwise a jump (Google has no fly animation). */
function moveCamera(map: GMap, center: LatLng, zoom: number) {
  if (map.getZoom() === zoom) {
    map.panTo(center);
    return;
  }
  map.setCenter(center);
  map.setZoom(zoom);
}

function MapCanvas({
  points,
  user,
  center,
  zoom = 13,
  selectedId = null,
  onSelect,
  fitKey,
  fitCount,
  padding,
  flyTo,
  gestures = "greedy",
  showZoomButtons = false,
  controlsTop = 0,
  className,
  ariaLabel,
  onRetry,
}: GoogleMapProps & { onRetry: () => void }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [view, setView] = React.useState<{ map: GMap; layer: PinLayer } | null>(null);
  const [status, setStatus] = React.useState<"loading" | "ready" | "failed">("loading");
  const onSelectRef = React.useRef(onSelect);
  const paddingRef = React.useRef(padding);

  React.useEffect(() => {
    onSelectRef.current = onSelect;
    paddingRef.current = padding;
  });

  // Create the map once (one billed load per mount).
  React.useEffect(() => {
    let cancelled = false;
    let layer: PinLayer | null = null;
    const listeners: GMapsEventListener[] = [];
    const timer = window.setTimeout(() => {
      if (!cancelled) setStatus((s) => (s === "ready" ? s : "failed"));
    }, READY_TIMEOUT_MS);
    void (async () => {
      try {
        const maps = await loadGoogleMaps();
        const [{ Map: MapConstructor, OverlayView }, { LatLng, ColorScheme }] = await Promise.all([maps.importLibrary("maps"), maps.importLibrary("core")]);
        const el = containerRef.current;
        if (cancelled || !el) return;
        // The colour scheme can only be set when the map is created (no Map ID needed); it follows the app theme.
        const dark = document.documentElement.classList.contains("dark");
        const map = new MapConstructor(el, {
          center: { lat: center.lat, lng: center.lng },
          zoom,
          minZoom: MIN_ZOOM,
          maxZoom: MAX_ZOOM,
          disableDefaultUI: true,
          clickableIcons: false,
          gestureHandling: gestures,
          keyboardShortcuts: true,
          colorScheme: dark ? (ColorScheme?.DARK ?? "DARK") : (ColorScheme?.LIGHT ?? "LIGHT"),
          backgroundColor: dark ? MAP_BG.dark : MAP_BG.light,
          // Only our pins: Google's own places (businesses too) and transit icons are hidden (map-styles.ts).
          styles: mapStyles(dark),
        });
        layer = createPinLayer(OverlayView, LatLng);
        layer.setMap(map);
        listeners.push(
          map.addListener("idle", () => {
            if (cancelled) return;
            window.clearTimeout(timer);
            setStatus("ready");
          }),
        );
        setView({ map, layer });
      } catch {
        // Script blocked, offline or too slow.
        if (cancelled) return;
        window.clearTimeout(timer);
        setStatus("failed");
      }
    })();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      for (const l of listeners) l.remove();
      layer?.setMap(null);
    };
    // The map is created once; later centre/zoom changes go through fitKey / flyTo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pins (diffed by id inside the layer).
  const selectable = !!onSelect;
  React.useEffect(() => {
    view?.layer.setPoints(points, selectable ? (id) => onSelectRef.current?.(id) : null);
  }, [view, points, selectable]);

  // Selected pin highlight.
  React.useEffect(() => {
    view?.layer.setSelected(selectedId);
  }, [view, selectedId]);

  // User location dot.
  const userLat = user?.lat;
  const userLng = user?.lng;
  React.useEffect(() => {
    view?.layer.setUser(typeof userLat === "number" && typeof userLng === "number" ? { lat: userLat, lng: userLng } : null);
  }, [view, userLat, userLng]);

  // Fit to user + nearest points once the map exists and whenever fitKey changes.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!view || !fitKey || !el) return;
    const box = { width: el.clientWidth, height: el.clientHeight };
    const pad = clampPadding(paddingRef.current ?? DEFAULT_PADDING, box);
    const coords: LatLng[] = (fitCount ? points.slice(0, fitCount) : points).map((p) => ({ lat: p.lat, lng: p.lng }));
    if (typeof userLat === "number" && typeof userLng === "number") coords.push({ lat: userLat, lng: userLng });
    if (coords.length === 0) moveCamera(view.map, paddedCenter(center, zoom, pad), zoom);
    else if (coords.length === 1) moveCamera(view.map, paddedCenter(coords[0], SINGLE_ZOOM, pad), SINGLE_ZOOM);
    else {
      const cam = fitCamera(coords, box, pad, MIN_ZOOM, FIT_MAX_ZOOM);
      moveCamera(view.map, cam.center, cam.zoom);
    }
    // Only refit when the caller asks (new data / new location) or when the map appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, fitKey]);

  // Imperative move (declared after the fit, so a pending request wins when the map appears).
  const flyNonce = flyTo?.nonce;
  React.useEffect(() => {
    const el = containerRef.current;
    if (!view || !flyTo || !el) return;
    const pad = clampPadding(paddingRef.current ?? DEFAULT_PADDING, { width: el.clientWidth, height: el.clientHeight });
    const z = flyTo.zoom ?? Math.max(view.map.getZoom() ?? SINGLE_ZOOM, SINGLE_ZOOM);
    moveCamera(view.map, paddedCenter({ lat: flyTo.lat, lng: flyTo.lng }, z, pad), z);
    // Triggered by the nonce only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, flyNonce]);

  const zoomBy = (delta: number) => {
    const map = view?.map;
    if (!map) return;
    const z = map.getZoom() ?? zoom;
    map.setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta)));
  };

  return (
    <MapFrame className={className} ariaLabel={ariaLabel}>
      <div ref={containerRef} className="absolute inset-0" />
      {status === "loading" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span role="status" className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Harita yükleniyor…
          </span>
        </div>
      ) : null}
      {status === "failed" ? (
        <MapNotice
          title="Harita şu an yüklenemedi"
          description={`İnternet bağlantını kontrol et. ${NOTICE_TEXT}`}
          action={
            <Button type="button" variant="secondary" size="sm" className="bg-card shadow-none hover:bg-card/80" onClick={onRetry}>
              Tekrar dene
            </Button>
          }
        />
      ) : null}
      {showZoomButtons && status === "ready" ? (
        <div className="absolute right-3 z-10 hidden flex-col overflow-hidden rounded-2xl bg-card [@media(hover:hover)]:flex" style={{ top: controlsTop + 12 }}>
          <button type="button" onClick={() => zoomBy(1)} aria-label="Yakınlaştır" className={ZOOM_BUTTON}>
            <Plus className="size-5" aria-hidden />
          </button>
          <span className="mx-2 h-px bg-foreground/10" aria-hidden />
          <button type="button" onClick={() => zoomBy(-1)} aria-label="Uzaklaştır" className={ZOOM_BUTTON}>
            <Minus className="size-5" aria-hidden />
          </button>
        </div>
      ) : null}
    </MapFrame>
  );
}
