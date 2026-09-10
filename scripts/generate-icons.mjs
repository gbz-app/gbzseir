// Generates the app's PNG/ICO/SVG assets from Lucide icons: flat 2D, solid colors, no logo, no gradients.
// Usage: node scripts/generate-icons.mjs   (sharp ships with Next.js)
// The primary color mirrors BRAND_COLORS in src/config/site.ts; the name/tagline are read from there.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const site = readFileSync(join(root, "src/config/site.ts"), "utf8");
const APP_NAME = site.match(/APP_NAME = "([^"]+)"/)?.[1] ?? "App";
const TAGLINE = site.match(/APP_TAGLINE = "([^"]+)"/)?.[1] ?? "";
const outDir = join(root, "public/icons");
mkdirSync(outDir, { recursive: true });

const TEAL = "#0F766E";
const WHITE = "#FFFFFF";

/** SVG elements of a Lucide icon (24x24 grid), read from the installed lucide-react package. */
function lucide(name) {
  const src = readFileSync(join(root, `node_modules/lucide-react/dist/esm/icons/${name}.mjs`), "utf8");
  const parts = [];
  for (const m of src.matchAll(/\[\s*"(\w+)",\s*\{([^}]*)\}\s*\]/g)) {
    const attrs = [...m[2].matchAll(/(\w+):\s*"([^"]*)"/g)]
      .filter(([, k]) => k !== "key")
      .map(([, k, v]) => `${k}="${v}"`)
      .join(" ");
    parts.push(`<${m[1]} ${attrs}/>`);
  }
  if (!parts.length) throw new Error(`Lucide icon not found: ${name}`);
  return parts.join("");
}

/** Lucide glyph centered in a `size` box, glyph width = ratio * size. */
function glyph(name, size, ratio, color, strokeWidth = 2) {
  const s = (size * ratio) / 24;
  const t = (size - 24 * s) / 2;
  return `<g transform="translate(${t} ${t}) scale(${s})" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${lucide(name)}</g>`;
}

const svg = (w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;

async function png(svgString, file, size) {
  const buf = await sharp(Buffer.from(svgString), { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(join(outDir, file), buf);
  return buf;
}

// 1) "any" icons: flat rounded teal square + white map pin.
const anyIcon = (size) => svg(size, size, `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${TEAL}"/>${glyph("map-pin", size, 0.56, WHITE)}`);
await png(anyIcon(512), "icon-512.png", 512);
await png(anyIcon(512), "icon-192.png", 192);

// 2) maskable: full bleed, glyph inside the 80% safe zone.
await png(svg(512, 512, `<rect width="512" height="512" fill="${TEAL}"/>${glyph("map-pin", 512, 0.46, WHITE)}`), "maskable-512.png", 512);

// 3) apple-touch-icon: full bleed (iOS rounds the corners).
await png(svg(180, 180, `<rect width="180" height="180" fill="${TEAL}"/>${glyph("map-pin", 180, 0.56, WHITE)}`), "apple-touch-icon.png", 180);

// 4) notification badge: white glyph on transparent (Android uses the alpha channel only).
await png(svg(72, 72, glyph("map-pin", 72, 0.82, WHITE, 2.4)), "badge-72.png", 72);

// 5) SVG favicon + favicon.ico (16/32/48 PNG entries; thicker stroke so it stays legible when tiny).
const favSvg = svg(64, 64, `<rect width="64" height="64" rx="14" fill="${TEAL}"/>${glyph("map-pin", 64, 0.66, WHITE, 2.6)}`);
writeFileSync(join(outDir, "icon.svg"), favSvg);
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

// 6) Manifest shortcut icons (96px): white Lucide glyph on a flat teal circle.
const shortcut = (name) => svg(96, 96, `<circle cx="48" cy="48" r="48" fill="${TEAL}"/>${glyph(name, 96, 0.5, WHITE)}`);
await png(shortcut("cross"), "shortcut-pharmacy.png", 96);
await png(shortcut("plus"), "shortcut-post.png", 96);
await png(shortcut("wrench"), "shortcut-service.png", 96);

// 7) Open Graph image 1200x630: flat teal, text only.
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const og = svg(
  1200,
  630,
  `<rect width="1200" height="630" fill="${TEAL}"/>
   <text x="96" y="290" font-family="Google Sans, Segoe UI, Arial, Helvetica, sans-serif" font-size="120" font-weight="700" fill="${WHITE}">${esc(APP_NAME)}</text>
   <text x="100" y="370" font-family="Google Sans, Segoe UI, Arial, Helvetica, sans-serif" font-size="48" font-weight="500" fill="#CCFBF1">${esc(TAGLINE)}</text>
   <text x="100" y="446" font-family="Google Sans, Segoe UI, Arial, Helvetica, sans-serif" font-size="32" fill="${WHITE}" opacity="0.85">Nöbetçi eczane · İlanlar · Ustalar · Gezilecek yerler</text>`,
);
writeFileSync(join(outDir, "og-image.png"), await sharp(Buffer.from(og)).png({ compressionLevel: 9 }).toBuffer());

console.log("Icons written to public/icons and src/app/favicon.ico");
