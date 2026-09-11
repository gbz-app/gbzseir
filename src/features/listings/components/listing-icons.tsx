import * as React from "react";
import {
  ArrowLeftRight,
  BadgeCheck,
  BedDouble,
  Boxes,
  Bus,
  CalendarDays,
  CircleCheck,
  Clock,
  Cog,
  Coins,
  Factory,
  Fuel,
  Gamepad2,
  Gauge,
  GraduationCap,
  Handshake,
  HardDrive,
  Hash,
  Hourglass,
  Layers,
  List,
  MapPinned,
  MemoryStick,
  Monitor,
  Package,
  Palette,
  Recycle,
  RefreshCw,
  Ruler,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Tag,
  Type,
  Users,
  UtensilsCrossed,
  Wrench,
  Zap,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";
import type { AttributeFieldType } from "../types";
import type { ChoiceOption } from "./choice-chips";

/** listing_categories.attributes_schema[].key -> icon (detail "Özellikler" rows and wizard fields). */
const ATTRIBUTE_ICONS: Record<string, LucideIcon> = {
  marka: Tag,
  model: Smartphone,
  renk: Palette,
  beden: Ruler,
  cinsiyet: Users,
  oda: BedDouble,
  m2: Ruler,
  yil: CalendarDays,
  km: Gauge,
  yakit: Fuel,
  vites: Cog,
  durum: Sparkles,
  garanti: ShieldCheck,
  kutu: Package,
  kapasite: Boxes,
  pazarlik: Handshake,
  takas: ArrowLeftRight,
  ekran_boyutu: Monitor,
  enerji_sinifi: Zap,
  hafiza: HardDrive,
  ram: MemoryStick,
  platform: Gamepad2,
  tur: Layers,
};

const TYPE_ICONS: Record<AttributeFieldType, LucideIcon> = {
  boolean: CircleCheck,
  number: Hash,
  select: List,
  text: Type,
};

/** Icon of an attribute: by key, else by field type. */
export function attributeIcon(key: string, type?: AttributeFieldType | null): LucideIcon {
  return ATTRIBUTE_ICONS[key] ?? (type ? TYPE_ICONS[type] : List);
}

/**
 * Field type guessed from a formatted AttributeRow value (describeAttributes writes "Evet"/"Hayır" for booleans and
 * tr-TR numbers), used only when the key has no icon of its own.
 */
export function inferAttributeType(value: string): AttributeFieldType {
  if (value === "Evet" || value === "Hayır") return "boolean";
  if (/^\d[\d.,]*$/.test(value)) return "number";
  return "select";
}

export type AttributeIconProps = Omit<LucideProps, "type"> & { attrKey: string; type?: AttributeFieldType | null };

/** Decorative icon of an attribute field. */
export function AttributeIcon({ attrKey, type, ...props }: AttributeIconProps) {
  return React.createElement(attributeIcon(attrKey, type), { "aria-hidden": true, ...props });
}

/** listings.attributes.durum */
export const CONDITION_ICONS: Record<string, LucideIcon> = {
  sifir: Sparkles,
  az_kullanilmis: BadgeCheck,
  ikinci_el: Recycle,
  hasarli: Wrench,
};

/** listings.job_work_type */
export const WORK_TYPE_ICONS: Record<string, LucideIcon> = {
  tam_zamanli: Clock,
  yari_zamanli: Hourglass,
  vardiyali: RefreshCw,
  stajyer: GraduationCap,
  gunluk: Sun,
};

/** listings.job_benefits (yan haklar). */
export const BENEFIT_ICONS: Record<string, LucideIcon> = {
  servis: Bus,
  yemek: UtensilsCrossed,
  sgk: ShieldCheck,
  prim: Coins,
  vardiya: RefreshCw,
};

/** "GOSB", "Dilovası OSB", "TOSB"... */
export function isOsb(label: string): boolean {
  return /\bOSB\b|^GOSB$|^TOSB$/i.test(label);
}

/** Icon of a job location label (OSB -> factory, else a map pin). */
export function jobLocationIcon(label: string): LucideIcon {
  return isOsb(label) ? Factory : MapPinned;
}

/** Adds a decorative icon to each chip option whose value is in the map. */
export function withOptionIcons<T extends string>(options: ChoiceOption<T>[], icons: Record<string, LucideIcon>): ChoiceOption<T>[] {
  return options.map((o) => {
    const icon = icons[o.value];
    return icon ? { ...o, icon: React.createElement(icon, { "aria-hidden": true }) } : o;
  });
}
