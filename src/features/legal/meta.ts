import { routes } from "@/core/routes";

/**
 * Legal texts (public.legal_texts): slugs, labels, public paths and the body format.
 * Pure, safe on the server and in client components (admin editor preview).
 */

export const LEGAL_SLUGS = ["kvkk", "acik-riza", "kosullar", "gizlilik", "cerez"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export const isLegalSlug = (v: unknown): v is LegalSlug => typeof v === "string" && (LEGAL_SLUGS as readonly string[]).includes(v);

export const LEGAL_LABELS: Record<LegalSlug, string> = {
  kvkk: "KVKK Aydınlatma Metni",
  "acik-riza": "Açık Rıza Metni",
  kosullar: "Kullanım Koşulları",
  gizlilik: "Gizlilik Politikası",
  cerez: "Çerez Politikası",
};

export const LEGAL_DESCRIPTIONS: Record<LegalSlug, string> = {
  kvkk: "Gebzem'de kişisel verilerinin hangi amaçla ve hangi hukuki sebeple işlendiği, kimlere aktarıldığı ve KVKK kapsamındaki hakların.",
  "acik-riza": "Kampanya ve duyuru iletileri için isteğe bağlı açık rıza metni.",
  kosullar: "Gebzem'i kullanırken geçerli kurallar: hesap, ilanlar, hizmet talepleri, işletmeler ve değerlendirmeler.",
  gizlilik: "Gebzem hangi bilgileri toplar, neleri toplamaz; verilerin nerede ve ne kadar süre saklanır.",
  cerez: "Gebzem'in kullandığı zorunlu çerezler ve tarayıcında sakladığı bilgiler.",
};

export const LEGAL_PATHS: Record<LegalSlug, string> = {
  kvkk: routes.legal.kvkk(),
  "acik-riza": routes.legal.explicitConsent(),
  kosullar: routes.legal.terms(),
  gizlilik: routes.legal.privacy(),
  cerez: routes.legal.cookies(),
};

/** Admin editor of the legal texts (under Ayarlar). */
export const legalAdminPath = () => `${routes.admin.settings()}/yasal`;

/** Same rule as the legal_texts.version check. */
export const LEGAL_VERSION_RE = /^[0-9A-Za-z][0-9A-Za-z.-]{0,19}$/;
export const LEGAL_TITLE_MAX = 160;
export const LEGAL_BODY_MAX = 60000;

/** Next free "major.minor" after the highest existing one: ["0.1", "0.2"] -> "0.3", ["1.9"] -> "1.10", none -> "1.0". */
export function suggestNextVersion(existing: readonly string[]): string {
  let best: [number, number] | null = null;
  for (const v of existing) {
    const m = /^(\d+)\.(\d+)$/.exec(v);
    if (!m) continue;
    const cur: [number, number] = [Number(m[1]), Number(m[2])];
    if (!best || cur[0] > best[0] || (cur[0] === best[0] && cur[1] > best[1])) best = cur;
  }
  if (!best) return "1.0";
  let minor = best[1] + 1;
  while (existing.includes(`${best[0]}.${minor}`)) minor++;
  return `${best[0]}.${minor}`;
}

/** The latest published version of one text (public pages). */
export type LegalText = {
  slug: LegalSlug;
  version: string;
  title: string;
  body: string;
  /** Show "Taslak - hukuki inceleme bekliyor" on the page. */
  pendingReview: boolean;
  publishedAt: string;
};

export type LegalBlock = { type: "heading"; text: string } | { type: "paragraph"; text: string } | { type: "list"; items: string[] };

const BULLET_RE = /^[-•]\s+/;

/**
 * Body format (plain text, like the news editor): blank lines split paragraphs, a line starting with "## " is a
 * heading, consecutive "- " lines form a list. Other single line breaks stay inside the paragraph.
 */
export function parseLegalBody(body: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let kind: "text" | "item" | null = null;
  let lines: string[] = [];
  const flush = () => {
    if (lines.length && kind === "item") blocks.push({ type: "list", items: lines.map((l) => l.replace(BULLET_RE, "")) });
    else if (lines.length) blocks.push({ type: "paragraph", text: lines.join("\n") });
    kind = null;
    lines = [];
  };
  for (const chunk of body.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/)) {
    for (const line of chunk.split("\n").map((l) => l.trim())) {
      if (!line) continue;
      if (line.startsWith("## ")) {
        flush();
        const text = line.slice(3).trim();
        if (text) blocks.push({ type: "heading", text });
        continue;
      }
      const next = BULLET_RE.test(line) ? "item" : "text";
      if (kind !== next) flush();
      kind = next;
      lines.push(line);
    }
    flush();
  }
  return blocks;
}
