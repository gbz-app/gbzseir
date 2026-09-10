// Verify candidate local RSS feeds (Gebze / Kocaeli) and upsert the working ones into public.news_sources.
// Only feeds that return real RSS/Atom with at least one item are stored (active=true).
// Usage: node --env-file=.env.local scripts/db/seed-news-sources.mjs
import { XMLParser } from "fast-xml-parser";
import { sql, lit, UA } from "./lib.mjs";

const CANDIDATES = [
  { name: "Yeni Gebze", site: "https://www.yenigebze.com" },
  { name: "Gebze Haber", site: "https://www.gebzehaber.net" },
  { name: "Haber Gebze", site: "https://www.habergebze.com" },
  { name: "Gebze'nin Sesi", site: "https://www.gebzeninsesi.com" },
  { name: "Gebze Hür Ses", site: "https://www.gebzehurses.com" },
  { name: "Gölge Gazetesi", site: "https://www.golgegazetesi.com" },
  { name: "Özgür Kocaeli", site: "https://www.ozgurkocaeli.com.tr" },
  { name: "Bizim Yaka", site: "https://www.bizimyaka.com" },
  { name: "Çağdaş Kocaeli", site: "https://www.cagdaskocaeli.com.tr" },
  { name: "Kocaeli Fikir", site: "https://www.kocaelifikir.com" },
  { name: "Ses Kocaeli", site: "https://www.seskocaeli.com" },
  { name: "Kocaeli Büyükşehir Belediyesi", site: "https://www.kocaeli.bel.tr" },
  { name: "Darıca Belediyesi", site: "https://www.darica.bel.tr" },
];
const PATHS = ["/rss", "/feed", "/rss.xml", "/feed/", "/rss/anasayfa", "/export/rss", "/rss/haberler", "/tr/rss"];

const parser = new XMLParser({ ignoreAttributes: false });

async function tryFeed(url) {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.1" },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (!/<(rss|feed|rdf:RDF)[\s>]/i.test(text.slice(0, 2000))) return null;
    const x = parser.parse(text);
    const items = x?.rss?.channel?.item ?? x?.feed?.entry ?? x?.["rdf:RDF"]?.item ?? [];
    const list = Array.isArray(items) ? items : [items];
    if (!list.length) return null;
    const first = list[0];
    const title = typeof first.title === "string" ? first.title : first.title?.["#text"];
    return { finalUrl: res.url || url, count: list.length, sample: String(title || "").slice(0, 80) };
  } catch {
    return null;
  }
}

const found = [];
for (const c of CANDIDATES) {
  let hit = null;
  for (const p of PATHS) {
    const url = c.site + p;
    hit = await tryFeed(url);
    if (hit) {
      hit.url = url;
      break;
    }
  }
  if (!hit) {
    // try without www
    const bare = c.site.replace("://www.", "://");
    for (const p of PATHS.slice(0, 3)) {
      hit = await tryFeed(bare + p);
      if (hit) {
        hit.url = bare + p;
        break;
      }
    }
  }
  console.log(`${hit ? "OK  " : "FAIL"} ${c.name.padEnd(30)} ${hit ? `${hit.url} (${hit.count} items) "${hit.sample}"` : ""}`);
  if (hit) found.push({ ...c, feed: hit.url });
}

if (found.length) {
  const values = found.map((f) => `(${lit(f.name)}, ${lit(f.site)}, ${lit(f.feed)}, true)`).join(",\n");
  await sql(`insert into public.news_sources (name, site_url, feed_url, active) values ${values}
    on conflict (feed_url) do update set name = excluded.name, site_url = excluded.site_url, active = true;`);
}
console.log(`stored ${found.length}/${CANDIDATES.length} verified feeds`);
