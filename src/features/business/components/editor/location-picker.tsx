"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Map as MapLibreMap } from "maplibre-gl";
import { Check, LocateFixed, Loader2, Map as MapIcon, MapPin, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { HideBottomNav } from "@/components/layout/nav-visibility";
import { CITY } from "@/config/site";
import { roundCoord, type LatLng } from "@/core/geo";
import { createClient } from "@/lib/supabase/client";
import { useApproxLocation } from "@/lib/location/use-approx-location";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

let workerConfigured = false;

/**
 * maplibre-gl v6 derives its worker URL from import.meta.url at runtime, which does not survive bundling.
 * Point it at the exact same version on jsDelivr; maplibre loads cross-origin workers through a blob module.
 */
async function loadMapLibre() {
  const maplibre = await import("maplibre-gl");
  if (!workerConfigured) {
    maplibre.setWorkerUrl(`https://cdn.jsdelivr.net/npm/maplibre-gl@${maplibre.getVersion()}/dist/maplibre-gl-worker.mjs`);
    workerConfigured = true;
  }
  return maplibre;
}

/** Business pins are public addresses chosen by the owner: keep ~1 m precision. */
const roundPin = (p: LatLng): LatLng => ({ lat: roundCoord(p.lat, 5), lng: roundCoord(p.lng, 5) });

export type ResolvedNeighbourhood = { id: string; name: string };

export type LocationPickerProps = {
  value: LatLng | null;
  onChange: (value: LatLng | null) => void;
  /** Where to open the map when there is no pin yet (e.g. the chosen neighbourhood's centre). */
  fallbackCenter?: LatLng | null;
  /** Called with the neighbourhood that contains the confirmed pin (rpc neighbourhood_for_point). */
  onNeighbourhood?: (n: ResolvedNeighbourhood) => void;
  id?: string;
};

/** Form field: "Konumumu kullan" / "Haritada seç" + a full-screen pin-drop map (OpenFreeMap). */
export function LocationPicker({ value, onChange, fallbackCenter, onNeighbourhood, id }: LocationPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [start, setStart] = React.useState<LatLng | null>(null);
  const loc = useApproxLocation();

  const openAt = (center: LatLng | null) => {
    setStart(center);
    setOpen(true);
  };

  const useMyLocation = async () => {
    const coords = await loc.request();
    if (!coords) {
      toast.error("Konumun alınamadı. Haritada kendin işaretleyebilirsin.");
      return;
    }
    // The device location is rounded (~100 m); let the owner place the pin exactly.
    openAt(coords);
  };

  const confirm = async (p: LatLng) => {
    const pin = roundPin(p);
    onChange(pin);
    setOpen(false);
    if (!onNeighbourhood) return;
    try {
      const { data } = await createClient().rpc("neighbourhood_for_point", { p_lat: roundCoord(pin.lat), p_lng: roundCoord(pin.lng) });
      const hit = Array.isArray(data) ? data[0] : null;
      if (hit?.id) onNeighbourhood({ id: String(hit.id), name: String(hit.name) });
    } catch {
      /* optional convenience */
    }
  };

  return (
    <div id={id}>
      {value ? (
        <div className="flex items-center gap-3 rounded-2xl border bg-card p-3.5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
            <MapPin className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Konum işaretlendi</p>
            <p className="truncate text-xs text-muted-foreground tabular-nums">
              {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => openAt(value)}>
            Değiştir
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Konumu kaldır" onClick={() => onChange(null)} className="text-muted-foreground">
            <Trash2 />
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="h-12" onClick={useMyLocation} disabled={loc.status === "locating"}>
            {loc.status === "locating" ? <Loader2 className="animate-spin" /> : <LocateFixed />}
            Konumumu kullan
          </Button>
          <Button type="button" variant="outline" className="h-12" onClick={() => openAt(null)}>
            <MapIcon /> Haritada seç
          </Button>
        </div>
      )}
      {open ? (
        <MapOverlay initial={start ?? value ?? fallbackCenter ?? CITY.center} zoomed={!!(start ?? value)} onCancel={() => setOpen(false)} onConfirm={confirm} />
      ) : null}
    </div>
  );
}

function MapOverlay({ initial, zoomed, onCancel, onConfirm }: { initial: LatLng; zoomed: boolean; onCancel: () => void; onConfirm: (p: LatLng) => void }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<MapLibreMap | null>(null);
  const [center, setCenter] = React.useState<LatLng>(initial);
  const [state, setState] = React.useState<"loading" | "ready" | "error">("loading");
  const [moving, setMoving] = React.useState(false);
  const loc = useApproxLocation();

  // Lock page scroll while the overlay is open; Escape closes it.
  React.useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onCancel]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const maplibre = await loadMapLibre();
        if (cancelled || !containerRef.current) return;
        const map = new maplibre.Map({
          container: containerRef.current,
          style: MAP_STYLE,
          center: [initial.lng, initial.lat],
          zoom: zoomed ? 17 : 14,
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
        });
        map.touchZoomRotate.disableRotation();
        map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");
        map.on("load", () => !cancelled && setState("ready"));
        map.on("error", () => {
          if (!cancelled && !map.isStyleLoaded()) setState("error");
        });
        map.on("movestart", () => setMoving(true));
        map.on("moveend", () => {
          const c = map.getCenter();
          setMoving(false);
          setCenter({ lat: c.lat, lng: c.lng });
        });
        mapRef.current = map;
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map is created once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flyToMe = async () => {
    const coords = await loc.request();
    if (!coords) {
      toast.error("Konumun alınamadı.");
      return;
    }
    mapRef.current?.flyTo({ center: [coords.lng, coords.lat], zoom: 17 });
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-background" role="dialog" aria-modal="true" aria-label="Konumu haritada işaretle">
      <HideBottomNav />
      <header className="flex items-center gap-1 border-b bg-background px-2 pt-safe">
        <div className="flex h-(--topbar-h) w-full items-center gap-1">
          <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={onCancel} aria-label="Kapat">
            <X className="size-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-tight font-bold">Konumu işaretle</p>
            <p className="truncate text-xs text-muted-foreground">Haritayı kaydırarak iğneyi işletmenin üzerine getir.</p>
          </div>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" aria-label="Harita" />
        {/* Fixed centre pin: the map moves underneath it. */}
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full" aria-hidden>
          <MapPin
            className={`size-11 fill-primary text-primary-foreground drop-shadow-lg transition-transform duration-150 ${moving ? "-translate-y-2" : ""}`}
            strokeWidth={1.5}
          />
        </div>
        <span className="pointer-events-none absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/60" aria-hidden />

        {state !== "ready" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted/80 px-6 text-center">
            {state === "loading" ? (
              <>
                <Loader2 className="size-7 animate-spin text-primary" aria-hidden />
                <p className="text-sm font-semibold">Harita yükleniyor…</p>
              </>
            ) : (
              <>
                <p className="font-bold">Harita yüklenemedi</p>
                <p className="text-sm text-muted-foreground">İnternet bağlantını kontrol et. Konumu daha sonra da ekleyebilirsin.</p>
                <Button type="button" variant="outline" onClick={onCancel}>
                  Kapat
                </Button>
              </>
            )}
          </div>
        ) : null}

        <Button
          type="button"
          variant="secondary"
          onClick={flyToMe}
          disabled={state !== "ready" || loc.status === "locating"}
          className="absolute right-3 bottom-4 h-11 rounded-full bg-card shadow-card"
        >
          {loc.status === "locating" ? <Loader2 className="animate-spin" /> : <LocateFixed />}
          Konumum
        </Button>
      </div>

      <div className="border-t bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        <Button type="button" size="lg" className="w-full" disabled={state !== "ready" || moving} onClick={() => onConfirm(center)}>
          <Check /> Bu konumu kullan
        </Button>
      </div>
    </div>,
    document.body,
  );
}
