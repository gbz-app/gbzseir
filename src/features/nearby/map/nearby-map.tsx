"use client";

import * as React from "react";
import { LngLatBounds, Map as MapLibreMap, Marker, NavigationControl, getVersion, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./map.css";
import { CloudOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MapAttribution } from "./attribution";
import { createPinElement, createUserDot } from "./markers";
import type { MapPadding, NearbyMapProps } from "./types";
import type { MarkerKind } from "../types";

export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const LOAD_TIMEOUT_MS = 25_000;

let workerConfigured = false;
/**
 * maplibre resolves its worker with `new URL(<variable>, import.meta.url)`, which bundlers cannot rewrite,
 * so the worker of the exact installed version is loaded from jsDelivr (CORS enabled, module worker via blob).
 */
function configureWorker() {
  if (workerConfigured) return;
  workerConfigured = true;
  try {
    setWorkerUrl(`https://cdn.jsdelivr.net/npm/maplibre-gl@${getVersion()}/dist/maplibre-gl-worker.mjs`);
  } catch {
    /* keep maplibre's default */
  }
}

type MarkerEntry = { marker: Marker; pin: HTMLElement; root: HTMLElement; kind: MarkerKind };

function clampPadding(p: MapPadding, el: HTMLElement | null): MapPadding {
  const h = el?.clientHeight ?? 0;
  const w = el?.clientWidth ?? 0;
  const out = { ...p };
  if (h > 0 && out.top + out.bottom > h - 60) {
    const f = Math.max(0, h - 60) / (out.top + out.bottom);
    out.top = Math.floor(out.top * f);
    out.bottom = Math.floor(out.bottom * f);
  }
  if (w > 0 && out.left + out.right > w - 60) {
    out.left = 20;
    out.right = 20;
  }
  return out;
}

/** MapLibre map with custom pins (OpenFreeMap tiles). Load it through LazyNearbyMap (ssr: false). */
export function NearbyMap({
  points,
  user,
  center,
  zoom = 13,
  selectedId,
  onSelect,
  fitKey,
  fitCount,
  padding,
  flyTo,
  interactive = true,
  showControls = false,
  controlsTop = 0,
  showAttribution = true,
  className,
  ariaLabel = "Harita",
}: NearbyMapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<MapLibreMap | null>(null);
  const markersRef = React.useRef(new Map<string, MarkerEntry>());
  const userMarkerRef = React.useRef<Marker | null>(null);
  const onSelectRef = React.useRef(onSelect);
  const paddingRef = React.useRef(padding);
  const [status, setStatus] = React.useState<"loading" | "ready" | "failed">("loading");

  React.useEffect(() => {
    onSelectRef.current = onSelect;
    paddingRef.current = padding;
  });

  // Create the map once.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    configureWorker();
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container: el,
        style: MAP_STYLE_URL,
        center: [center.lng, center.lat],
        zoom,
        attributionControl: false,
        interactive,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
        minZoom: 8,
        maxZoom: 18,
      });
    } catch {
      // WebGL unavailable or blocked.
      const id = window.setTimeout(() => setStatus("failed"), 0);
      return () => window.clearTimeout(id);
    }
    mapRef.current = map;
    if (interactive) map.touchZoomRotate.disableRotation();
    if (showControls) map.addControl(new NavigationControl({ showCompass: false, visualizePitch: false }), "top-right");

    let loaded = false;
    map.on("load", () => {
      loaded = true;
      setStatus("ready");
    });
    map.on("error", () => {
      if (!loaded && !map.isStyleLoaded()) setStatus("failed");
    });
    const failTimer = window.setTimeout(() => {
      if (!loaded && !map.isStyleLoaded()) setStatus("failed");
    }, LOAD_TIMEOUT_MS);

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(el);

    const markers = markersRef.current;
    return () => {
      window.clearTimeout(failTimer);
      ro.disconnect();
      markers.forEach((m) => m.marker.remove());
      markers.clear();
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; later center/zoom changes go through fitKey / flyTo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers (diff by id).
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const existing = markersRef.current;
    const wanted = new Set(points.map((p) => p.id));
    for (const [id, entry] of existing) {
      if (!wanted.has(id)) {
        entry.marker.remove();
        existing.delete(id);
      }
    }
    for (const p of points) {
      const cur = existing.get(p.id);
      if (cur && cur.kind === p.kind) {
        cur.marker.setLngLat([p.lng, p.lat]);
        continue;
      }
      cur?.marker.remove();
      const { root, pin } = createPinElement(p.kind, p.label, interactive);
      if (interactive) {
        pin.addEventListener("click", (ev) => {
          ev.stopPropagation();
          onSelectRef.current?.(p.id);
        });
      }
      const marker = new Marker({ element: root, anchor: "bottom" }).setLngLat([p.lng, p.lat]).addTo(map);
      existing.set(p.id, { marker, pin, root, kind: p.kind });
    }
  }, [points, interactive]);

  // Selected marker highlight.
  React.useEffect(() => {
    for (const [id, entry] of markersRef.current) {
      const on = id === selectedId;
      entry.root.classList.toggle("is-selected", on);
      if (on) entry.pin.setAttribute("aria-current", "true");
      else entry.pin.removeAttribute("aria-current");
    }
  }, [selectedId, points]);

  // User location dot.
  const userLat = user?.lat;
  const userLng = user?.lng;
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (typeof userLat !== "number" || typeof userLng !== "number") {
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      return;
    }
    if (userMarkerRef.current) userMarkerRef.current.setLngLat([userLng, userLat]);
    else userMarkerRef.current = new Marker({ element: createUserDot(), anchor: "center" }).setLngLat([userLng, userLat]).addTo(map);
  }, [userLat, userLng]);

  // Fit to user + nearest points whenever fitKey changes.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !fitKey) return;
    const pad = clampPadding(paddingRef.current ?? { top: 40, right: 40, bottom: 40, left: 40 }, containerRef.current);
    const subset = fitCount ? points.slice(0, fitCount) : points;
    const coords: Array<[number, number]> = subset.map((p) => [p.lng, p.lat]);
    if (typeof userLat === "number" && typeof userLng === "number") coords.push([userLng, userLat]);
    if (coords.length === 0) {
      map.easeTo({ center: [center.lng, center.lat], zoom, padding: pad, duration: 500 });
      return;
    }
    if (coords.length === 1) {
      map.easeTo({ center: coords[0], zoom: 15, padding: pad, duration: 500 });
      return;
    }
    const bounds = new LngLatBounds(coords[0], coords[0]);
    for (const c of coords) bounds.extend(c);
    map.fitBounds(bounds, { padding: pad, maxZoom: 16, duration: 650 });
    // Only refit when the caller asks (new data / new location).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // Imperative fly.
  const flyNonce = flyTo?.nonce;
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyTo) return;
    const pad = clampPadding(paddingRef.current ?? { top: 40, right: 40, bottom: 40, left: 40 }, containerRef.current);
    map.flyTo({ center: [flyTo.lng, flyTo.lat], zoom: flyTo.zoom ?? Math.max(map.getZoom(), 15), padding: pad, duration: 700 });
    // Triggered by nonce only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyNonce]);

  return (
    <div
      className={cn("gz-map relative overflow-hidden bg-[#efe9e1] dark:bg-[#1f2826]", className)}
      role="region"
      aria-label={ariaLabel}
      style={{ ["--gz-map-controls-top" as string]: `${controlsTop}px` }}
    >
      <div ref={containerRef} className="h-full w-full" />
      {status === "loading" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-background/90 px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-soft">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Harita yükleniyor…
          </span>
        </div>
      ) : null}
      {status === "failed" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-muted/90 px-6 text-center">
          <CloudOff className="size-7 text-muted-foreground" aria-hidden />
          <p className="text-sm font-semibold">Harita şu an yüklenemedi</p>
          <p className="text-xs text-muted-foreground">Liste ve yol tarifi çalışmaya devam eder.</p>
        </div>
      ) : null}
      {showAttribution ? <MapAttribution className="absolute right-1 bottom-1" /> : null}
    </div>
  );
}
