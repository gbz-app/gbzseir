// App icons from the brand logo (owner, 12.09):
// - assets/brand/logo-app.png (the "g" on the lilac-to-white gradient) -> home screen / PWA icons, apple-touch-icon,
//   favicon.ico and the SVG favicon;
// - assets/brand/logo-mark.png (black "g" on transparent) -> the notification badge (white on transparent) and the
//   launch splash image (public/brand/logo-mark.webp, src/components/pwa/app-splash.tsx).
// Shortcut icons and the Open Graph image still come from scripts/generate-icons.mjs.
// Usage: node scripts/generate-logo-icons.mjs   (sharp ships with Next.js).
// The icons go to public/icons/v2: /icons/ is cached for a week (next.config.ts) and cache-first by the service worker,
// so phones only pick up a new logo under a new path. For the next logo change use a new folder (v3), update the paths
// in src/app/manifest.ts, src/app/layout.tsx and public/sw.js, and bump VERSION in public/sw.js.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const APP = join(root, "assets/brand/logo-app.png");
const MARK = join(root, "assets/brand/logo-mark.png");
const icons = join(root, "public/icons/v2");
const brand = join(root, "public/brand");
mkdirSync(icons, { recursive: true });
mkdirSync(brand, { recursive: true });

// RGBA on purpose: the logo art has no alpha, and the favicon.ico decoder (Next / browsers) wants RGBA PNG entries.
const png = (size) => sharp(APP).resize(size, size).ensureAlpha().png({ compressionLevel: 9 }).toBuffer();

// Full-bleed square: the "g" sits well inside the 80% safe circle, so the same art serves "any" and "maskable".
writeFileSync(join(icons, "icon-512.png"), await png(512));
writeFileSync(join(icons, "icon-192.png"), await png(192));
writeFileSync(join(icons, "maskable-512.png"), await png(512));
writeFileSync(join(icons, "apple-touch-icon.png"), await png(180));

// SVG favicon: the 64 px PNG inside an SVG (browsers that prefer the SVG entry get the same art).
const fav64 = (await png(64)).toString("base64");
writeFileSync(
  join(icons, "icon.svg"),
  `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><image href="data:image/png;base64,${fav64}" width="64" height="64"/></svg>`,
);

// favicon.ico with 16 / 32 / 48 PNG entries.
const entries = [];
for (const size of [16, 32, 48]) entries.push({ size, buf: await png(size) });
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(entries.length, 4);
const dir = Buffer.alloc(16 * entries.length);
let offset = 6 + 16 * entries.length;
entries.forEach((e, i) => {
  const o = i * 16;
  dir.writeUInt8(e.size, o);
  dir.writeUInt8(e.size, o + 1);
  dir.writeUInt16LE(1, o + 4);
  dir.writeUInt16LE(32, o + 6);
  dir.writeUInt32LE(e.buf.length, o + 8);
  dir.writeUInt32LE(offset, o + 12);
  offset += e.buf.length;
});
writeFileSync(join(root, "src/app/favicon.ico"), Buffer.concat([header, dir, ...entries.map((e) => e.buf)]));

// Notification badge: the "g" in white on transparent (Android only reads the alpha channel), with a little margin.
const alpha = await sharp(MARK)
  .resize(60, 60, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .extend({ top: 6, bottom: 6, left: 6, right: 6, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .ensureAlpha()
  .extractChannel(3)
  .toBuffer();
const badge = await sharp({ create: { width: 72, height: 72, channels: 3, background: "#ffffff" } })
  .joinChannel(alpha)
  .png({ compressionLevel: 9 })
  .toBuffer();
writeFileSync(join(icons, "badge-72.png"), badge);

// Launch splash mark: black "g" on transparent, 720 px (shown at 240 px, 3x for sharp phones).
await sharp(MARK).resize(720, 720, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 90 }).toFile(join(brand, "logo-mark.webp"));

console.log("Logo icons written to public/icons/v2, src/app/favicon.ico and public/brand/logo-mark.webp");
