/**
 * Static configuration of the city guide: institution groups and categories (fallback of public.institution_categories),
 * place subkinds, bank / fuel brand / EV operator labels, /rehber sections, slug conventions and URL helpers.
 * Pure TS, safe on the server and in client components.
 */
import {
  Ambulance,
  Baby,
  Banknote,
  BookOpen,
  Briefcase,
  Building,
  Building2,
  Castle,
  Cross,
  Drama,
  EvCharger,
  Factory,
  FileText,
  Flame,
  Flower2,
  Fuel,
  Gavel,
  GraduationCap,
  HandCoins,
  HandHeart,
  Handshake,
  HeartHandshake,
  HeartPulse,
  Hospital,
  IdCard,
  Landmark,
  Library,
  Mail,
  MoonStar,
  Mountain,
  Presentation,
  Scale,
  School,
  Shield,
  ShoppingBasket,
  Siren,
  Smile,
  Sprout,
  Stamp,
  Stethoscope,
  TentTree,
  TrainFront,
  Trees,
  Trophy,
  Users,
  Vault,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { routes } from "@/core/routes";
import { categoryIcon } from "@/features/business/lib/category-visuals";
import { PLACE_CATEGORY_DEFS, placeCategoryMeta, type PlaceCategoryDef } from "@/features/nearby/config";
import type {
  GuideDetailKind,
  GuideListKind,
  GuideSection,
  InstitutionCategoryDef,
  InstitutionGroupDef,
  InstitutionGroupKey,
  Ownership,
  PlaceSubkindDef,
} from "./types";

/** Kinds listed by the guide, in hub order. */
export const GUIDE_LIST_KINDS = ["institution", "atm", "bank", "fuel", "ev_charge", "place"] as const satisfies readonly GuideListKind[];

/** Kinds whose detail page is /kurum/[slug]. */
export const GUIDE_DETAIL_KINDS = ["institution", "atm", "bank", "fuel", "ev_charge"] as const satisfies readonly GuideDetailKind[];

export function isGuideDetailKind(kind: string): kind is GuideDetailKind {
  return (GUIDE_DETAIL_KINDS as readonly string[]).includes(kind);
}

/** Singular / plural nouns of the guide kinds. */
export const GUIDE_KIND_META: Record<GuideListKind, { label: string; plural: string }> = {
  institution: { label: "Resmî kurum", plural: "Resmî kurumlar" },
  atm: { label: "ATM", plural: "ATM'ler" },
  bank: { label: "Banka şubesi", plural: "Banka şubeleri" },
  fuel: { label: "Akaryakıt istasyonu", plural: "Akaryakıt istasyonları" },
  ev_charge: { label: "Şarj istasyonu", plural: "Şarj istasyonları" },
  place: { label: "Gezilecek yer", plural: "Gezilecek yerler" },
};

/**
 * Slug prefixes of the non-institution /kurum kinds (the import script and the monthly ATM sync use them), so a
 * /kurum/<slug> path maps back to its kind. Institution slugs have no prefix.
 */
export const GUIDE_SLUG_PREFIX: Record<Exclude<GuideDetailKind, "institution">, string> = {
  atm: "atm-",
  bank: "banka-",
  fuel: "akaryakit-",
  ev_charge: "sarj-",
};

/** Kind of a /kurum/<slug> page from its slug prefix ("institution" when none matches). */
export function guideKindFromSlug(slug: string): GuideDetailKind {
  for (const [kind, prefix] of Object.entries(GUIDE_SLUG_PREFIX)) if (slug.startsWith(prefix)) return kind as GuideDetailKind;
  return "institution";
}

// ---------------------------------------------------------------------------
// Institution groups and categories
// ---------------------------------------------------------------------------
export const INSTITUTION_GROUPS: readonly InstitutionGroupDef[] = [
  { key: "yonetim", label: "Belediye ve kamu", icon: Landmark },
  { key: "guvenlik", label: "Güvenlik", icon: Siren },
  { key: "adalet", label: "Adalet", icon: Scale },
  { key: "saglik", label: "Sağlık", icon: Hospital },
  { key: "egitim", label: "Eğitim", icon: GraduationCap },
  { key: "iletisim", label: "PTT", icon: Mail },
];

const GROUP_KEYS = new Set<string>(INSTITUTION_GROUPS.map((g) => g.key));

export function parseInstitutionGroup(v: string | null | undefined): InstitutionGroupKey | null {
  return v && GROUP_KEYS.has(v) ? (v as InstitutionGroupKey) : null;
}

export function institutionGroupMeta(key: InstitutionGroupKey): InstitutionGroupDef {
  return INSTITUTION_GROUPS.find((g) => g.key === key) ?? INSTITUTION_GROUPS[0];
}

/** Fallback category of institutions (the migration never lets it be deleted). */
export const INSTITUTION_FALLBACK_CATEGORY = "diger_kamu";

/** Seed / fallback of public.institution_categories (same order, labels and icons as the migration). */
export const INSTITUTION_CATEGORY_DEFS: readonly InstitutionCategoryDef[] = (
  [
    ["belediye", "Belediye", "yonetim", "building-2"],
    ["kaymakamlik", "Kaymakamlık", "yonetim", "landmark"],
    ["nufus", "Nüfus müdürlüğü", "yonetim", "id-card"],
    ["tapu", "Tapu ve kadastro", "yonetim", "file-text"],
    ["vergi", "Vergi dairesi", "yonetim", "hand-coins"],
    ["sgk", "SGK", "yonetim", "heart-handshake"],
    ["iskur", "İŞKUR", "yonetim", "briefcase"],
    ["muftuluk", "Müftülük", "yonetim", "moon-star"],
    ["tarim", "Tarım ve orman", "yonetim", "sprout"],
    ["ticaret_odasi", "Ticaret odası", "yonetim", "handshake"],
    ["osb", "Organize sanayi", "yonetim", "factory"],
    ["kent_konseyi", "Kent konseyi", "yonetim", "users"],
    ["diger_kamu", "Diğer kamu kurumu", "yonetim", "building"],
    ["emniyet", "Emniyet", "guvenlik", "siren"],
    ["jandarma", "Jandarma", "guvenlik", "shield"],
    ["itfaiye", "İtfaiye", "guvenlik", "flame"],
    ["adliye", "Adliye", "adalet", "scale"],
    ["icra", "İcra dairesi", "adalet", "gavel"],
    ["noter", "Noter", "adalet", "stamp"],
    ["hastane", "Hastane", "saglik", "hospital"],
    ["aile_sagligi_merkezi", "Aile sağlığı merkezi", "saglik", "stethoscope"],
    ["toplum_sagligi", "Toplum sağlığı", "saglik", "heart-pulse"],
    ["agiz_dis", "Ağız ve diş sağlığı", "saglik", "smile"],
    ["ilce_saglik", "İlçe sağlık müdürlüğü", "saglik", "cross"],
    ["acil_saglik", "112 istasyonu", "saglik", "ambulance"],
    ["anaokulu", "Anaokulu", "egitim", "baby"],
    ["ilkokul", "İlkokul", "egitim", "school"],
    ["ortaokul", "Ortaokul", "egitim", "school"],
    ["lise", "Lise", "egitim", "book-open"],
    ["ozel_egitim", "Özel eğitim", "egitim", "hand-heart"],
    ["universite", "Üniversite", "egitim", "graduation-cap"],
    ["egitim_kurumu", "Eğitim kurumu", "egitim", "presentation"],
    ["kutuphane", "Kütüphane", "egitim", "library"],
    ["ptt", "PTT", "iletisim", "mail"],
  ] as const
).map(([key, label, group, icon], i) => ({ key, label, group, icon, sort: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 200, 210, 220, 300, 310, 320, 400, 410, 420, 430, 440, 450, 500, 510, 520, 530, 540, 550, 560, 570, 600][i], active: true }));

/** Lucide icons of the guide vocabularies (institution and guide place category icon names). */
const GUIDE_ICONS: Record<string, LucideIcon> = {
  ambulance: Ambulance,
  baby: Baby,
  banknote: Banknote,
  "book-open": BookOpen,
  briefcase: Briefcase,
  building: Building,
  "building-2": Building2,
  castle: Castle,
  cross: Cross,
  drama: Drama,
  "ev-charger": EvCharger,
  factory: Factory,
  "file-text": FileText,
  flame: Flame,
  "flower-2": Flower2,
  fuel: Fuel,
  gavel: Gavel,
  "graduation-cap": GraduationCap,
  "hand-coins": HandCoins,
  "hand-heart": HandHeart,
  handshake: Handshake,
  "heart-handshake": HeartHandshake,
  "heart-pulse": HeartPulse,
  hospital: Hospital,
  "id-card": IdCard,
  landmark: Landmark,
  library: Library,
  mail: Mail,
  "moon-star": MoonStar,
  mountain: Mountain,
  presentation: Presentation,
  scale: Scale,
  school: School,
  shield: Shield,
  "shopping-basket": ShoppingBasket,
  siren: Siren,
  smile: Smile,
  sprout: Sprout,
  stamp: Stamp,
  stethoscope: Stethoscope,
  "tent-tree": TentTree,
  "train-front": TrainFront,
  trees: Trees,
  trophy: Trophy,
  users: Users,
  vault: Vault,
  waves: Waves,
};

/** Icon names an admin can pick for an institution category (guide icons first, then the shared category icons). */
export const GUIDE_ICON_NAMES: readonly string[] = Object.keys(GUIDE_ICONS);

/** Lucide icon of a guide vocabulary icon name; the shared category icons next, then `fallback` (default Building2). */
export function guideIcon(name: string | null | undefined, fallback: LucideIcon = Building2): LucideIcon {
  return (name ? GUIDE_ICONS[name] : undefined) ?? categoryIcon(name, fallback);
}

export type InstitutionCategoryMeta = { key: string; label: string; group: InstitutionGroupKey; icon: LucideIcon };

/**
 * Label, group and icon of an institution category. With `defs` (getInstitutionCategories()) the admin's labels win and
 * admin-added keys resolve too; unknown keys show as the fallback category ("Diğer kamu kurumu").
 */
export function institutionCategoryMeta(
  key: string | null | undefined,
  defs: readonly InstitutionCategoryDef[] = INSTITUTION_CATEGORY_DEFS,
): InstitutionCategoryMeta {
  const def =
    (key ? defs.find((d) => d.key === key) ?? INSTITUTION_CATEGORY_DEFS.find((d) => d.key === key) : undefined) ??
    defs.find((d) => d.key === INSTITUTION_FALLBACK_CATEGORY) ??
    INSTITUTION_CATEGORY_DEFS.find((d) => d.key === INSTITUTION_FALLBACK_CATEGORY)!;
  return { key: def.key, label: def.label, group: def.group, icon: guideIcon(def.icon) };
}

/** Category keys of a group, in the vocabulary's order (inactive ones too: they still label rows). */
export function institutionCategoriesOf(group: InstitutionGroupKey, defs: readonly InstitutionCategoryDef[] = INSTITUTION_CATEGORY_DEFS): string[] {
  return defs.filter((d) => d.group === group).map((d) => d.key);
}

export const OWNERSHIP_LABELS: Record<Ownership, string> = { devlet: "Devlet", ozel: "Özel" };

export function parseOwnership(v: string | null | undefined): Ownership | null {
  return v === "devlet" || v === "ozel" ? v : null;
}

// ---------------------------------------------------------------------------
// Place subkinds (fallback of place_categories.subkinds)
// ---------------------------------------------------------------------------
export const PLACE_SUBKINDS: Readonly<Record<string, readonly PlaceSubkindDef[]>> = {
  tarihi: [
    { key: "cami", label: "Cami" },
    { key: "kale", label: "Kale" },
    { key: "turbe", label: "Türbe" },
    { key: "cesme", label: "Çeşme" },
    { key: "hamam", label: "Hamam" },
    { key: "kulliye", label: "Külliye" },
    { key: "anit", label: "Anıt" },
    { key: "antik_kent", label: "Antik kent" },
    { key: "kopru", label: "Köprü" },
  ],
  ulasim: [
    { key: "tren", label: "Tren istasyonu" },
    { key: "otogar", label: "Otogar" },
    { key: "iskele", label: "İskele" },
  ],
};

/** "stadyum" / "spor_salonu" -> "Stadyum" / "Spor salonu" for subkinds without a label. */
function humanize(key: string): string {
  const t = key.replace(/[_-]+/g, " ").trim();
  return t ? t.charAt(0).toLocaleUpperCase("tr-TR") + t.slice(1) : key;
}

/** Label of a place subkind (the category's list first, then any known list, then the key made readable). */
export function placeSubkindLabel(subkind: string | null | undefined, category?: string | null): string | null {
  if (!subkind) return null;
  const own = category ? PLACE_SUBKINDS[category]?.find((s) => s.key === subkind) : undefined;
  const any = own ?? Object.values(PLACE_SUBKINDS).flat().find((s) => s.key === subkind);
  return any?.label ?? humanize(subkind);
}

// ---------------------------------------------------------------------------
// Banks, fuel brands, EV operators (details.bank / brand / operator keys)
// ---------------------------------------------------------------------------
export const BANKS: Readonly<Record<string, string>> = {
  ziraat: "Ziraat Bankası",
  halkbank: "Halkbank",
  vakifbank: "VakıfBank",
  is_bankasi: "İş Bankası",
  garanti: "Garanti BBVA",
  akbank: "Akbank",
  yapikredi: "Yapı Kredi",
  qnb: "QNB",
  denizbank: "DenizBank",
  teb: "TEB",
  ing: "ING",
  hsbc: "HSBC",
  sekerbank: "Şekerbank",
  odeabank: "Odeabank",
  fibabanka: "Fibabanka",
  anadolubank: "Anadolubank",
  alternatifbank: "Alternatif Bank",
  burgan: "Burgan Bank",
  kuveytturk: "Kuveyt Türk",
  albaraka: "Albaraka Türk",
  turkiye_finans: "Türkiye Finans",
  vakif_katilim: "Vakıf Katılım",
  ziraat_katilim: "Ziraat Katılım",
  emlak_katilim: "Emlak Katılım",
  enpara: "Enpara",
  ptt: "PTT",
};

export const FUEL_BRANDS: Readonly<Record<string, string>> = {
  opet: "Opet",
  shell: "Shell",
  bp: "BP",
  petrol_ofisi: "Petrol Ofisi",
  aytemiz: "Aytemiz",
  lukoil: "Lukoil",
  total: "TotalEnergies",
  alpet: "Alpet",
  moil: "Moil",
  go: "GO",
  kadoil: "Kadoil",
  sunpet: "Sunpet",
  turkiye_petrolleri: "TP",
  clas: "Clas Petrol",
  nipet: "Nipet",
  termopet: "Termopet",
  bpet: "Bpet",
};

export const EV_OPERATORS: Readonly<Record<string, string>> = {
  zes: "ZES",
  esarj: "Eşarj",
  trugo: "Trugo",
  sharz: "Sharz",
  voltrun: "Voltrun",
  tesla: "Tesla",
  astor: "Astor Şarj",
  beefull: "Beefull",
  otowatt: "Otowatt",
  enyakit: "EnYakıt",
};

export const SOCKET_LABELS: Readonly<Record<string, string>> = {
  type2: "Type 2 (AC)",
  type2_combo: "CCS2 (DC)",
  chademo: "CHAdeMO (DC)",
  schuko: "Schuko",
};

const labelOf = (map: Readonly<Record<string, string>>, key: string | null | undefined) => (key ? (map[key] ?? humanize(key)) : null);

export const bankLabel = (key: string | null | undefined) => labelOf(BANKS, key);
export const fuelBrandLabel = (key: string | null | undefined) => labelOf(FUEL_BRANDS, key);
export const evOperatorLabel = (key: string | null | undefined) => labelOf(EV_OPERATORS, key);
export const socketLabel = (key: string) => SOCKET_LABELS[key] ?? humanize(key);

// ---------------------------------------------------------------------------
// /rehber sections
// ---------------------------------------------------------------------------
export const GUIDE_SECTIONS: readonly GuideSection[] = [
  // Resmî kurumlar
  {
    slug: "kamu",
    hub: "kurumlar",
    kind: "institution",
    group: "yonetim",
    label: "Belediye ve kamu",
    title: "Belediye ve kamu kurumları",
    description: "Belediye, kaymakamlık, nüfus, tapu, vergi daireleri ve diğer devlet daireleri.",
    icon: Landmark,
    subFilter: { by: "category", param: "alt" },
  },
  {
    slug: "guvenlik",
    hub: "kurumlar",
    kind: "institution",
    group: "guvenlik",
    label: "Güvenlik",
    title: "Emniyet, jandarma ve itfaiye",
    description: "Polis merkezleri, jandarma karakolları ve itfaiye grupları.",
    icon: Siren,
    subFilter: { by: "category", param: "alt" },
  },
  {
    slug: "adalet",
    hub: "kurumlar",
    kind: "institution",
    group: "adalet",
    label: "Adalet",
    title: "Adliye, icra ve noterler",
    description: "Adliye, icra daireleri ve noterlikler.",
    icon: Scale,
    subFilter: { by: "category", param: "alt" },
  },
  {
    slug: "saglik",
    hub: "kurumlar",
    kind: "institution",
    group: "saglik",
    label: "Sağlık",
    title: "Hastaneler ve sağlık merkezleri",
    description: "Hastaneler, aile sağlığı merkezleri ve toplum sağlığı birimleri.",
    icon: Hospital,
    subFilter: { by: "category", param: "alt" },
  },
  {
    slug: "egitim",
    hub: "kurumlar",
    kind: "institution",
    group: "egitim",
    label: "Eğitim",
    title: "Okullar ve üniversiteler",
    description: "Anaokulu, ilkokul, ortaokul, lise, üniversite ve kütüphaneler.",
    icon: GraduationCap,
    subFilter: { by: "category", param: "alt" },
  },
  {
    slug: "ptt",
    hub: "kurumlar",
    kind: "institution",
    group: "iletisim",
    label: "PTT",
    title: "PTT şubeleri",
    description: "PTT müdürlükleri ve dağıtım merkezleri.",
    icon: Mail,
  },
  // Günlük ihtiyaçlar
  {
    slug: "atm",
    hub: "gunluk",
    kind: "atm",
    label: "ATM",
    title: "ATM'ler",
    description: "Bankaya göre ATM noktaları.",
    icon: Banknote,
    subFilter: { by: "bank", param: "banka" },
  },
  {
    slug: "banka",
    hub: "gunluk",
    kind: "bank",
    label: "Banka",
    title: "Banka şubeleri",
    description: "Bankaya göre şubeler.",
    icon: Vault,
    subFilter: { by: "bank", param: "banka" },
  },
  {
    slug: "akaryakit",
    hub: "gunluk",
    kind: "fuel",
    label: "Akaryakıt",
    title: "Akaryakıt istasyonları",
    description: "Markaya göre akaryakıt istasyonları.",
    icon: Fuel,
    subFilter: { by: "brand", param: "marka" },
  },
  {
    slug: "sarj",
    hub: "gunluk",
    kind: "ev_charge",
    label: "Şarj",
    title: "Elektrikli araç şarj istasyonları",
    description: "Operatöre göre şarj noktaları.",
    icon: EvCharger,
    subFilter: { by: "operator", param: "operator" },
  },
  // Gezi ve kültür (details stay on /gezilecek-yerler/[slug])
  {
    slug: "tarihi",
    hub: "gezi",
    kind: "place",
    placeCategory: "tarihi",
    label: "Tarihi yerler",
    title: "Tarihi yerler",
    description: "Cami, türbe, çeşme, hamam, kale ve anıtlar.",
    icon: Castle,
    subFilter: { by: "subkind", param: "alt" },
  },
  { slug: "muze", hub: "gezi", kind: "place", placeCategory: "muze", label: "Müzeler", title: "Müzeler", description: "Gebze'deki müzeler.", icon: Landmark },
  { slug: "park", hub: "gezi", kind: "place", placeCategory: "park", label: "Parklar", title: "Parklar", description: "Parklar ve meydanlar.", icon: Trees },
  {
    slug: "tabiat-parki",
    hub: "gezi",
    kind: "place",
    placeCategory: "tabiat_parki",
    label: "Tabiat parkları",
    title: "Tabiat parkları",
    description: "Tabiat parkları ve mesire alanları.",
    icon: TentTree,
  },
  { slug: "doga", hub: "gezi", kind: "place", placeCategory: "doga", label: "Doğa", title: "Doğa alanları", description: "Doğa ve mesire alanları.", icon: Mountain },
  { slug: "sahil", hub: "gezi", kind: "place", placeCategory: "sahil", label: "Sahil", title: "Sahiller", description: "Sahil ve kıyı alanları.", icon: Waves },
  {
    slug: "kultur",
    hub: "gezi",
    kind: "place",
    placeCategory: "kultur",
    label: "Kültür ve sanat",
    title: "Kültür ve sanat",
    description: "Kültür merkezleri, gençlik merkezleri, galeriler ve sinemalar.",
    icon: Drama,
  },
  { slug: "spor", hub: "gezi", kind: "place", placeCategory: "spor", label: "Spor", title: "Spor tesisleri", description: "Stadyum, spor salonu ve yüzme havuzları.", icon: Trophy },
  { slug: "pazar", hub: "gezi", kind: "place", placeCategory: "pazar", label: "Pazar yerleri", title: "Pazar yerleri", description: "Kapalı ve açık pazar yerleri.", icon: ShoppingBasket },
  { slug: "mezarlik", hub: "gezi", kind: "place", placeCategory: "mezarlik", label: "Mezarlıklar", title: "Mezarlıklar", description: "Gebze'deki mezarlıklar.", icon: Flower2 },
  {
    slug: "ulasim",
    hub: "gezi",
    kind: "place",
    placeCategory: "ulasim",
    label: "Ulaşım",
    title: "Tren, otogar ve iskele",
    description: "Tren istasyonları, otogar ve feribot iskelesi.",
    icon: TrainFront,
    subFilter: { by: "subkind", param: "alt" },
  },
];

export const GUIDE_HUBS: ReadonlyArray<{ key: GuideSection["hub"]; title: string }> = [
  { key: "kurumlar", title: "Resmî kurumlar" },
  { key: "gunluk", title: "Günlük ihtiyaçlar" },
  { key: "gezi", title: "Gezi ve kültür" },
];

/** URL segment of a category key ("aile_sagligi_merkezi" -> "aile-sagligi-merkezi"). */
export const categorySlug = (key: string) => key.replace(/_/g, "-");

/**
 * Section of /rehber/<slug>. A section slug wins; an institution category slug ("nufus", "aile-sagligi-merkezi") opens its
 * group's section with that category chosen. `defs`: institution categories (admin-added keys resolve too).
 */
export function resolveGuideSection(
  slug: string | null | undefined,
  defs: readonly InstitutionCategoryDef[] = INSTITUTION_CATEGORY_DEFS,
): { section: GuideSection; category: string | null } | null {
  if (!slug) return null;
  const s = slug.trim().toLowerCase();
  const section = GUIDE_SECTIONS.find((x) => x.slug === s);
  if (section) return { section, category: null };
  const cat = defs.find((d) => categorySlug(d.key) === s) ?? INSTITUTION_CATEGORY_DEFS.find((d) => categorySlug(d.key) === s);
  if (!cat) return null;
  const groupSection = GUIDE_SECTIONS.find((x) => x.kind === "institution" && x.group === cat.group);
  return groupSection ? { section: groupSection, category: cat.key } : null;
}

/** Section that lists a row (for "Tümünü gör" links and breadcrumbs). */
export function sectionFor(kind: GuideListKind, category: string | null | undefined, defs: readonly InstitutionCategoryDef[] = INSTITUTION_CATEGORY_DEFS): GuideSection | null {
  if (kind === "institution") {
    const group = institutionCategoryMeta(category, defs).group;
    return GUIDE_SECTIONS.find((x) => x.kind === "institution" && x.group === group) ?? null;
  }
  if (kind === "place") return GUIDE_SECTIONS.find((x) => x.kind === "place" && x.placeCategory === category) ?? null;
  return GUIDE_SECTIONS.find((x) => x.kind === kind) ?? null;
}

/** Query keys of the /rehber/<slug> list page. */
export const GUIDE_PARAMS = {
  /** Institution category (institution sections) or place subkind (tarihi, ulasim). */
  sub: "alt",
  bank: "banka",
  brand: "marka",
  operator: "operator",
  ownership: "sahiplik",
  neighbourhood: "mahalle",
  q: "q",
  page: "sayfa",
} as const;

/** /rehber/<slug>?<param>=<value> of a section (value: a category / bank / brand / operator key, or a subkind). */
export function guideSectionHref(section: GuideSection, sub?: string | null): string {
  const param = section.subFilter?.param;
  return routes.guide.category(section.slug, param && sub ? { [param]: sub.replace(/_/g, "-") } : undefined);
}

/**
 * Label of what a guide row is: institution category, "<bank> ATM", bank, fuel brand, EV operator, or the place
 * category (admin labels win when `institutionDefs` / `placeDefs` are given). Null when unknown.
 */
export function guideCategoryLabel(
  kind: GuideListKind,
  d: { category: string | null; bank: string | null; brand: string | null; operator: string | null },
  institutionDefs: readonly InstitutionCategoryDef[] = INSTITUTION_CATEGORY_DEFS,
  placeDefs: readonly PlaceCategoryDef[] = PLACE_CATEGORY_DEFS,
): string | null {
  switch (kind) {
    case "institution":
      return institutionCategoryMeta(d.category, institutionDefs).label;
    case "atm":
      return d.bank ? `${bankLabel(d.bank)} ATM` : null;
    case "bank":
      return bankLabel(d.bank);
    case "fuel":
      return fuelBrandLabel(d.brand);
    case "ev_charge":
      return evOperatorLabel(d.operator);
    case "place":
      return placeCategoryMeta(d.category, placeDefs).label;
  }
}

/** Detail page of a guide row: /kurum/<slug>, places /gezilecek-yerler/<slug>. */
export function guideHref(kind: GuideListKind, slug: string): string {
  return kind === "place" ? routes.nearby.place(slug) : routes.guide.detail(slug);
}

/** Emergency numbers shown when app_settings.emergency_numbers cannot be read (same list as the migration seed). */
export const EMERGENCY_NUMBERS_FALLBACK = [
  { number: "112", label: "112 Acil Çağrı", description: "Ambulans, itfaiye, polis, jandarma, AFAD, orman yangını ve sahil güvenlik. Kocaeli'de hepsi 112'de karşılanır.", website: "https://www.112.gov.tr/kocaeli" },
  { number: "155", label: "155 Polis İmdat", description: "Çağrılar Kocaeli 112 Acil Çağrı Merkezi'nde karşılanır.", website: null },
  { number: "156", label: "156 Jandarma İmdat", description: "Çağrılar Kocaeli 112 Acil Çağrı Merkezi'nde karşılanır.", website: null },
  { number: "110", label: "110 İtfaiye", description: "Çağrılar Kocaeli 112 Acil Çağrı Merkezi'nde karşılanır.", website: null },
  { number: "177", label: "177 Orman Yangını İhbar", description: "Çağrılar Kocaeli 112 Acil Çağrı Merkezi'nde karşılanır.", website: null },
  {
    number: "153",
    label: "Alo 153 Büyükşehir Çağrı Merkezi",
    description: "Kocaeli Büyükşehir Belediyesi: ulaşım, sosyal hizmet, ilaçlama. 7/24. Kocaeli dışından 0262 153 00 00.",
    website: "https://www.kocaeli.bel.tr/hizmet/153-cagri-merkezi-2.html",
  },
  {
    number: "+902626420430",
    label: "Gebze Belediyesi Santral",
    description: "Talep ve şikâyetler için. Çözüm Masası'na internetten de başvurabilirsin.",
    website: "https://ebelediye.gebze.bel.tr/NicoPortal/faces/portal/beyazMasa/CozumMasasi.xhtml",
  },
  { number: "185", label: "Alo 185 Su Arıza (İSU)", description: "Su kesintisi, boru patlağı ve kanalizasyon arızası. 7/24.", website: "https://www.isu.gov.tr" },
  { number: "186", label: "Alo 186 Elektrik Arıza (SEDAŞ)", description: "Elektrik kesintisi ve arıza. 7/24.", website: "https://www.sedas.com" },
  { number: "187", label: "187 Doğalgaz Acil (Palgaz)", description: "Gaz kokusu ve kaçak. Gebze'de doğalgaz dağıtımı Palgaz'dadır. 7/24.", website: "https://www.palgaz.com.tr" },
] as const;
