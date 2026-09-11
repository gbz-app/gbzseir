/**
 * Doctors of sağlık businesses: public.business_staff + the public.doctor_branches vocabulary
 * (supabase/migrations/2026091377_business_staff.sql). Pure TS + lucide icons (server and client safe).
 * Calls always go to the clinic's phone; a doctor has no phone of their own.
 */
import {
  Baby,
  Bone,
  Brain,
  BrainCog,
  Ear,
  Eye,
  HandHeart,
  HeartPulse,
  Hospital,
  PersonStanding,
  Salad,
  ScanFace,
  Stethoscope,
  Toothbrush,
  UserRound,
  Venus,
  type LucideIcon,
} from "lucide-react";
import { DAY_KEYS, DAY_SHORT_LABELS, type DayKey } from "../../lib/hours";
import type { Vertical } from "../../lib/verticals";

/** Sağlık businesses list their doctors (the DB lets owners write rows only for this type). */
export function hasDoctors(v: Vertical | null | undefined): boolean {
  return v === "saglik";
}

/** business_staff.title check list, in picker order. */
export const DOCTOR_TITLES = ["Dr.", "Uzm. Dr.", "Doç. Dr.", "Prof. Dr.", "Dt.", "Uzm. Dt.", "Fzt.", "Psk.", "Klinik Psk.", "Dyt.", "Ebe", "Hemşire", "Diğer"] as const;
export type DoctorTitle = (typeof DOCTOR_TITLES)[number];

export function parseDoctorTitle(value: unknown): DoctorTitle {
  return typeof value === "string" && (DOCTOR_TITLES as readonly string[]).includes(value) ? (value as DoctorTitle) : "Dr.";
}

/** A row of public.doctor_branches. Serializable. */
export type DoctorBranch = { key: string; label: string; icon: string | null; active: boolean };

const branch = (key: string, label: string, icon: string): DoctorBranch => ({ key, label, icon, active: true });

/** Seed / fallback of public.doctor_branches (same order and texts as the migration). */
export const DOCTOR_BRANCHES: readonly DoctorBranch[] = [
  branch("dis_hekimi", "Diş hekimi", "toothbrush"),
  branch("goz", "Göz", "eye"),
  branch("kadin_dogum", "Kadın hastalıkları ve doğum", "venus"),
  branch("cocuk", "Çocuk sağlığı", "baby"),
  branch("dahiliye", "Dahiliye", "stethoscope"),
  branch("kardiyoloji", "Kardiyoloji", "heart-pulse"),
  branch("ortopedi", "Ortopedi", "bone"),
  branch("fizik_tedavi", "Fizik tedavi", "person-standing"),
  branch("dermatoloji", "Dermatoloji", "scan-face"),
  branch("kbb", "KBB", "ear"),
  branch("noroloji", "Nöroloji", "brain"),
  branch("psikiyatri", "Psikiyatri", "brain-cog"),
  branch("psikolog", "Psikolog", "hand-heart"),
  branch("diyetisyen", "Diyetisyen", "salad"),
  branch("pratisyen", "Genel pratisyen", "hospital"),
  branch("diger", "Diğer", "user-round"),
];

export const DEFAULT_DOCTOR_BRANCH = "diger";

const BRANCH_ICONS: Record<string, LucideIcon> = {
  toothbrush: Toothbrush,
  eye: Eye,
  venus: Venus,
  baby: Baby,
  stethoscope: Stethoscope,
  "heart-pulse": HeartPulse,
  bone: Bone,
  "person-standing": PersonStanding,
  "scan-face": ScanFace,
  ear: Ear,
  brain: Brain,
  "brain-cog": BrainCog,
  "hand-heart": HandHeart,
  salad: Salad,
  hospital: Hospital,
  "user-round": UserRound,
};

export function branchIcon(name: string | null | undefined): LucideIcon {
  return (name ? BRANCH_ICONS[name] : undefined) ?? Stethoscope;
}

/** Icon names branchIcon draws (the admin branch editor offers these). */
export const DOCTOR_BRANCH_ICON_NAMES: readonly string[] = Object.keys(BRANCH_ICONS);

/** The branch row of a key; a key missing from the list (database unreadable) falls back to the built-in list. */
export function findBranch(key: string, list: readonly DoctorBranch[] = DOCTOR_BRANCHES): DoctorBranch | null {
  return list.find((b) => b.key === key) ?? DOCTOR_BRANCHES.find((b) => b.key === key) ?? null;
}

export function branchLabel(key: string, list?: readonly DoctorBranch[]): string {
  return findBranch(key, list)?.label ?? "Diğer";
}

export type Doctor = {
  id: string;
  /** Profile page slug (/doktor/<slug>, business_staff.slug); null only when the column was not selected. */
  slug: string | null;
  business_id: string;
  name: string;
  title: DoctorTitle;
  branch: string;
  photo_url: string | null;
  bio: string | null;
  /** Working days at this clinic, week order. */
  days: DayKey[];
  hours_note: string | null;
  sort: number;
  is_active: boolean;
  /** Sample (seed) row: not indexed; its clinic is not callable. */
  is_demo: boolean;
};

/** A doctor with the clinic they work at (Keşfet > Sağlık > Doktorlar). */
export type DirectoryDoctor = Doctor & { clinic: { slug: string; name: string; neighbourhood_name: string | null; is_demo: boolean } };

export const DOCTOR_COLUMNS = "id,slug,business_id,name,title,branch,photo_url,bio,days,hours_note,sort,is_active,is_demo";

export type RawDoctor = Omit<Doctor, "slug" | "title" | "days" | "is_demo"> & {
  slug?: string | null;
  title: string;
  days: string[] | null;
  is_demo: boolean | null;
};

export function toDoctor(r: RawDoctor): Doctor {
  const days = new Set(r.days ?? []);
  return {
    id: r.id,
    slug: r.slug || null,
    business_id: r.business_id,
    name: r.name,
    title: parseDoctorTitle(r.title),
    branch: r.branch,
    photo_url: r.photo_url,
    bio: r.bio,
    days: DAY_KEYS.filter((k) => days.has(k)),
    hours_note: r.hours_note,
    sort: r.sort,
    is_active: r.is_active,
    is_demo: r.is_demo === true,
  };
}

/** "Uzm. Dr. Ayşe Yılmaz"; the "Diğer" title shows the name alone. */
export function doctorDisplayName(d: Pick<Doctor, "title" | "name">): string {
  return d.title === "Diğer" ? d.name : `${d.title} ${d.name}`;
}

/** "AY" for "Ayşe Yılmaz" (first and last word). */
export function doctorInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : "";
  return `${first}${last}`.toLocaleUpperCase("tr-TR");
}

/** "Her gün", "Hafta içi", "Hafta sonu", "Pzt - Çar, Cmt" or null when no day is set. */
export function formatDoctorDays(days: readonly DayKey[]): string | null {
  if (!days.length) return null;
  const set = new Set(days);
  if (set.size === 7) return "Her gün";
  const weekdays: DayKey[] = ["mon", "tue", "wed", "thu", "fri"];
  if (set.size === 5 && weekdays.every((d) => set.has(d))) return "Hafta içi";
  if (set.size === 2 && set.has("sat") && set.has("sun")) return "Hafta sonu";
  const parts: string[] = [];
  let i = 0;
  while (i < DAY_KEYS.length) {
    if (!set.has(DAY_KEYS[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < DAY_KEYS.length && set.has(DAY_KEYS[j + 1])) j++;
    if (j - i >= 2) parts.push(`${DAY_SHORT_LABELS[DAY_KEYS[i]]} - ${DAY_SHORT_LABELS[DAY_KEYS[j]]}`);
    else for (let k = i; k <= j; k++) parts.push(DAY_SHORT_LABELS[DAY_KEYS[k]]);
    i = j + 1;
  }
  return parts.join(", ");
}
