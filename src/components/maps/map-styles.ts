/**
 * JSON map styles (MapOptions.styles) of every Google map in the app. They work on raster maps without a Map ID (the
 * API ignores them only when a Map ID or a vector map is used, and this app has neither).
 *
 * - Google's own points of interest (businesses, attractions, schools, hospitals, places of worship...) and the transit
 *   station icons are hidden: the map shows only our pins. Roads, water and the green park areas stay.
 * - Dark theme: a full dark palette (close to the app's dark map tone) so the map is dark whether or not Google applies
 *   the `colorScheme` option under custom styles.
 */
import type { GMapTypeStyle } from "@/lib/maps/google";

const OFF = [{ visibility: "off" }];

/** Hide Google's POIs (all categories, incl. poi.business) and transit station icons; keep the park areas. */
const HIDE_GOOGLE_POIS: GMapTypeStyle[] = [
  { featureType: "poi", stylers: OFF },
  // Later rules win: bring back only the green shading of parks (no icon, no label).
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }] },
  { featureType: "poi.park", elementType: "labels", stylers: OFF },
  { featureType: "transit.station", elementType: "labels", stylers: OFF },
];

/** Dark palette (tones of .gz-map-pattern in dark mode). */
const DARK_BASE: GMapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#1d2524" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9aa6a3" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1d2524" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#3b4845" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#c4cdca" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#212a29" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#1f2826" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1f3a2d" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#303b39" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1a2120" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#8f9b98" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#404c49" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1a2120" }] },
  { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#b3bdba" }] },
  { featureType: "transit.line", elementType: "geometry", stylers: [{ color: "#2b3533" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#15303a" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#4f7584" }] },
];

/** Styles for a new map in the given theme. */
export function mapStyles(dark: boolean): GMapTypeStyle[] {
  return dark ? [...DARK_BASE, ...HIDE_GOOGLE_POIS] : HIDE_GOOGLE_POIS;
}
