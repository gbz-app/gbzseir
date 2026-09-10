import * as React from "react";
import {
  Armchair,
  Baby,
  BedDouble,
  BookOpen,
  Briefcase,
  CookingPot,
  Dumbbell,
  Ellipsis,
  Factory,
  Gamepad2,
  GraduationCap,
  Hammer,
  HardHat,
  Laptop,
  Package,
  Palette,
  Refrigerator,
  Shield,
  Shirt,
  Smartphone,
  Sofa,
  Sparkles,
  Stethoscope,
  Store,
  Tag,
  Tv,
  Utensils,
  Warehouse,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

/** listing_categories.icon (lucide kebab-case name) -> component. Only the icons used by the seed are bundled. */
const ICONS: Record<string, LucideIcon> = {
  smartphone: Smartphone,
  sofa: Sofa,
  shirt: Shirt,
  baby: Baby,
  dumbbell: Dumbbell,
  palette: Palette,
  "book-open": BookOpen,
  hammer: Hammer,
  package: Package,
  laptop: Laptop,
  tv: Tv,
  "gamepad-2": Gamepad2,
  armchair: Armchair,
  refrigerator: Refrigerator,
  "bed-double": BedDouble,
  "cooking-pot": CookingPot,
  factory: Factory,
  warehouse: Warehouse,
  store: Store,
  utensils: Utensils,
  sparkles: Sparkles,
  shield: Shield,
  briefcase: Briefcase,
  stethoscope: Stethoscope,
  "graduation-cap": GraduationCap,
  "hard-hat": HardHat,
  ellipsis: Ellipsis,
};

export type CategoryIconProps = Omit<LucideProps, "name"> & { iconName: string | null | undefined; fallback?: "tag" | "briefcase" };

/** Renders the lucide icon of a listing category (decorative). */
export function CategoryIcon({ iconName, fallback = "tag", ...props }: CategoryIconProps) {
  const icon = (iconName ? ICONS[iconName] : undefined) ?? (fallback === "briefcase" ? Briefcase : Tag);
  return React.createElement(icon, { "aria-hidden": true, ...props });
}
