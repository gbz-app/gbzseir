import {
  AirVent,
  BookOpenCheck,
  Bug,
  Building2,
  Cake,
  Calculator,
  Camera,
  Droplet,
  Droplets,
  Drill,
  Ellipsis,
  Flame,
  GraduationCap,
  Grid3x3,
  HardHat,
  Heart,
  Heater,
  House,
  KeyRound,
  LampCeiling,
  Languages,
  Layers,
  LayoutGrid,
  Package,
  PaintRoller,
  PanelTop,
  PartyPopper,
  Scissors,
  Sofa,
  Sparkle,
  Sparkles,
  Trees,
  Truck,
  WashingMachine,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * service_categories.icon holds a lucide icon name (kebab-case). Only the icons used by the catalog are
 * imported (no dynamic import of the whole icon set); unknown names fall back to a wrench.
 */
const ICONS: Record<string, LucideIcon> = {
  "air-vent": AirVent,
  "book-open-check": BookOpenCheck,
  bug: Bug,
  "building-2": Building2,
  cake: Cake,
  calculator: Calculator,
  camera: Camera,
  drill: Drill,
  droplets: Droplets,
  ellipsis: Ellipsis,
  flame: Flame,
  "graduation-cap": GraduationCap,
  "grid-3x3": Grid3x3,
  "hard-hat": HardHat,
  heart: Heart,
  heater: Heater,
  house: House,
  "key-round": KeyRound,
  "lamp-ceiling": LampCeiling,
  languages: Languages,
  layers: Layers,
  "layout-grid": LayoutGrid,
  package: Package,
  "paint-roller": PaintRoller,
  "panel-top": PanelTop,
  "party-popper": PartyPopper,
  scissors: Scissors,
  sofa: Sofa,
  sparkle: Sparkle,
  sparkles: Sparkles,
  trees: Trees,
  truck: Truck,
  "washing-machine": WashingMachine,
  waves: Droplet,
  wrench: Wrench,
  zap: Zap,
};

/** Icon names an admin can pick for a category. */
export const SERVICE_ICON_NAMES = Object.keys(ICONS);

export function serviceIconFor(name: string | null | undefined): LucideIcon {
  return (name && ICONS[name]) || Wrench;
}

/** Category icon (decorative). Server-safe. */
export function ServiceIcon({ name, className, strokeWidth = 1.9 }: { name: string | null | undefined; className?: string; strokeWidth?: number }) {
  // createElement with a module-level icon component (looked up, not created during render).
  return React.createElement(serviceIconFor(name), { className: cn("size-5", className), strokeWidth, "aria-hidden": true });
}

/** Icon in a soft brand-colored bubble (cards, list rows). */
export function ServiceIconBubble({ name, size = "md", className }: { name: string | null | undefined; size?: "sm" | "md" | "lg"; className?: string }) {
  const box = size === "sm" ? "size-10 rounded-xl" : size === "lg" ? "size-14 rounded-2xl" : "size-12 rounded-2xl";
  const icon = size === "sm" ? "size-5" : size === "lg" ? "size-7" : "size-6";
  return (
    <span className={cn("flex shrink-0 items-center justify-center bg-brand-soft text-primary", box, className)}>
      <ServiceIcon name={name} className={icon} />
    </span>
  );
}
