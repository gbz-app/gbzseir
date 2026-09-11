/**
 * Google Maps JS API for the browser: a one-time script loader (no npm package), the types of the map surface used by
 * src/components/maps (map, OverlayView pins) and the location picker helpers (Places Autocomplete (new Places API)
 * and reverse geocoding). The key is NEXT_PUBLIC_GOOGLE_MAPS_KEY (referrer-restricted); without it (or when Google
 * refuses it) callers show a calm "Harita şu an kullanılamıyor" state. There is no Map ID, so no AdvancedMarkerElement:
 * pins are DOM elements in an OverlayView. Every `new Map()` is a billed map load: create maps only after a user tap.
 * Only the API surface used here is typed (no @types/google.maps dependency).
 */
import { CITY } from "@/config/site";
import type { LatLng } from "@/core/geo";

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
const CALLBACK = "__gebzemGoogleMapsReady";
const LOAD_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Minimal types of the Google Maps JS API surface used in this app
// ---------------------------------------------------------------------------
export type GLatLngLiteral = { lat: number; lng: number };

export interface GLatLng {
  lat(): number;
  lng(): number;
}

export interface GMapsEventListener {
  remove(): void;
}

export type GMapOptions = {
  center: GLatLngLiteral;
  zoom: number;
  minZoom?: number;
  maxZoom?: number;
  disableDefaultUI?: boolean;
  zoomControl?: boolean;
  /** ControlPosition value from importLibrary("core"). */
  zoomControlOptions?: { position: number };
  clickableIcons?: boolean;
  gestureHandling?: "greedy" | "cooperative" | "none" | "auto";
  keyboardShortcuts?: boolean;
  /** ColorScheme value from importLibrary("core"); works without a Map ID, only when the map is created. */
  colorScheme?: string;
  /** Color of the map div while tiles load. */
  backgroundColor?: string;
};

export interface GMap {
  getCenter(): GLatLng | undefined;
  panTo(latLng: GLatLngLiteral): void;
  setCenter(latLng: GLatLngLiteral): void;
  getZoom(): number | undefined;
  setZoom(zoom: number): void;
  addListener(event: string, handler: () => void): GMapsEventListener;
}

export type GPoint = { x: number; y: number };

export interface GMapCanvasProjection {
  fromLatLngToDivPixel(latLng: GLatLng): GPoint | null;
}

export interface GMapPanes {
  /** Pane for overlay elements that receive DOM events (our pin buttons). */
  overlayMouseTarget: HTMLElement;
  floatPane: HTMLElement;
}

/** google.maps.OverlayView: subclass it and implement onAdd / draw / onRemove. */
export interface GOverlayView {
  setMap(map: GMap | null): void;
  getPanes(): GMapPanes | null;
  getProjection(): GMapCanvasProjection | null;
  onAdd(): void;
  draw(): void;
  onRemove(): void;
}

export type GOverlayViewConstructor = new () => GOverlayView;
export type GLatLngConstructor = new (lat: number, lng: number) => GLatLng;

interface GCoreLibrary {
  ControlPosition: { RIGHT_CENTER: number; RIGHT_TOP: number; RIGHT_BOTTOM: number; LEFT_BOTTOM: number };
  LatLng: GLatLngConstructor;
  /** Missing on older API versions: fall back to the plain string values. */
  ColorScheme?: { DARK: string; LIGHT: string; FOLLOW_SYSTEM: string };
}

interface GMapsLibrary {
  Map: new (el: HTMLElement, opts: GMapOptions) => GMap;
  OverlayView: GOverlayViewConstructor;
}

type GGeocoderResult = { formatted_address: string; types: string[] };

interface GGeocodingLibrary {
  Geocoder: new () => {
    geocode(request: { location: GLatLngLiteral; language?: string; region?: string }): Promise<{ results: GGeocoderResult[] }>;
  };
}

type GFormattableText = { text: string };

interface GPlace {
  location?: GLatLng | null;
  formattedAddress?: string | null;
  displayName?: string | null;
  fetchFields(options: { fields: string[] }): Promise<{ place: GPlace }>;
}

export interface GPlacePrediction {
  placeId: string;
  text: GFormattableText;
  mainText: GFormattableText | null;
  secondaryText: GFormattableText | null;
  toPlace(): GPlace;
}

/** Opaque Places Autocomplete session token (one per search session, billing groups the requests). */
export type GSessionToken = { readonly __brand?: "AutocompleteSessionToken" };

interface GPlacesLibrary {
  AutocompleteSessionToken: new () => GSessionToken;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(request: {
      input: string;
      sessionToken?: GSessionToken;
      includedRegionCodes?: string[];
      locationBias?: { center: GLatLngLiteral; radius: number };
      language?: string;
      region?: string;
    }): Promise<{ suggestions: Array<{ placePrediction: GPlacePrediction | null }> }>;
  };
}

export interface GoogleMapsNamespace {
  importLibrary(name: "core"): Promise<GCoreLibrary>;
  importLibrary(name: "maps"): Promise<GMapsLibrary>;
  importLibrary(name: "geocoding"): Promise<GGeocodingLibrary>;
  importLibrary(name: "places"): Promise<GPlacesLibrary>;
}

type GoogleWindow = Window & {
  google?: { maps?: Partial<GoogleMapsNamespace> };
  gm_authFailure?: () => void;
  [CALLBACK]?: () => void;
};

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------
let loading: Promise<GoogleMapsNamespace> | null = null;
let authFailed = false;
const authListeners = new Set<() => void>();

/** True when a Google Maps key is configured and Google has not rejected it in this tab. */
export function googleMapsAvailable(): boolean {
  return KEY.length > 0 && !authFailed;
}

/** Called when Google rejects the key (e.g. the referrer is not allowed). Returns an unsubscribe function. */
export function onGoogleMapsAuthFailure(listener: () => void): () => void {
  authListeners.add(listener);
  return () => {
    authListeners.delete(listener);
  };
}

/**
 * Load the Maps JS API once per tab (script tag with loading=async and a callback). Rejects when there is no key, the
 * script fails or it takes too long; a later call tries again.
 */
export function loadGoogleMaps(): Promise<GoogleMapsNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Maps loads only in the browser."));
  if (!googleMapsAvailable()) return Promise.reject(new Error("Google Maps is not available."));
  const w = window as GoogleWindow;
  if (typeof w.google?.maps?.importLibrary === "function") return Promise.resolve(w.google.maps as GoogleMapsNamespace);
  if (loading) return loading;

  loading = new Promise<GoogleMapsNamespace>((resolve, reject) => {
    const script = document.createElement("script");
    const fail = (error: Error) => {
      window.clearTimeout(timer);
      // A script that still arrives after the timeout calls a no-op (not a missing global); the API is then on
      // window.google and the next loadGoogleMaps() resolves without another script tag.
      w[CALLBACK] = () => {};
      script.remove();
      loading = null;
      reject(error);
    };
    const timer = window.setTimeout(() => fail(new Error("Google Maps took too long to load.")), LOAD_TIMEOUT_MS);
    w[CALLBACK] = () => {
      window.clearTimeout(timer);
      delete w[CALLBACK];
      const maps = w.google?.maps;
      if (maps && typeof maps.importLibrary === "function") resolve(maps as GoogleMapsNamespace);
      else fail(new Error("Google Maps loaded without importLibrary."));
    };
    // Google calls this global when the key is refused (the map then shows its own error); callers show their calm
    // "Harita şu an kullanılamıyor" state instead.
    w.gm_authFailure = () => {
      authFailed = true;
      for (const l of [...authListeners]) l();
    };
    // No `libraries` param: list and detail maps only need "maps"/"core"; the location picker pulls "places" and
    // "geocoding" on demand through importLibrary.
    const params = new URLSearchParams({
      key: KEY,
      language: "tr",
      region: "TR",
      loading: "async",
      callback: CALLBACK,
    });
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => fail(new Error("Google Maps script failed to load."));
    document.head.appendChild(script);
  });
  return loading;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Bias for address search: Gebze centre, 25 km. */
const SEARCH_BIAS = { center: { lat: CITY.center.lat, lng: CITY.center.lng }, radius: 25_000 };

/** "Hacı Halil, 1203. Sk. No:5, 41400 Gebze/Kocaeli, Türkiye" -> without the country. */
export function shortAddress(formatted: string | null | undefined): string | null {
  const t = (formatted ?? "").replace(/,\s*(Türkiye|Turkey)\s*$/i, "").trim();
  return t ? t.slice(0, 200) : null;
}

/** Address of a point (street level first), or null. Never throws. */
export async function reverseGeocode(p: LatLng): Promise<string | null> {
  try {
    const maps = await loadGoogleMaps();
    const { Geocoder } = await maps.importLibrary("geocoding");
    const { results } = await new Geocoder().geocode({ location: { lat: p.lat, lng: p.lng }, language: "tr", region: "TR" });
    const best =
      results.find((r) => r.types.some((t) => t === "street_address" || t === "premise" || t === "subpremise")) ??
      results.find((r) => r.types.includes("route")) ??
      results[0];
    return shortAddress(best?.formatted_address);
  } catch {
    // ZERO_RESULTS rejects too.
    return null;
  }
}

export type PlaceSuggestion = { id: string; main: string; secondary: string | null; prediction: GPlacePrediction };

/** New Places API session token (one per typing session; resolving a place ends it). */
export async function newPlacesSession(): Promise<GSessionToken> {
  const maps = await loadGoogleMaps();
  const { AutocompleteSessionToken } = await maps.importLibrary("places");
  return new AutocompleteSessionToken();
}

/** Address / place suggestions in Turkey, biased to Gebze. Throws when the request fails. */
export async function searchPlaces(input: string, sessionToken?: GSessionToken): Promise<PlaceSuggestion[]> {
  const text = input.trim().slice(0, 120);
  if (text.length < 2) return [];
  const maps = await loadGoogleMaps();
  const { AutocompleteSuggestion } = await maps.importLibrary("places");
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: text,
    sessionToken,
    includedRegionCodes: ["tr"],
    locationBias: SEARCH_BIAS,
    language: "tr",
    region: "tr",
  });
  const out: PlaceSuggestion[] = [];
  for (const s of suggestions) {
    const p = s.placePrediction;
    if (!p) continue;
    out.push({ id: p.placeId, main: p.mainText?.text ?? p.text.text, secondary: p.secondaryText?.text ?? null, prediction: p });
  }
  return out.slice(0, 6);
}

/** Point and address of a suggestion (ends the autocomplete session). Null when it has no location. */
export async function resolvePlace(prediction: GPlacePrediction): Promise<{ point: LatLng; address: string | null; name: string | null } | null> {
  const { place } = await prediction.toPlace().fetchFields({ fields: ["location", "formattedAddress", "displayName"] });
  const loc = place.location;
  if (!loc) return null;
  return { point: { lat: loc.lat(), lng: loc.lng() }, address: shortAddress(place.formattedAddress), name: place.displayName ?? null };
}
