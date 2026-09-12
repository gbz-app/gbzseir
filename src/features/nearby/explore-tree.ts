/**
 * Chip tree of the one explore screen (Keşfet /yakinimda and the Şehir Rehberi lists /rehber/[kategori], owner 12.09:
 * "ikisi de aynı harita olacak"): which chips the sheet shows, what each chip loads, how a selection maps to and from
 * the URL. Pure TS, safe on the server and in client components.
 *
 * Nodes come in two sources:
 * - nearby: the nearest rows of a kind around the reference point (useNearbyData, rpc nearby_pois); id = the ?tur=
 *   value ("hepsi", "eczane", "cami", "durak", "taksi", "gezilecek"),
 * - guide: every row of a /rehber/<slug> list (loadGuideList, /rehber/dizin/<slug>); id = "rehber:<slug>".
 * Roots follow the old Keşfet chip row after its "Tümü" link chip (which keeps opening /rehber and is not a node).
 * "Kurum" and "Gezilecek" offer child lists (OFFERED_CHILDREN); every other guide list is a hidden node under the root
 * of its kind, reachable by URL only (/rehber/okullar, /rehber/muze...). Inside a guide list the leaf chips are the
 * list's own chip dimension (institution categories, place subkinds, banks, fuel brands, EV operators), except that
 * the "kurumlar" list's group chips are replaced by its child nodes.
 */
import type { LucideIcon } from "lucide-react";
import { isDistrictSlug, type DistrictSlug } from "@/config/districts";
import { withQuery } from "@/core/routes";
import { CATEGORY_KEY_RE } from "@/features/business/lib/category-visuals";
import { GUIDE_SECTIONS, parseOwnership } from "@/features/guide/lib/constants";
import type { GuideListKind, InstitutionCategoryDef, Ownership } from "@/features/guide/lib/types";
import {
  GUIDE_EXTRA_LIST_SLUGS,
  guideListHref,
  resolveGuideList,
  type GuideChipDef,
  type GuideListConfig,
} from "@/features/guide/components/list-config";
import { NEARBY_FILTERS, parseFilter } from "./config";
import type { MarkerKind, NearbyFilter } from "./types";

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

/** Where a node's rows come from. */
export type ExploreSource = { type: "nearby"; filter: NearbyFilter } | { type: "guide"; slug: string };

export type ExploreNode = {
  /** Nearby kinds: their filter value; guide lists: "rehber:<slug>". */
  id: string;
  /** Chip label ("Eczane", "Belediye ve kamu", "Tarihi yerler"). */
  label: string;
  /** Sheet title before the list has loaded (nearby: filterMeta().title, guide: the list's title). */
  title: string;
  icon: LucideIcon;
  /** Pin / icon kind of the node's rows. */
  marker: MarkerKind;
  /** Parent node id, null for a root. */
  parent: string | null;
  /** Shown as a chip (roots and offered children); false: reachable by URL only. */
  offered: boolean;
  /** Roots only: the /yakinimda ?tur= value. */
  tur?: NearbyFilter;
  source: ExploreSource;
};

const GUIDE_PREFIX = "rehber:";

/** Node id of a guide list slug ("kamu" -> "rehber:kamu"). */
export const guideNodeId = (slug: string) => `${GUIDE_PREFIX}${slug}`;

/** List slug of a guide node id ("rehber:kamu" -> "kamu"), null for a nearby node. */
export function guideSlugOf(id: string): string | null {
  return id.startsWith(GUIDE_PREFIX) ? id.slice(GUIDE_PREFIX.length) || null : null;
}

/** Keşfet kinds whose chip now opens a full guide list instead of the nearest 60 rows. */
const GUIDE_ROOT_SLUG: Partial<Record<NearbyFilter, string>> = { atm: "atm", banka: "banka", akaryakit: "akaryakit", sarj: "sarj", kurum: "kurumlar" };

const KIND_MARKER: Record<GuideListKind, MarkerKind> = {
  institution: "institution",
  atm: "atm",
  bank: "bank",
  fuel: "fuel",
  ev_charge: "ev_charge",
  place: "place",
};

/** Root a guide list hangs under when nothing else places it. */
const KIND_ROOT: Record<GuideListKind, string> = {
  institution: guideNodeId("kurumlar"),
  atm: guideNodeId("atm"),
  bank: guideNodeId("banka"),
  fuel: guideNodeId("akaryakit"),
  ev_charge: guideNodeId("sarj"),
  place: "gezilecek",
};

/** Child lists offered as chips, in chip order (slugs of GUIDE_SECTIONS and the combined lists of list-config). */
export const OFFERED_CHILDREN: Readonly<Record<string, readonly string[]>> = {
  [guideNodeId("kurumlar")]: ["kamu", "guvenlik", "adalet", "saglik", "egitim", "ptt"],
  gezilecek: ["tarihi", "muzeler-ve-kultur", "parklar-ve-doga", "spor", "pazar", "mezarlik", "ulasim"],
};

/** The default node when the URL names none (the screen may pick Nöbetçi at night, like the old Keşfet). */
export const DEFAULT_NODE = "eczane";
/** Where clearing a root leads: "Yakınımdakiler". */
export const HEPSI_NODE = "hepsi";
/** The ATM / Şube switch's two lists. */
export const BANK_NODES = { atm: guideNodeId("atm"), bank: guideNodeId("banka") } as const;

function guideNode(cfg: GuideListConfig, parent: string, offered: boolean): ExploreNode {
  const section = GUIDE_SECTIONS.find((s) => s.slug === cfg.slug);
  return {
    id: guideNodeId(cfg.slug),
    label: section?.label ?? cfg.title,
    title: cfg.title,
    icon: cfg.icon,
    marker: KIND_MARKER[cfg.kind],
    parent,
    offered,
    source: { type: "guide", slug: cfg.slug },
  };
}

/** Root chips after the "Tümü" link chip, in the old Keşfet order (no Nöbetçi: it is the Eczane tab's switch). */
export const EXPLORE_ROOTS: readonly ExploreNode[] = NEARBY_FILTERS.filter((f) => f.value !== "nobetci" && f.value !== "isletme").map((f) => {
  const slug = GUIDE_ROOT_SLUG[f.value];
  const cfg = slug ? resolveGuideList(slug) : null;
  return {
    id: cfg ? guideNodeId(cfg.slug) : f.value,
    label: f.label,
    title: cfg ? cfg.title : f.title,
    icon: f.icon,
    marker: cfg ? KIND_MARKER[cfg.kind] : f.marker,
    parent: null,
    offered: true,
    tur: f.value,
    source: cfg ? { type: "guide", slug: cfg.slug } : { type: "nearby", filter: f.value },
  };
});

const NODES: ReadonlyMap<string, ExploreNode> = (() => {
  const map = new Map<string, ExploreNode>(EXPLORE_ROOTS.map((n) => [n.id, n]));
  const offeredParent = new Map<string, string>();
  for (const [parent, slugs] of Object.entries(OFFERED_CHILDREN)) for (const slug of slugs) offeredParent.set(slug, parent);
  for (const slug of [...GUIDE_EXTRA_LIST_SLUGS, ...GUIDE_SECTIONS.map((s) => s.slug)]) {
    const id = guideNodeId(slug);
    if (map.has(id)) continue;
    const cfg = resolveGuideList(slug);
    if (!cfg || cfg.slug !== slug) continue;
    const parent = offeredParent.get(slug);
    map.set(id, guideNode(cfg, parent ?? KIND_ROOT[cfg.kind], !!parent));
  }
  return map;
})();

/**
 * Node of an id; a "rehber:<slug>" id of a list the static tree does not know (a section added later) becomes a hidden
 * node under the root of its kind. Null for anything else.
 */
export function nodeById(id: string | null | undefined): ExploreNode | null {
  if (!id) return null;
  const known = NODES.get(id);
  if (known) return known;
  const slug = guideSlugOf(id);
  if (!slug || slug.length > 60) return null;
  const cfg = resolveGuideList(slug);
  return cfg && cfg.slug === slug ? guideNode(cfg, KIND_ROOT[cfg.kind], false) : null;
}

/** Offered children of a node in chip order; with `includeHidden` the URL-only ones follow. */
export function childrenOf(id: string, includeHidden = false): ExploreNode[] {
  const offered = (OFFERED_CHILDREN[id] ?? []).map((slug) => NODES.get(guideNodeId(slug))).filter((n): n is ExploreNode => !!n);
  if (!includeHidden) return offered;
  return [...offered, ...[...NODES.values()].filter((n) => n.parent === id && !n.offered)];
}

/** Root .. node (empty for an unknown id). */
export function pathTo(id: string): ExploreNode[] {
  const out: ExploreNode[] = [];
  let node = nodeById(id);
  // The tree is two levels deep; the bound only guards against a bad parent chain.
  for (let i = 0; node && i < 8; i++) {
    out.unshift(node);
    node = node.parent ? nodeById(node.parent) : null;
  }
  return out;
}

/** Other chips at the node's level: offered siblings, or the other roots. */
function siblingsOf(node: ExploreNode): ExploreNode[] {
  const level = node.parent ? childrenOf(node.parent) : [...EXPLORE_ROOTS];
  return level.filter((n) => n.id !== node.id);
}

/** List configuration of a guide node (null for a nearby node). */
export function guideConfigOf(node: ExploreNode | string | null | undefined): GuideListConfig | null {
  const n = typeof node === "string" ? nodeById(node) : node;
  return n?.source.type === "guide" ? resolveGuideList(n.source.slug) : null;
}

/** Node of an old Keşfet tab (?tur=): ATM, Banka, Akaryakıt, Şarj and Kurum open their guide lists; Nöbetçi is Eczane + duty. */
export function nodeForNearbyFilter(filter: NearbyFilter): { nodeId: string; duty: boolean } | null {
  if (filter === "nobetci") return { nodeId: "eczane", duty: true };
  if (filter === "isletme") return null;
  const slug = GUIDE_ROOT_SLUG[filter];
  return { nodeId: slug ? guideNodeId(slug) : filter, duty: false };
}

/**
 * Node of a /rehber/<slug> path: a list slug is its own node; an institution category slug (nufus, noter) opens its
 * section's node with that category as the preset chip. Null for an unknown slug.
 *
 * `defs` is required on purpose: the server's getInstitutionCategories() (admin-added category slugs resolve only with
 * it). /rehber/[kategori] resolves the path with that list, so a client screen must get the same list from the page and
 * pass it to every nodeForGuideSlug / parseExploreUrl / exploreHref("query") call, or the two sides can disagree about
 * which node /rehber/<admin-added slug> shows. INSTITUTION_CATEGORY_DEFS only where no server list exists.
 */
export function nodeForGuideSlug(
  slug: string,
  defs: readonly InstitutionCategoryDef[],
): { nodeId: string; presetChip: string | null; config: GuideListConfig } | null {
  const s = slug.trim().toLowerCase();
  if (!s || s.length > 60) return null;
  const cfg = resolveGuideList(s, defs);
  return cfg ? { nodeId: guideNodeId(cfg.slug), presetChip: cfg.preset, config: cfg } : null;
}

// ---------------------------------------------------------------------------
// Selection and the chip row
// ---------------------------------------------------------------------------

/** What the screen shows: a node, its leaf chip, the pharmacy duty switch, Devlet / Özel, the search, an old ?ilce=. */
export type ExploreSel = {
  node: string;
  /** Value of the guide list's chip dimension (institution category, subkind, bank, brand, operator key). */
  chip: string | null;
  /** Eczane node: the Nöbetçi side of the switch. */
  duty: boolean;
  own: Ownership | null;
  q: string;
  /** Only from an old link (?ilce=): there is no district picking any more (owner 12.09). */
  ilce: DistrictSlug | null;
};

export const EMPTY_SEL: ExploreSel = { node: DEFAULT_NODE, chip: null, duty: false, own: null, q: "", ilce: null };

/** Chips and counts of the loaded guide list (null while it loads, and for nearby nodes). */
export type DrillDataset = { chips: readonly GuideChipDef[]; counts?: Readonly<Record<string, number>> };

export type DrillNodeOption = { type: "node"; id: string; label: string; icon: LucideIcon; active: boolean };
export type DrillChipOption = { type: "chip"; value: string; label: string; count?: number; active: boolean };
export type DrillOption = DrillNodeOption | DrillChipOption;

export type DrillRow = {
  /** Root .. current node, each drawn black with an X (empty on a root without children or chips). */
  trail: ExploreNode[];
  /** The chips after the trail. */
  options: DrillOption[];
  optionType: "node" | "chip";
  /** Active option: the node id (root row) or the chip value; null when none is active. */
  selected: string | null;
};

const nodeOption = (n: ExploreNode, active: boolean): DrillNodeOption => ({ type: "node", id: n.id, label: n.label, icon: n.icon, active });

/** The roots with `activeId` black (no trail). */
const rootRow = (activeId: string): DrillRow => ({
  trail: [],
  options: EXPLORE_ROOTS.map((r) => nodeOption(r, r.id === activeId)),
  optionType: "node",
  selected: activeId,
});

/**
 * The sheet's chip row for a selection. A root without children or chips (Eczane, Cami, Durak, Taksi, Yakınımdakiler)
 * shows the roots with the active one black; so does a root whose loaded list has fewer than two chip values and none
 * chosen (Şarj with one operator, Akaryakıt in thin data). Any other node shows its path as the trail, then its offered
 * children, else the loaded list's chips (none while it loads), else its offered siblings (lists without a chip
 * dimension, like PTT or Müzeler, and lists whose data has no chip values).
 */
export function drillRow(sel: ExploreSel, dataset: DrillDataset | null): DrillRow {
  const node = nodeById(sel.node) ?? nodeById(HEPSI_NODE)!;
  const children = childrenOf(node.id);
  const dim = guideConfigOf(node)?.chip ?? null;

  if (!node.parent && !children.length && !dim) return rootRow(node.id);
  const trail = pathTo(node.id);
  if (children.length) return { trail, options: children.map((n) => nodeOption(n, false)), optionType: "node", selected: null };

  if (dim) {
    if (!dataset) return { trail, options: [], optionType: "chip", selected: null };
    const chips = dataset.chips;
    const selected = sel.chip && chips.some((c) => c.value === sel.chip) ? sel.chip : null;
    // A single chip filters nothing: skip it, unless the URL chose it (it must stay clearable).
    if (chips.length >= 2 || selected) {
      return {
        trail,
        options: chips.map((c) => ({ type: "chip", value: c.value, label: c.label, count: dataset.counts?.[c.value], active: c.value === selected })),
        optionType: "chip",
        selected,
      };
    }
    // Nothing to filter by on a root: the root row (the trail plus every other root would show the roots twice).
    if (!node.parent) return rootRow(node.id);
  }
  return { trail, options: siblingsOf(node).map((n) => nodeOption(n, false)), optionType: "node", selected: null };
}

/**
 * The selection once its guide list has loaded: a chip the list does not have (/rehber/nufus?alt=foo, a stale link)
 * falls back to `presetChip` (parseExploreUrl's, for the node it parsed) when the list has it, else to none, like the
 * old list browser. Returns `sel` itself when nothing changes.
 */
export function settleChip(sel: ExploreSel, presetChip: string | null, dataset: DrillDataset | null): ExploreSel {
  if (!dataset || !sel.chip || dataset.chips.some((c) => c.value === sel.chip)) return sel;
  const chip = presetChip && dataset.chips.some((c) => c.value === presetChip) ? presetChip : null;
  return { ...sel, chip };
}

/** Open a node (a root, a child or a sibling chip): its chip, search and Devlet / Özel start empty. */
export function drillInto(sel: ExploreSel, nodeId: string): ExploreSel {
  if (!nodeById(nodeId)) return sel;
  return { ...sel, node: nodeId, chip: null, duty: nodeId === sel.node ? sel.duty : false, own: null, q: "", ilce: null };
}

/** A trail chip's X: that level and everything below it go; a root's X leads to "Yakınımdakiler". */
export function clearLevel(sel: ExploreSel, nodeId: string): ExploreSel {
  const node = nodeById(nodeId);
  if (!node) return sel;
  return { ...sel, node: node.parent ?? HEPSI_NODE, chip: null, duty: false, own: null, q: "", ilce: null };
}

/** A leaf chip on (or off when it is the active one). */
export function toggleChip(sel: ExploreSel, value: string): ExploreSel {
  return { ...sel, chip: sel.chip === value ? null : value };
}

/** ATM / Şube: switches the list in place, keeping the bank chip and the search. */
export function swapBankNode(sel: ExploreSel, kind: keyof typeof BANK_NODES): ExploreSel {
  return { ...sel, node: BANK_NODES[kind], duty: false };
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

/** Query keys of the explore screen (the chip value uses the list's own key: alt, banka, marka, operator). */
export const EXPLORE_PARAMS = {
  /** Root of the old Keşfet row (old links: ?tur=atm, ?tur=nobetci). */
  tur: "tur",
  /** A guide list below a root (?kategori=kamu, ?kategori=tarihi). */
  list: "kategori",
  ownership: "sahiplik",
  q: "q",
  district: "ilce",
} as const;

/** Chip value meaning "no chip" where the path would preset one (/rehber/nufus?alt=tumu). */
export const CHIP_NONE = "tumu";

type ParamReader = { get(name: string): string | null } | null | undefined;

/** Slug of a /rehber/<slug> path (decoded, lowercase), else null. */
export function guidePathSlug(pathname: string): string | null {
  const m = /^\/rehber\/([^/?#]+)\/?$/.exec(pathname);
  if (!m) return null;
  let s = m[1];
  try {
    s = decodeURIComponent(s);
  } catch {
    // Keep the raw segment.
  }
  s = s.trim().toLowerCase();
  return s && s.length <= 60 ? s : null;
}

/** URL value ("is-bankasi") -> chip key ("is_bankasi"); null when malformed. */
function chipKey(v: string | null | undefined): string | null {
  const k = v?.trim().toLowerCase().replace(/-/g, "_");
  return k && CATEGORY_KEY_RE.test(k) ? k : null;
}

const chipSlug = (key: string) => key.replace(/_/g, "-");

/** The chip param value to write: none when it only restates the default, CHIP_NONE when it clears a preset. */
function chipParamValue(chip: string | null, preset: string | null): string | undefined {
  if (chip === preset) return undefined;
  return chip ? chipSlug(chip) : CHIP_NONE;
}

/**
 * Selection of a URL. Precedence: ?kategori=<list slug> (the query form), then ?tur= (old Keşfet links and the query
 * form), then the /rehber/<slug> path (an institution category slug presets its chip). The list's chip key (?alt=,
 * ?banka=, ?marka=, ?operator=) picks the chip; "tumu" clears a preset. Old /rehber/kurumlar?alt=<group> links open
 * that group's list. `explicit` is false when nothing chose a node (plain /yakinimda): the screen picks the default.
 * `presetChip`: the chip the path / ?kategori= slug presets for sel.node (hand it to settleChip once the list loads,
 * since the chip here is only checked for form, not against the list's chips). `defs`: see nodeForGuideSlug.
 */
export function parseExploreUrl(
  pathname: string,
  params: ParamReader,
  defs: readonly InstitutionCategoryDef[],
): { sel: ExploreSel; explicit: boolean; presetChip: string | null } {
  const get = (k: string) => params?.get(k)?.trim() || null;

  let nodeId: string | null = null;
  let duty = false;
  let preset: string | null = null;

  const list = get(EXPLORE_PARAMS.list);
  const fromList = list ? nodeForGuideSlug(list, defs) : null;
  if (fromList) {
    nodeId = fromList.nodeId;
    preset = fromList.presetChip;
  } else {
    const tur = parseFilter(get(EXPLORE_PARAMS.tur));
    const fromTur = tur ? nodeForNearbyFilter(tur) : null;
    if (fromTur) {
      nodeId = fromTur.nodeId;
      duty = fromTur.duty;
    } else {
      const slug = guidePathSlug(pathname);
      const fromPath = slug ? nodeForGuideSlug(slug, defs) : null;
      if (fromPath) {
        nodeId = fromPath.nodeId;
        preset = fromPath.presetChip;
      }
    }
  }

  const explicit = nodeId !== null && !!nodeById(nodeId);
  if (!explicit) nodeId = DEFAULT_NODE;
  let cfg = guideConfigOf(nodeId);

  let chip: string | null = null;
  if (cfg?.chip) {
    const raw = get(cfg.chipParam)?.toLowerCase();
    chip = raw === CHIP_NONE ? null : (chipKey(raw) ?? preset);
    // The kurumlar list's groups are child nodes now.
    if (cfg.chip === "group" && chip) {
      const section = GUIDE_SECTIONS.find((s) => s.kind === "institution" && s.group === chip);
      if (section && nodeById(guideNodeId(section.slug))) {
        nodeId = guideNodeId(section.slug);
        cfg = guideConfigOf(nodeId);
      }
      chip = null;
    }
  }

  const ilce = get(EXPLORE_PARAMS.district);
  return {
    sel: {
      node: nodeId!,
      chip,
      duty,
      own: cfg?.ownership ? parseOwnership(get(EXPLORE_PARAMS.ownership)) : null,
      q: get(EXPLORE_PARAMS.q)?.slice(0, 80) ?? "",
      ilce: isDistrictSlug(ilce) ? ilce : null,
    },
    explicit,
    presetChip: explicit ? preset : null,
  };
}

/**
 * URL of a selection (parseExploreUrl reads it back). `dataset`, when loaded, drops a chip the list does not have.
 * - "query": the current path (`pathname`, default /yakinimda) with the selection in the query; nothing is added for
 *   what the path already says (/rehber/kamu stays /rehber/kamu), ?tur= for roots, ?kategori= for lists below a root.
 * - "canonical": /yakinimda?tur=... for nearby nodes, /rehber/<slug>?... for guide lists (guideListHref).
 * The query form needs `defs` (see nodeForGuideSlug) to read the path the way the server did.
 */
export function exploreHref(sel: ExploreSel, dataset: DrillDataset | null, mode: "canonical"): string;
export function exploreHref(
  sel: ExploreSel,
  dataset: DrillDataset | null,
  mode: "query",
  opts: { pathname?: string; defs: readonly InstitutionCategoryDef[] },
): string;
export function exploreHref(
  sel: ExploreSel,
  dataset: DrillDataset | null,
  mode: "query" | "canonical",
  opts?: { pathname?: string; defs: readonly InstitutionCategoryDef[] },
): string {
  const node = nodeById(sel.node) ?? nodeById(DEFAULT_NODE)!;
  const cfg = guideConfigOf(node);
  const chip = cfg?.chip && sel.chip && (!dataset || dataset.chips.some((c) => c.value === sel.chip)) ? sel.chip : null;
  const own = cfg?.ownership ? sel.own : null;
  const q = sel.q.trim() || undefined;
  const tur = node.parent ? undefined : sel.duty && node.id === "eczane" ? "nobetci" : node.tur;

  if (mode === "canonical") {
    if (cfg) return guideListHref(cfg, { chip, own, q, ilce: sel.ilce });
    return withQuery("/yakinimda", { [EXPLORE_PARAMS.tur]: tur, [EXPLORE_PARAMS.q]: q });
  }

  const pathname = opts?.pathname || "/yakinimda";
  const slug = guidePathSlug(pathname);
  const fromPath = slug && opts ? nodeForGuideSlug(slug, opts.defs) : null;
  const samePath = !!fromPath && fromPath.nodeId === node.id;
  const query: Record<string, string | undefined> = {};
  if (!samePath) {
    if (tur) query[EXPLORE_PARAMS.tur] = tur;
    else if (cfg) query[EXPLORE_PARAMS.list] = cfg.slug;
  }
  if (cfg?.chip) query[cfg.chipParam] = chipParamValue(chip, samePath && fromPath ? fromPath.presetChip : null);
  if (own) query[EXPLORE_PARAMS.ownership] = own;
  query[EXPLORE_PARAMS.q] = q;
  if (sel.ilce) query[EXPLORE_PARAMS.district] = sel.ilce;
  return withQuery(pathname, query);
}
