// Generates all PNG/ICO/SVG brand assets from the SVG logo (a map pin with a stylized "G").
// Usage: node scripts/generate-icons.mjs   (sharp ships with Next.js)
// Colors mirror BRAND_COLORS in src/config/site.ts; the brand name is read from APP_NAME there.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const site = readFileSync(join(root, "src/config/site.ts"), "utf8");
const APP_NAME = site.match(/APP_NAME = "([^"]+)"/)?.[1] ?? "App";
const TAGLINE = site.match(/APP_TAGLINE = "([^"]+)"/)?.[1] ?? "";
const outDir = join(root, "public/icons");
mkdirSync(outDir, { recursive: true });

const TEAL_L = "#14B8A6";
const TEAL = "#0F766E";
const TEAL_D = "#134E4A";
const AMBER = "#F59E0B";

// Pin + G in a 64x64 box (same geometry as src/components/brand/logo.tsx).
const PIN_D = "M32 4C20.4 4 11 13.2 11 24.6c0 14.9 17.5 32.1 19.6 34.1a2 2 0 0 0 2.8 0C35.5 56.7 53 39.5 53 24.6 53 13.2 43.6 4 32 4z";
const G_D = "M39.66 17.57A10 10 0 1 0 42 24H33.5";

const gradient = (id) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${TEAL_L}"/><stop offset="0.55" stop-color="${TEAL}"/><stop offset="1" stop-color="${TEAL_D}"/></linearGradient>`;

/** Colored pin (for light backgrounds / favicon). */
const pinColored = (s, tx, ty) =>
  `<g transform="translate(${tx} ${ty}) scale(${s})"><path d="${PIN_D}" fill="url(#pin)"/><path d="${G_D}" fill="none" stroke="#fff" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="44.5" cy="12.5" r="3.2" fill="${AMBER}"/></g>`;

/** White pin with teal G (for teal backgrounds). */
const pinWhite = (s, tx, ty) =>
  `<g transform="translate(${tx} ${ty}) scale(${s})"><path d="${PIN_D}" fill="#fff"/><path d="${G_D}" fill="none" stroke="${TEAL}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="44.5" cy="12.5" r="3.4" fill="${AMBER}"/></g>`;

/** Pin centered in a square of `size` with pin height = ratio * size. */
function centeredPin(size, ratio, white) {
  const s = (size * ratio) / 56;
  const tx = size / 2 - 32 * s;
  const ty = size / 2 - 32 * s;
  return white ? pinWhite(s, tx, ty) : pinColored(s, tx, ty);
}

const svg = (w, h, body, defs = "") => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}</defs>${body}</svg>`;

async function png(svgString, file, size) {
  const buf = await sharp(Buffer.from(svgString), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(outDir, file), buf);
  return buf;
}

// 1) "any" icons: rounded teal square + white pin.
const anyIcon = (size) =>
  svg(size, size, `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#bg)"/>${centeredPin(size, 0.62, true)}`, gradient("bg"));
await png(anyIcon(512), "icon-512.png", 512);
await png(anyIcon(512), "icon-192.png", 192);

// 2) maskable: full bleed, pin inside the 80% safe zone.
const maskable = svg(512, 512, `<rect width="512" height="512" fill="url(#bg)"/>${centeredPin(512, 0.5, true)}`, gradient("bg"));
await png(maskable, "maskable-512.png", 512);

// 3) apple-touch-icon: full bleed (iOS rounds the corners).
const apple = svg(180, 180, `<rect width="180" height="180" fill="url(#bg)"/>${centeredPin(180, 0.6, true)}`, gradient("bg"));
await png(apple, "apple-touch-icon.png", 180);

// 4) notification badge: white silhouette with the G cut out (Android uses alpha only).
const badge = svg(
  72,
  72,
  `<g mask="url(#m)"><g transform="translate(4 4) scale(1)"><path d="${PIN_D}" fill="#fff"/></g></g>`,
  `<mask id="m"><rect width="72" height="72" fill="#fff"/><g transform="translate(4 4)"><path d="${G_D}" fill="none" stroke="#000" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/></g></mask>`,
);
await png(badge, "badge-72.png", 72);

// 5) SVG mark + favicon.ico (16/32/48 PNG entries).
const markSvg = svg(64, 64, pinColored(1, 0, 0), gradient("pin"));
writeFileSync(join(outDir, "icon.svg"), markSvg);
const favSvg = svg(64, 64, pinColored(1.08, -2.6, -3.4), gradient("pin"));
const icoEntries = [];
for (const size of [16, 32, 48]) {
  icoEntries.push({ size, buf: await sharp(Buffer.from(favSvg), { density: 384 }).resize(size, size).png().toBuffer() });
}
function ico(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + 16 * entries.length;
  entries.forEach((e, i) => {
    const o = i * 16;
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o);
    dir.writeUInt8(e.size >= 256 ? 0 : e.size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(e.buf.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += e.buf.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.buf)]);
}
writeFileSync(join(root, "src/app/favicon.ico"), ico(icoEntries));

// 6) Manifest shortcut icons (96px): white glyph on a teal circle.
const shortcut = (glyph) => svg(96, 96, `<circle cx="48" cy="48" r="48" fill="url(#bg)"/>${glyph}`, gradient("bg"));
await png(shortcut(`<rect x="40" y="24" width="16" height="48" rx="4" fill="#fff"/><rect x="24" y="40" width="48" height="16" rx="4" fill="#fff"/>`), "shortcut-pharmacy.png", 96);
await png(shortcut(`<rect x="44" y="26" width="8" height="44" rx="4" fill="#fff"/><rect x="26" y="44" width="44" height="8" rx="4" fill="#fff"/>`), "shortcut-post.png", 96);
await png(
  shortcut(
    `<g transform="translate(24 24) scale(2)"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></g>`,
  ),
  "shortcut-service.png",
  96,
);

// 7) Open Graph image 1200x630.
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const og = svg(
  1200,
  630,
  `<rect width="1200" height="630" fill="url(#bg)"/>
   <circle cx="1080" cy="80" r="220" fill="#fff" opacity="0.06"/><circle cx="120" cy="600" r="180" fill="#fff" opacity="0.05"/>
   <rect x="96" y="171" width="288" height="288" rx="64" fill="#fff" opacity="0.14"/>
   ${pinWhite(3.9, 115, 190)}
   <text x="440" y="300" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="112" font-weight="800" fill="#fff">${esc(APP_NAME)}</text>
   <text x="444" y="372" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="46" font-weight="600" fill="#CCFBF1">${esc(TAGLINE)}</text>
   <text x="444" y="440" font-family="Segoe UI, Arial, Helvetica, sans-serif" font-size="30" fill="#fff" opacity="0.85">Nöbetçi eczane · İlanlar · Ustalar · Gezilecek yerler</text>`,
  gradient("bg"),
);
writeFileSync(join(outDir, "og-image.png"), await sharp(Buffer.from(og)).png({ compressionLevel: 9 }).toBuffer());

console.log("Icons written to public/icons and src/app/favicon.ico");
