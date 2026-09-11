"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Check, LocateFixed, Loader2, Map as MapIcon, MapPin, MapPinOff, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { HideBottomNav } from "@/components/layout/nav-visibility";
import { MAP_UNAVAILABLE_TITLE, MapPattern } from "@/components/maps/map-states";
import { CITY } from "@/config/site";
import { distanceMeters, roundCoord, type LatLng } from "@/core/geo";
import { createClient } from "@/lib/supabase/client";
import { useApproxLocation } from "@/lib/location/use-approx-location";
import {
  googleMapsAvailable,
  loadGoogleMaps,
  newPlacesSession,
  onGoogleMapsAuthFailure,
  resolvePlace,
  reverseGeocode,
  searchPlaces,
  type GMap,
  type GMapsEventListener,
  type GSessionToken,
  type PlaceSuggestion,
} from "@/lib/maps/google";

const DEFAULT_HINT = "Haritayı kaydırarak iğneyi işletmenin üzerine getir.";
/** Google map created but never idle by then: show the unavailable notice. */
const MAP_READY_TIMEOUT_MS = 12_000;

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
  /** Google Maps only: the address suggested for the confirmed pin (reverse geocoding or the chosen search result). */
  onAddress?: (address: string) => void;
  /** One line under the map title (default: the business copy). */
  hint?: string;
  /** Open the map right after the field mounts (admin "Konumu eksik" queue). */
  autoOpen?: boolean;
  id?: string;
};

const subscribeNoop = () => () => {};
/** False during SSR and hydration, true afterwards (the map is a portal into document.body). */
function useIsClient(): boolean {
  return React.useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

/**
 * Form field: "Konumumu kullan" / "Haritada seç" + a full-screen Google pin-drop map with a fixed centre pin, address
 * search and the suggested address. Without NEXT_PUBLIC_GOOGLE_MAPS_KEY, or when Google cannot load or refuses the key,
 * the opening shows a calm "Harita şu an kullanılamıyor" notice instead (the pin can be added later).
 */
export function LocationPicker({ value, onChange, fallbackCenter, onNeighbourhood, onAddress, hint = DEFAULT_HINT, autoOpen = false, id }: LocationPickerProps) {
  // null until the user opens or closes the map; autoOpen then shows it right after hydration.
  const [open, setOpen] = React.useState<boolean | null>(null);
  const [start, setStart] = React.useState<LatLng | null>(null);
  const [unavailable, setUnavailable] = React.useState(() => !googleMapsAvailable());
  const isClient = useIsClient();
  const loc = useApproxLocation();
  const shown = open ?? (autoOpen && isClient);

  const openAt = (center: LatLng | null) => {
    setStart(center);
    setUnavailable(!googleMapsAvailable());
    setOpen(true);
  };
  const close = React.useCallback(() => setOpen(false), []);
  const markUnavailable = React.useCallback(() => setUnavailable(true), []);

  const locateMe = async () => {
    const coords = await loc.request();
    if (!coords) {
      toast.error("Konumun alınamadı. Haritada kendin işaretleyebilirsin.");
      return;
    }
    // The device location is rounded (~100 m); let the owner place the pin exactly.
    openAt(coords);
  };

  const confirm = async (p: LatLng, address: string | null) => {
    const pin = roundPin(p);
    onChange(pin);
    if (address && onAddress) onAddress(address);
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

  const initial = start ?? value ?? fallbackCenter ?? CITY.center;
  const zoomed = !!(start ?? value);

  return (
    <div id={id}>
      {value ? (
        <div className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3.5">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success">
            <MapPin className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Konum işaretlendi</p>
            <p className="truncate text-xs text-muted-foreground tabular-nums">
              {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => openAt(value)}>
            Değiştir
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Konumu kaldır" onClick={() => onChange(null)} className="text-muted-foreground">
            <Trash2 />
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" className="h-12 px-3" onClick={locateMe} disabled={loc.status === "locating"}>
            {loc.status === "locating" ? <Loader2 className="animate-spin" /> : <LocateFixed />}
            Konumumu kullan
          </Button>
          <Button type="button" variant="secondary" className="h-12 px-3" onClick={() => openAt(null)}>
            <MapIcon /> Haritada seç
          </Button>
        </div>
      )}
      {shown ? (
        unavailable ? (
          <UnavailableOverlay hint={hint} onCancel={close} />
        ) : (
          <GoogleOverlay initial={initial} zoomed={zoomed} hint={hint} onCancel={close} onConfirm={confirm} onFallback={markUnavailable} />
        )
      ) : null}
    </div>
  );
}

type OverlayProps = {
  initial: LatLng;
  zoomed: boolean;
  hint: string;
  onCancel: () => void;
  onConfirm: (p: LatLng, address: string | null) => void;
};

/**
 * Full-screen chrome of the map (and of its unavailable notice): title bar, map area, bottom bar. No borders or shadows.
 * A nested Radix dialog, so it also works on top of another modal (admin PlaceDialog): the dialog underneath would
 * otherwise keep the pointer events (body pointer-events: none), pull focus out of the address search and close itself
 * on Escape. Radix also locks page scroll and traps focus here; Escape closes only the map.
 */
function OverlayFrame({ hint, onCancel, footer, children }: { hint: string; onCancel: () => void; footer: React.ReactNode; children: React.ReactNode }) {
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(o) => {
        if (!o) onCancel();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          className="fixed inset-0 z-[60] flex flex-col bg-background outline-none"
          onEscapeKeyDown={(e) => {
            // Escape in a filled address search clears it (PlaceSearch) instead of closing the map.
            const t = e.target;
            if (t instanceof HTMLInputElement && t.dataset.pickerSearch !== undefined && t.value) e.preventDefault();
          }}
          // Full screen, nothing outside to click: a tap on a toast must not close the map.
          onInteractOutside={(e) => e.preventDefault()}
        >
          <HideBottomNav />
          <header className="bg-background px-2 pt-safe">
            <div className="flex h-(--topbar-h) w-full items-center gap-1">
              <Button type="button" variant="ghost" size="icon" className="rounded-full" onClick={onCancel} aria-label="Kapat">
                <X className="size-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="text-[15px] leading-tight font-bold">Konumu işaretle</DialogPrimitive.Title>
                <DialogPrimitive.Description className="truncate text-xs text-muted-foreground">{hint}</DialogPrimitive.Description>
              </div>
            </div>
          </header>
          <div className="relative min-h-0 flex-1">{children}</div>
          <div className="bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">{footer}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Fixed centre pin: the map moves underneath it. */
function CenterPin({ moving }: { moving: boolean }) {
  return (
    <>
      <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-full" aria-hidden>
        <MapPin className={`size-11 fill-primary text-primary-foreground transition-transform duration-150 ${moving ? "-translate-y-2" : ""}`} strokeWidth={1.5} />
      </div>
      <span className="pointer-events-none absolute top-1/2 left-1/2 z-10 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/60" aria-hidden />
    </>
  );
}

function MapStatus({ state }: { state: "loading" | "unavailable" }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-muted/80 px-6 text-center" role="status">
      {state === "loading" ? (
        <>
          <Loader2 className="size-7 animate-spin text-primary" aria-hidden />
          <p className="text-sm font-semibold">Harita yükleniyor…</p>
        </>
      ) : (
        <>
          <MapPinOff className="size-7 text-muted-foreground" aria-hidden />
          <p className="font-bold">{MAP_UNAVAILABLE_TITLE}</p>
          <p className="text-sm text-muted-foreground">Konumu daha sonra da ekleyebilirsin.</p>
        </>
      )}
    </div>
  );
}

/** No key, key refused or Google could not load: a calm notice in the same frame, closed from the bottom bar. */
function UnavailableOverlay({ hint, onCancel }: { hint: string; onCancel: () => void }) {
  return (
    <OverlayFrame
      hint={hint}
      onCancel={onCancel}
      footer={
        <Button type="button" size="lg" variant="secondary" className="w-full" onClick={onCancel}>
          Kapat
        </Button>
      }
    >
      <MapPattern className="absolute inset-0" />
      <MapStatus state="unavailable" />
    </OverlayFrame>
  );
}

function LocateButton({ onClick, disabled, locating, className }: { onClick: () => void; disabled: boolean; locating: boolean; className: string }) {
  return (
    <Button type="button" variant="secondary" onClick={onClick} disabled={disabled} className={`absolute z-10 h-11 rounded-full bg-card hover:bg-card ${className}`}>
      {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
      Konumumu kullan
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Google Maps (address search + suggested address)
// ---------------------------------------------------------------------------
function GoogleOverlay({ initial, zoomed, hint, onCancel, onConfirm, onFallback }: OverlayProps & { onFallback: () => void }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<GMap | null>(null);
  const [center, setCenter] = React.useState<LatLng>(initial);
  const [ready, setReady] = React.useState(false);
  const [moving, setMoving] = React.useState(false);
  const [address, setAddress] = React.useState<string | null>(null);
  const [geocoding, setGeocoding] = React.useState(false);
  const loc = useApproxLocation();
  const geo = React.useRef<{ timer: number | null; seq: number }>({ timer: null, seq: 0 });
  /** Address of the search result the map was moved to (kept while the pin stays on it). */
  const picked = React.useRef<{ point: LatLng; address: string | null } | null>(null);

  /** Suggested address of the point under the pin, looked up once the map stops. */
  const lookupAddress = React.useCallback((p: LatLng) => {
    const g = geo.current;
    if (g.timer) window.clearTimeout(g.timer);
    const seq = ++g.seq;
    const hit = picked.current;
    if (hit && distanceMeters(hit.point, p) < 3) {
      setAddress(hit.address);
      setGeocoding(false);
      return;
    }
    picked.current = null;
    setGeocoding(true);
    g.timer = window.setTimeout(async () => {
      const found = await reverseGeocode(p);
      if (seq !== geo.current.seq) return;
      setAddress(found);
      setGeocoding(false);
    }, 350);
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const listeners: GMapsEventListener[] = [];
    const g = geo.current;
    const fallback = () => {
      if (!cancelled) onFallback();
    };
    const offAuth = onGoogleMapsAuthFailure(fallback);
    let idled = false;
    let readyTimer: number | null = null;
    void (async () => {
      try {
        const maps = await loadGoogleMaps();
        const [{ Map }, { ControlPosition, ColorScheme }] = await Promise.all([maps.importLibrary("maps"), maps.importLibrary("core")]);
        if (cancelled || !containerRef.current) return;
        // The script loaded but the map never settles (tiles blocked, no connection): show the unavailable notice.
        readyTimer = window.setTimeout(() => {
          if (!idled) fallback();
        }, MAP_READY_TIMEOUT_MS);
        const map = new Map(containerRef.current, {
          center: { lat: initial.lat, lng: initial.lng },
          zoom: zoomed ? 18 : 14,
          disableDefaultUI: true,
          zoomControl: true,
          zoomControlOptions: { position: ControlPosition.RIGHT_CENTER },
          clickableIcons: false,
          gestureHandling: "greedy",
          keyboardShortcuts: false,
          // Follows the app theme (set once, when the map is created; no Map ID needed).
          colorScheme: document.documentElement.classList.contains("dark") ? (ColorScheme?.DARK ?? "DARK") : (ColorScheme?.LIGHT ?? "LIGHT"),
        });
        listeners.push(map.addListener("center_changed", () => setMoving(true)));
        listeners.push(
          map.addListener("idle", () => {
            if (cancelled) return;
            idled = true;
            const c = map.getCenter();
            setMoving(false);
            setReady(true);
            if (!c) return;
            const p = { lat: c.lat(), lng: c.lng() };
            setCenter(p);
            lookupAddress(p);
          }),
        );
        mapRef.current = map;
      } catch {
        // Google could not load (network, blocked script, no quota): show the unavailable notice.
        fallback();
      }
    })();
    return () => {
      cancelled = true;
      offAuth();
      if (readyTimer) window.clearTimeout(readyTimer);
      for (const l of listeners) l.remove();
      if (g.timer) window.clearTimeout(g.timer);
      g.seq += 1;
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
    mapRef.current?.panTo(coords);
    mapRef.current?.setZoom(18);
  };

  const goTo = async (s: PlaceSuggestion) => {
    try {
      const r = await resolvePlace(s.prediction);
      if (!r) {
        toast.error("Bu yerin konumu bulunamadı. Haritada kendin işaretle.");
        return;
      }
      picked.current = { point: r.point, address: r.address };
      setAddress(r.address);
      mapRef.current?.panTo(r.point);
      mapRef.current?.setZoom(18);
    } catch {
      toast.error("Yer bilgisi alınamadı. Tekrar dene.");
    }
  };

  const addressText = moving ? "İğneyi bırakınca adresi bulacağız…" : geocoding ? "Adres bulunuyor…" : (address ?? "Bu nokta için adres bulunamadı. İğneyi yine de kullanabilirsin.");

  return (
    <OverlayFrame
      hint={hint}
      onCancel={onCancel}
      footer={
        <>
          <div className="mb-3 flex min-h-10 items-start gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p className="min-w-0 flex-1 text-sm leading-snug" aria-live="polite">
              {addressText}
            </p>
          </div>
          <Button type="button" size="lg" className="w-full" disabled={!ready || moving} onClick={() => onConfirm(center, geocoding ? null : address)}>
            <Check /> Bu konumu kullan
          </Button>
        </>
      }
    >
      <div ref={containerRef} className="absolute inset-0" aria-label="Harita" />
      <CenterPin moving={moving} />
      {ready ? <PlaceSearch onPick={goTo} /> : <MapStatus state="loading" />}
      <LocateButton onClick={flyToMe} disabled={!ready || loc.status === "locating"} locating={loc.status === "locating"} className="right-3 bottom-8" />
    </OverlayFrame>
  );
}

/** Address search over the Google map (Places Autocomplete, new Places API; Turkey only, biased to Gebze). */
function PlaceSearch({ onPick }: { onPick: (s: PlaceSuggestion) => void }) {
  const [q, setQ] = React.useState("");
  const [items, setItems] = React.useState<PlaceSuggestion[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const search = React.useRef<{ token: GSessionToken | null; timer: number | null; seq: number }>({ token: null, timer: null, seq: 0 });

  React.useEffect(() => {
    const s = search.current;
    return () => {
      if (s.timer) window.clearTimeout(s.timer);
      s.seq += 1;
    };
  }, []);

  const onInput = (v: string) => {
    const s = search.current;
    setQ(v);
    if (s.timer) window.clearTimeout(s.timer);
    const seq = ++s.seq;
    const text = v.trim();
    if (text.length < 2) {
      setItems([]);
      setBusy(false);
      setFailed(false);
      return;
    }
    setBusy(true);
    s.timer = window.setTimeout(async () => {
      try {
        s.token ??= await newPlacesSession();
        const list = await searchPlaces(text, s.token);
        if (seq !== s.seq) return;
        setItems(list);
        setFailed(false);
      } catch {
        if (seq !== s.seq) return;
        setItems([]);
        setFailed(true);
      } finally {
        if (seq === s.seq) setBusy(false);
      }
    }, 250);
  };

  const choose = (item: PlaceSuggestion) => {
    const s = search.current;
    s.seq += 1;
    // Resolving a prediction ends the billing session; the next search starts a new one.
    s.token = null;
    setItems([]);
    setBusy(false);
    setQ(item.main);
    onPick(item);
  };

  return (
    <div className="absolute inset-x-3 top-3 z-20">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            // OverlayFrame keeps the map open for this Escape (data-picker-search).
            if (e.key === "Escape" && q) onInput("");
          }}
          data-picker-search=""
          placeholder="Adres ya da yer ara"
          aria-label="Adres ya da yer ara"
          autoComplete="off"
          enterKeyHint="search"
          className="h-12 w-full rounded-full bg-card pr-11 pl-11 text-[15px] outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        {busy ? <Loader2 className="absolute top-1/2 right-4 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden /> : null}
      </div>
      {items.length ? (
        <ul className="mt-2 max-h-[45dvh] overflow-y-auto rounded-2xl bg-card py-1" aria-label="Arama sonuçları">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => choose(item)}
                className="flex w-full items-start gap-3 px-4 py-2.5 text-left outline-none hover:bg-muted focus-visible:bg-muted"
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{item.main}</span>
                  {item.secondary ? <span className="block truncate text-xs text-muted-foreground">{item.secondary}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : failed ? (
        <p className="mt-2 rounded-2xl bg-card px-4 py-2.5 text-sm text-muted-foreground">Arama şu an çalışmıyor. Haritayı kaydırarak işaretleyebilirsin.</p>
      ) : null}
    </div>
  );
}
