import { Briefcase, Landmark, Newspaper, Tag, Wrench, type LucideIcon } from "lucide-react";
import { routes } from "@/core/routes";
import { trNormalize } from "@/core/tr";
import { VERTICAL_INFO, type Vertical } from "@/features/business/lib/verticals";
import { KIND_META } from "@/features/nearby/config";
import { SEARCH_MIN } from "./query";

/**
 * Categories of the search page: the "Kategoriler" grid (tile: true) and instant shortcuts that come up while typing
 * ("nöb" -> Nöbetçi eczane), matched on the device without a request.
 */
export type SearchShortcut = {
  key: string;
  href: string;
  label: string;
  /** Shorter label under the square tile (the tile truncates after ~11 characters). */
  tileLabel?: string;
  /** Second line of the shortcut row. */
  hint: string;
  icon: LucideIcon;
  tone: string;
  /** Tile picture (rows always use the icon). */
  image?: string;
  imageClassName?: string;
  tile: boolean;
  /** Folded words (trNormalize: lower case, no Turkish letters) that bring the shortcut up. */
  keywords: readonly string[];
};

const SKY = "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300";
const EMERALD = "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300";
const BRAND = "bg-brand-soft text-primary";

function vertical(v: Vertical, keywords: string[], extra?: Partial<SearchShortcut>): SearchShortcut {
  const info = VERTICAL_INFO[v];
  return {
    key: v,
    href: v === "etkinlik" ? routes.events.root() : routes.businesses.vertical(v),
    label: info.label,
    hint: info.subtitle,
    icon: info.icon,
    tone: info.tone,
    tile: true,
    keywords,
    ...extra,
  };
}

export const SEARCH_SHORTCUTS: readonly SearchShortcut[] = [
  vertical("yemek", ["yemek", "lokanta", "doner", "kebap", "durum", "pide", "lahmacun", "corba", "iskender", "ev yemekleri"], {
    image: "/images/home/yemek.webp",
    imageClassName: "bg-card",
  }),
  vertical("restoran", ["restoran", "balik", "ocakbasi", "aksam yemegi", "et lokantasi"]),
  vertical("kafe", ["kafe", "cafe", "kahve", "kahvalti", "pastane", "tatli", "cay bahcesi"]),
  vertical("otel", ["otel", "hotel", "pansiyon", "konaklama", "apart"]),
  vertical("hizmet", ["hizmet", "hizmetler", "firma", "kuafor", "berber", "oto yikama", "oto servis", "kombi servisi"], { label: "Hizmetler" }),
  vertical("saglik", ["saglik", "doktor", "klinik", "dis hekimi", "hastane", "poliklinik", "fizyoterapi", "veteriner"]),
  {
    key: "nobetci",
    href: routes.nearby.root("nobetci"),
    label: "Nöbetçi eczane",
    tileLabel: "Nöbetçi",
    hint: "Şu an açık eczaneler",
    icon: KIND_META.duty.icon,
    tone: KIND_META.duty.tone,
    image: "/images/home/eczane.webp",
    imageClassName: "bg-card",
    tile: true,
    keywords: ["nobetci eczane", "nobetci", "eczane"],
  },
  vertical("etkinlik", ["etkinlik", "etkinlikler", "konser", "tiyatro", "festival", "sergi", "atolye", "soylesi"]),
  {
    key: "ikinci-el",
    href: routes.listings.classifieds(),
    label: "İkinci El",
    hint: "Satılık eşya ilanları",
    icon: Tag,
    tone: SKY,
    tile: true,
    keywords: ["ikinci el", "ilan", "ilanlar", "satilik", "esya", "spot"],
  },
  {
    key: "is-ilani",
    href: routes.listings.jobs(),
    label: "İş İlanı",
    hint: "Gebze'deki iş fırsatları",
    icon: Briefcase,
    tone: EMERALD,
    tile: true,
    keywords: ["is ilani", "is ilanlari", "is", "eleman", "kariyer", "personel"],
  },
  {
    key: "gezilecek",
    href: routes.nearby.places(),
    label: "Gezilecek yerler",
    tileLabel: "Gezilecek",
    hint: "Tarihi yerler, parklar ve müzeler",
    icon: Landmark,
    tone: KIND_META.place.tone,
    tile: true,
    keywords: ["gezilecek yerler", "gezilecek", "gezi", "tarihi", "muze", "park", "doga", "piknik"],
  },
  {
    key: "taksi",
    href: routes.nearby.root("taksi"),
    label: "Taksi",
    hint: "Yakındaki taksi durakları",
    icon: KIND_META.taxi.icon,
    tone: KIND_META.taxi.tone,
    image: "/images/home/taksi.webp",
    imageClassName: "bg-card",
    tile: true,
    keywords: ["taksi", "taxi", "taksi duragi"],
  },
  // Only while typing:
  {
    key: "usta",
    href: routes.services.root(),
    label: "Usta bul",
    hint: "İşini anlat, ustalardan teklif al",
    icon: Wrench,
    tone: BRAND,
    tile: false,
    keywords: ["usta", "tesisat", "tesisatci", "elektrikci", "boyaci", "tadilat", "nakliyat", "temizlik", "kombi", "klima", "tamir", "cilingir"],
  },
  {
    key: "eczane",
    href: routes.nearby.root("eczane"),
    label: "Eczaneler",
    hint: "Yakındaki eczaneler",
    icon: KIND_META.pharmacy.icon,
    tone: KIND_META.pharmacy.tone,
    tile: false,
    keywords: ["eczane", "eczaneler"],
  },
  {
    key: "cami",
    href: routes.nearby.root("cami"),
    label: "Camiler",
    hint: "Yakındaki camiler",
    icon: KIND_META.mosque.icon,
    tone: KIND_META.mosque.tone,
    tile: false,
    keywords: ["cami", "camiler", "mescit", "namaz"],
  },
  {
    key: "durak",
    href: routes.nearby.root("durak"),
    label: "Otobüs durakları",
    hint: "Yakındaki duraklar",
    icon: KIND_META.bus_stop.icon,
    tone: KIND_META.bus_stop.tone,
    tile: false,
    keywords: ["durak", "duraklar", "otobus", "otobus duragi", "minibus"],
  },
  {
    key: "atm",
    href: routes.nearby.root("atm"),
    label: "ATM'ler",
    hint: "Yakındaki ATM'ler",
    icon: KIND_META.atm.icon,
    tone: KIND_META.atm.tone,
    tile: false,
    keywords: ["atm", "bankamatik", "banka"],
  },
  {
    key: "haberler",
    href: routes.content.news(),
    label: "Haberler",
    hint: "Gebze'den son haberler",
    icon: Newspaper,
    tone: BRAND,
    tile: false,
    keywords: ["haber", "haberler", "gundem", "son dakika"],
  },
  vertical("dugun", ["dugun", "dugun salonu", "nisan", "organizasyon", "gelinlik", "fotografci"], { tile: false }),
  vertical("egitim", ["egitim", "kurs", "etut", "dershane", "anaokulu", "ozel ders"], { tile: false }),
  vertical("magaza", ["magaza", "dukkan"], { tile: false }),
];

/** The "Kategoriler" grid (4 per row). */
export const SEARCH_TILES: readonly SearchShortcut[] = SEARCH_SHORTCUTS.filter((s) => s.tile);

const FOLDED = SEARCH_SHORTCUTS.map((s) => ({ s, keys: s.keywords.map((k) => trNormalize(k)) }));

/**
 * Shortcuts for a query, best first: an exact keyword, a keyword starting with the query ("nob" -> nobetci), a keyword
 * inside the query ("gebze nobetci eczane", "kuaforler"), then a keyword word starting with it.
 */
export function matchShortcuts(query: string, limit = 3): SearchShortcut[] {
  const q = trNormalize(query);
  if (q.length < SEARCH_MIN) return [];
  const padded = ` ${q} `;
  const words = q.split(" ");
  const hits: Array<{ s: SearchShortcut; score: number; i: number }> = [];
  FOLDED.forEach(({ s, keys }, i) => {
    let score = 0;
    for (const k of keys) {
      if (k === q) score = Math.max(score, 4);
      else if (k.startsWith(q)) score = Math.max(score, 3);
      else if (k.length >= 3 && (padded.includes(` ${k} `) || (k.length >= 4 && !k.includes(" ") && words.some((w) => w.startsWith(k)))))
        score = Math.max(score, 2);
      else if (q.length >= 3 && k.split(" ").some((w) => w.startsWith(q))) score = Math.max(score, 1);
    }
    if (score) hits.push({ s, score, i });
  });
  return hits
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((h) => h.s);
}
