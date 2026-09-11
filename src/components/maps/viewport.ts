/**
 * Web Mercator helpers for the Google map views: where to centre and how far to zoom so that points (or one point) sit
 * inside the part of the map left free by overlays (padding). Google's fitBounds has no max zoom and panTo has no
 * padding, so the camera is computed here and set with setCenter / setZoom / panTo. Pure TS.
 */
import type { LatLng } from "@/core/geo";
import type { MapPadding } from "./types";

/** World size (px) at zoom 0. */
const TILE = 256;
const MIN_AREA = 40;

type Pt = { x: number; y: number };
export type Box = { width: number; height: number };
export type Camera = { center: LatLng; zoom: number };

function project(p: LatLng): Pt {
  const s = Math.min(Math.max(Math.sin((p.lat * Math.PI) / 180), -0.9999), 0.9999);
  return { x: TILE * (0.5 + p.lng / 360), y: TILE * (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) };
}

function unproject(pt: Pt): LatLng {
  const n = Math.PI - (2 * Math.PI * pt.y) / TILE;
  return { lat: (180 / Math.PI) * Math.atan(Math.sinh(n)), lng: (pt.x / TILE - 0.5) * 360 };
}

/** Shrink padding that would leave less than 60 px of map (small screens, tall sheets). */
export function clampPadding(p: MapPadding, box: Box): MapPadding {
  const out = { ...p };
  if (box.height > 0 && out.top + out.bottom > box.height - 60) {
    const f = Math.max(0, box.height - 60) / (out.top + out.bottom);
    out.top = Math.floor(out.top * f);
    out.bottom = Math.floor(out.bottom * f);
  }
  if (box.width > 0 && out.left + out.right > box.width - 60) {
    out.left = 20;
    out.right = 20;
  }
  return out;
}

/** Map centre that shows `target` in the middle of the padded area at `zoom`. */
export function paddedCenter(target: LatLng, zoom: number, pad: MapPadding): LatLng {
  const scale = 2 ** zoom;
  const w = project(target);
  const dx = (pad.left - pad.right) / 2;
  const dy = (pad.top - pad.bottom) / 2;
  return unproject({ x: w.x - dx / scale, y: w.y - dy / scale });
}

/** Camera that fits every point into the padded area (whole zoom levels, clamped to [minZoom, maxZoom]). */
export function fitCamera(points: LatLng[], box: Box, pad: MapPadding, minZoom: number, maxZoom: number): Camera {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    const w = project(p);
    minX = Math.min(minX, w.x);
    maxX = Math.max(maxX, w.x);
    minY = Math.min(minY, w.y);
    maxY = Math.max(maxY, w.y);
  }
  const availW = Math.max(MIN_AREA, box.width - pad.left - pad.right);
  const availH = Math.max(MIN_AREA, box.height - pad.top - pad.bottom);
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const raw = Math.floor(Math.log2(Math.min(availW / spanX, availH / spanY)));
  const zoom = Math.min(maxZoom, Math.max(minZoom, raw));
  const mid = unproject({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
  return { zoom, center: paddedCenter(mid, zoom, pad) };
}
