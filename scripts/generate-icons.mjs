// Generates the manifest shortcut icons and the Open Graph image from Lucide icons: flat 2D, solid colors.
// The app / home screen icons and favicons are the brand logo: scripts/generate-logo-icons.mjs.
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

// Brand violet (the constant name is historic; keep in sync with BRAND_COLORS.primary).
const TEAL = "#8C6CF0";
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

// App / home screen icons, apple-touch-icon, badge, icon.svg and favicon.ico come from the brand logo since 12.09:
// scripts/generate-logo-icons.mjs. This script only makes the shortcut icons and the Open Graph image.

// Manifest shortcut icons (96px): white Lucide glyph on a flat teal circle.
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
   <text x="100" y="370" font-family="Google Sans, Segoe UI, Arial, Helvetica, sans-serif" font-size="48" font-weight="500" fill="#EDE7FE">${esc(TAGLINE)}</text>
   <text x="100" y="446" font-family="Google Sans, Segoe UI, Arial, Helvetica, sans-serif" font-size="32" fill="${WHITE}" opacity="0.85">Nöbetçi eczane · İlanlar · Ustalar · Gezilecek yerler</text>`,
);
writeFileSync(join(outDir, "og-image.png"), await sharp(Buffer.from(og)).png({ compressionLevel: 9 }).toBuffer());

console.log("Icons written to public/icons and src/app/favicon.ico");
