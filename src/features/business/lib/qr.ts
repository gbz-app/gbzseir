import "server-only";
import { toDataURL, toString as toSvgString } from "qrcode";

const COLORS = { dark: "#15121fff", light: "#ffffffff" };

/** QR code of a URL as inline SVG markup (scales with CSS) and as a 1024px PNG data URL for download. */
export async function qrForUrl(url: string): Promise<{ svg: string; png: string }> {
  const [svg, png] = await Promise.all([
    toSvgString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: COLORS }),
    toDataURL(url, { width: 1024, margin: 2, errorCorrectionLevel: "M", color: COLORS }),
  ]);
  return { svg, png };
}
