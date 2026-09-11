/**
 * RSS 2.0 / RDF / Atom feed parsing and normalisation for "Gebze Gündemi" (pure TS, no Next/React).
 * Only headline data is produced: title, a <=280 char plain-text summary, the source link and the date.
 * Full article text and images are never kept.
 */
import { XMLParser } from "fast-xml-parser";
import { trNormalize } from "@/core/tr";

export const NEWS_SUMMARY_MAX = 280;

export type NewsCategory = "gundem" | "siyaset" | "belediye" | "spor" | "etkinlik" | "duyuru";

export const NEWS_CATEGORY_LABELS: Record<NewsCategory, string> = {
  gundem: "Gündem",
  siyaset: "Siyaset",
  belediye: "Belediye",
  spor: "Spor",
  etkinlik: "Etkinlik",
  duyuru: "Duyurular",
};

/** Display order of the category chips. */
export const NEWS_CATEGORY_ORDER: NewsCategory[] = ["gundem", "siyaset", "belediye", "spor", "etkinlik", "duyuru"];

export type NewsSourceRef = {
  id: string;
  name: string;
  siteUrl: string;
};

export type NewsItem = {
  /** Stable key (source + guid hash). */
  id: string;
  guid: string;
  title: string;
  summary: string | null;
  /** Absolute http(s) URL of the article on the source site. */
  url: string;
  /** ISO timestamp or null when the feed has no usable date. */
  publishedAt: string | null;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  category: NewsCategory;
  /** Mentions Gebze or the Gebze region (Darıca, Çayırova, Dilovası). */
  local: boolean;
};

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  shy: "",
  zwnj: "",
  zwj: "",
  lrm: "",
  rlm: "",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  sbquo: "‚",
  bdquo: "„",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  bull: "•",
  middot: "·",
  prime: "′",
  Prime: "″",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  euro: "€",
  times: "×",
  divide: "÷",
  frac12: "½",
  ccedil: "ç",
  Ccedil: "Ç",
  ouml: "ö",
  Ouml: "Ö",
  uuml: "ü",
  Uuml: "Ü",
  gbreve: "ğ",
  Gbreve: "Ğ",
  scedil: "ş",
  Scedil: "Ş",
  imath: "ı",
  inodot: "ı",
  Idot: "İ",
  acirc: "â",
  Acirc: "Â",
  icirc: "î",
  Icirc: "Î",
  ucirc: "û",
  Ucirc: "Û",
  eacute: "é",
  Eacute: "É",
  egrave: "è",
  agrave: "à",
  aacute: "á",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  auml: "ä",
  Auml: "Ä",
};

/** Windows-1252 code points that feeds sometimes emit as numeric references (&#146; etc.). */
const CP1252: Record<number, string> = {
  128: "€",
  130: "‚",
  132: "„",
  133: "…",
  145: "‘",
  146: "’",
  147: "“",
  148: "”",
  149: "•",
  150: "–",
  151: "—",
  153: "™",
};

function fromCodePoint(cp: number): string {
  if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return "";
  if (CP1252[cp]) return CP1252[cp];
  if (cp < 32 && cp !== 9 && cp !== 10 && cp !== 13) return "";
  return String.fromCodePoint(cp);
}

/** Decode HTML/XML character references (named, decimal and hex). Unknown names are left untouched. */
export function decodeEntities(input: string): string {
  if (!input || !input.includes("&")) return input;
  return input.replace(/&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,31});/g, (match, body: string) => {
    if (body[0] === "#") {
      const cp = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return fromCodePoint(cp);
    }
    return NAMED_ENTITIES[body] ?? NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

function removeTags(s: string): string {
  return s
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|iframe|figure|figcaption|table)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<\/?(br|p|div|li|ul|ol|h[1-6]|blockquote|section|article|tr|td)\b[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "");
}

/** Plain text from an HTML fragment: tags removed, entities decoded (twice for double-encoded feeds), spaces collapsed. */
export function htmlToText(input: string | null | undefined): string {
  if (!input) return "";
  let s = removeTags(String(input));
  s = decodeEntities(s);
  // Double-encoded feeds (&amp;#039; or &lt;p&gt;) need a second pass.
  if (/&(#\d+|#x[0-9a-f]+|[a-z]+);/i.test(s)) s = decodeEntities(s);
  if (/<[a-z/!][^>]*>/i.test(s)) s = removeTags(s);
  return s
    .replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cut to `max` characters at a word boundary, adding an ellipsis. The result is always <= max. */
export function clampText(text: string, max = NEWS_SUMMARY_MAX): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?\-–—(“"'‘]+$/u, "");
  return `${base}…`;
}

/** Key used to detect the same story published by several sources. */
export function titleKey(title: string): string {
  return trNormalize(title)
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Small non-cryptographic string hash (base36), used for stable ids. */
export function hashString(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Absolute http(s) URL or null (rejects javascript:, data:, mailto: ...). */
export function safeHttpUrl(raw: string | null | undefined, base?: string): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  try {
    const u = base ? new URL(v, base) : new URL(v);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.href;
  } catch {
    return null;
  }
}

function parseDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const t = Date.parse(v);
  if (Number.isFinite(t)) return new Date(t).toISOString();
  // "2026-09-10 14:30:00" (space instead of T, no zone): treat as Istanbul time.
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)$/);
  if (m) {
    const t2 = Date.parse(`${m[1]}T${m[2].length === 5 ? `${m[2]}:00` : m[2]}+03:00`);
    if (Number.isFinite(t2)) return new Date(t2).toISOString();
  }
  return null;
}

// ---------------------------------------------------------------------------
// Categories (light keyword inference; honest and simple)
// ---------------------------------------------------------------------------

const DUYURU_PHRASES = ["kesinti", "duyuru", "nobetci eczane", "trafige kapat", "yol calismasi", "su verilemeyecek", "uyarisi", "ihale ilani"];
const SPOR_STEMS = ["spor", "futbol", "basketbol", "voleybol", "hentbol", "sampiyon", "turnuva", "antrenman", "olimpiyat", "madalya", "atlet", "gures", "tekvando", "karate", "kickboks", "yuzucu"];
const SPOR_WORDS = new Set(["mac", "maci", "macta", "macinda", "maca", "lig", "ligi", "ligde", "gol", "golle", "golu", "derbi", "derbide"]);
const ETKINLIK_STEMS = ["konser", "festival", "etkinlik", "tiyatro", "sergi", "soylesi", "fuar", "sahne", "gosteri", "senlik", "panel", "atolye", "sinema", "kermes", "yarisma", "dinleti", "imza gunu"];
const BELEDIYE_STEMS = ["belediye", "buyuksehir", "baskan", "meclis", "zabita", "muhtar", "kaymakam", "valilik"];
const SIYASET_STEMS = ["milletvekil", "secim", "parti", "chp", "mhp", "akp", "tbmm", "cumhurbaskan", "bakan", "muhalefet", "iktidar", "siyaset", "siyasi"];
const LOCAL_WORDS = ["gebze", "darica", "cayirova", "dilovasi"];

function hasStem(words: string[], stems: string[]): boolean {
  return words.some((w) => stems.some((s) => w.startsWith(s)));
}

/** Infer a light category from the title and the feed's own category label. */
export function inferCategory(title: string, feedCategory: string, sourceName: string): NewsCategory {
  const norm = titleKey(`${title} ${feedCategory}`);
  const words = norm.split(" ");
  const cat = titleKey(feedCategory);
  if (DUYURU_PHRASES.some((p) => norm.includes(p))) return "duyuru";
  if (cat.includes("spor") || hasStem(words, SPOR_STEMS) || words.some((w) => SPOR_WORDS.has(w))) return "spor";
  if (cat.includes("kultur") || cat.includes("sanat") || cat.includes("etkinlik") || ETKINLIK_STEMS.some((s) => (s.includes(" ") ? norm.includes(s) : hasStem(words, [s]))))
    return "etkinlik";
  if (cat.includes("siyaset") || cat.includes("politika") || hasStem(words, SIYASET_STEMS)) return "siyaset";
  if (cat.includes("belediye") || hasStem(words, BELEDIYE_STEMS) || titleKey(sourceName).includes("belediye")) return "belediye";
  return "gundem";
}

export function isLocalText(...texts: Array<string | null | undefined>): boolean {
  const norm = trNormalize(texts.filter(Boolean).join(" "));
  return LOCAL_WORDS.some((w) => norm.includes(w));
}

// ---------------------------------------------------------------------------
// XML -> items
// ---------------------------------------------------------------------------

type XmlNode = string | number | boolean | null | undefined | XmlObject | XmlNode[];
type XmlObject = { [key: string]: XmlNode };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  // Entities are decoded by htmlToText (handles double encoding and HTML names); avoids expansion limits.
  processEntities: false,
  htmlEntities: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  cdataPropName: false,
  // HTML bodies are returned as raw strings, even when a feed forgets CDATA.
  stopNodes: ["*.description", "*.content:encoded", "*.summary", "*.content"],
  isArray: (name) => name === "item" || name === "entry" || name === "link" || name === "category",
});

function text(node: XmlNode): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (Array.isArray(node)) {
    for (const n of node) {
      const t = text(n);
      if (t) return t;
    }
    return "";
  }
  if ("#text" in node) return text(node["#text"]);
  if ("@_term" in node) return text(node["@_term"]);
  return "";
}

function asArray(node: XmlNode): XmlNode[] {
  if (node === null || node === undefined) return [];
  return Array.isArray(node) ? node : [node];
}

function atomLink(links: XmlNode): string {
  const list = asArray(links);
  let fallback = "";
  for (const l of list) {
    if (l && typeof l === "object" && !Array.isArray(l)) {
      const href = text(l["@_href"]);
      const rel = text(l["@_rel"]);
      if (href && (!rel || rel === "alternate")) return href;
      if (href && !fallback) fallback = href;
    } else if (typeof l === "string" && l.trim()) {
      return l;
    }
  }
  return fallback;
}

function buildSummary(title: string, candidates: string[]): string | null {
  const tKey = titleKey(title);
  for (const raw of candidates) {
    let s = htmlToText(raw);
    if (!s) continue;
    // Drop a leading copy of the title ("Başlık Başlık metni...").
    if (titleKey(s.slice(0, title.length + 2)).startsWith(tKey) && tKey) s = s.slice(title.length).replace(/^[\s:–—-]+/, "");
    s = s
      .replace(/\s*(devamı için tıklayın|devamını oku(yun)?|haberin devamı|\[(…|\.\.\.)\]|\(devamı\)).*$/i, "")
      .replace(/\s*The post .* appeared first on .*$/i, "")
      .trim();
    if (s.length < 25 || titleKey(s) === tKey) continue;
    return clampText(s, NEWS_SUMMARY_MAX);
  }
  return null;
}

/** Parse one feed document into normalised items (no date filtering or dedupe here). */
export function parseFeed(xml: string, source: NewsSourceRef): NewsItem[] {
  let doc: XmlObject;
  try {
    doc = parser.parse(xml) as XmlObject;
  } catch {
    throw new Error("Akış okunamadı (geçersiz XML)");
  }
  const rss = doc.rss as XmlObject | undefined;
  const channel = rss && typeof rss === "object" ? (rss.channel as XmlObject | undefined) : undefined;
  const rdf = doc["rdf:RDF"] as XmlObject | undefined;
  const feed = doc.feed as XmlObject | undefined;

  const isAtom = !channel && !rdf && !!feed;
  const rawItems = channel ? asArray(channel.item) : rdf ? asArray(rdf.item) : feed ? asArray(feed.entry) : null;
  if (!rawItems) throw new Error("RSS/Atom biçimi tanınmadı");

  const out: NewsItem[] = [];
  for (const node of rawItems) {
    if (!node || typeof node !== "object" || Array.isArray(node)) continue;
    const it = node as XmlObject;
    const title = clampText(htmlToText(text(it.title)), 200);
    if (!title) continue;

    const linkRaw = isAtom ? atomLink(it.link) : text(it.link) || atomLink(it.link);
    const guidNode = it.guid;
    const guidText = text(guidNode) || text(it.id);
    const permalink =
      guidNode && typeof guidNode === "object" && !Array.isArray(guidNode) && text(guidNode["@_isPermaLink"]) === "true" ? guidText : "";
    const url = safeHttpUrl(linkRaw, source.siteUrl) ?? safeHttpUrl(permalink, source.siteUrl);
    if (!url) continue;

    const dateRaw = text(it.pubDate) || text(it["dc:date"]) || text(it.published) || text(it.updated) || text(it.date);
    const feedCategory = htmlToText(text(it.category));
    const summary = buildSummary(title, [text(it.description), text(it.summary), text(it["content:encoded"]), text(it.content)]);
    const guid = (guidText || url).trim().slice(0, 500);

    out.push({
      id: `${source.id.slice(0, 8)}-${hashString(guid)}`,
      guid,
      title,
      summary,
      url,
      publishedAt: parseDate(dateRaw),
      sourceId: source.id,
      sourceName: source.name,
      sourceUrl: source.siteUrl,
      category: inferCategory(title, feedCategory, source.name),
      local: isLocalText(title, summary),
    });
  }
  return out;
}

export type SelectOptions = {
  now?: number;
  /** Keep items from the last N days (default 7). */
  windowDays?: number;
  /** When the window has fewer than `minInWindow` items, fall back to the newest `fallbackCount` items. */
  minInWindow?: number;
  fallbackCount?: number;
  /** Hard cap on the returned list (default 100). */
  max?: number;
};

/**
 * Clamp future dates, sort newest first, dedupe by normalised title (the newest copy wins),
 * keep the last 7 days (fallback: newest 40) and cap the list.
 */
export function selectNews(all: NewsItem[], opts: SelectOptions = {}): NewsItem[] {
  const now = opts.now ?? Date.now();
  const windowDays = opts.windowDays ?? 7;
  const minInWindow = opts.minInWindow ?? 10;
  const fallbackCount = opts.fallbackCount ?? 40;
  const max = opts.max ?? 100;

  const withTime = all.map((item) => {
    let t = item.publishedAt ? Date.parse(item.publishedAt) : NaN;
    // Some feeds mislabel the zone; a slightly "future" item is shown as just published.
    if (Number.isFinite(t) && t > now) {
      if (t - now > 36 * 3600_000) t = NaN;
      else t = now;
    }
    return { item: Number.isFinite(t) ? { ...item, publishedAt: new Date(t).toISOString() } : { ...item, publishedAt: null }, t: Number.isFinite(t) ? t : -Infinity };
  });
  withTime.sort((a, b) => b.t - a.t);

  const seenTitles = new Set<string>();
  const seenUrls = new Set<string>();
  const unique: Array<{ item: NewsItem; t: number }> = [];
  for (const entry of withTime) {
    const key = titleKey(entry.item.title);
    const urlKey = entry.item.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
    if (!key || seenTitles.has(key) || seenUrls.has(urlKey)) continue;
    seenTitles.add(key);
    seenUrls.add(urlKey);
    unique.push(entry);
  }

  const cutoff = now - windowDays * 86_400_000;
  const inWindow = unique.filter((e) => e.t >= cutoff);
  const chosen = inWindow.length >= minInWindow ? inWindow : unique.slice(0, fallbackCount);
  return chosen.slice(0, max).map((e) => e.item);
}
