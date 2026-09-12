/**
 * JSON map styles (MapOptions.styles) of every Google map in the app. They work on raster maps without a Map ID (the
 * API ignores them only when a Map ID or a vector map is used, and this app has neither).
 *
 * - Light: a quiet light-grey palette like Uber's map (grey land, white roads, soft blue water, faint green parks, grey
 *   labels, no road shield icons), so the app's light pins stand out.
 * - Dark: the same idea in neutral dark greys, so the map is dark whether or not Google applies the `colorScheme`
 *   option under custom styles.
 * - Google's own points of interest (businesses, attractions, schools, hospitals, places of worship...) and the transit
 *   station icons are hidden: the map shows only our pins. Roads, water and the park areas stay.
 */
import type { GMapTypeStyle } from "@/lib/maps/google";

const OFF = [{ visibility: "off" }];

/** Hide Google's POIs (all categories, incl. poi.business) and transit station icons; keep the park areas. */
const HIDE_GOOGLE_POIS: GMapTypeStyle[] = [
  { featureType: "poi", stylers: OFF },
  // Later rules win: bring back only the shading of parks (no icon, no label).
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }] },
  { featureType: "poi.park", elementType: "labels", stylers: OFF },
  { featureType: "transit.station", elementType: "labels", stylers: OFF },
];

/** Light palette (Uber-like greys). */
const LIGHT_BASE: GMapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#f3f4f6" }] },
  { elementType: "labels.icon", stylers: OFF },
  { elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#f3f4f6" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#d4d7dd" }] },
  { featureType: "administrative.land_parcel", elementType: "labels", stylers: OFF },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#374151" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#eceef1" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#f3f4f6" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#dcecdc" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#e7e9ed" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
  { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#6b7280" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#e3e6ea" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#d4d7dd" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#4b5563" }] },
  { featureType: "transit.line", elementType: "geometry", stylers: [{ color: "#e3e6ea" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#c8d8e5" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#7f97aa" }] },
];

/** Dark palette (neutral greys, the same tone as .gz-map-pattern in dark mode). */
const DARK_BASE: GMapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1c1c1e" }] },
  { elementType: "labels.icon", stylers: OFF },
  { elementType: "labels.text.fill", stylers: [{ color: "#8e8e93" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1c1c1e" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#3a3a3c" }] },
  { featureType: "administrative.land_parcel", elementType: "labels", stylers: OFF },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#c7c7cc" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#202022" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#1c1c1e" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1f2a22" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2c2c2e" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1a1a1c" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8e8e93" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#3a3a3c" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1a1a1c" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#aeaeb2" }] },
  { featureType: "transit.line", elementType: "geometry", stylers: [{ color: "#2c2c2e" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#16202a" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4d6475" }] },
];

/** Styles for a new map in the given theme. */
export function mapStyles(dark: boolean): GMapTypeStyle[] {
  return [...(dark ? DARK_BASE : LIGHT_BASE), ...HIDE_GOOGLE_POIS];
}
