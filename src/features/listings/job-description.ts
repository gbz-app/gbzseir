/**
 * İş ilanı açıklaması + "Aranan nitelikler" tek description sütununda saklanır
 * (böylece DB moderasyon bayrakları iki metni de tarar). Bu yardımcılar birleştirir / ayırır.
 */

const MARKER = "\n\nAranan nitelikler:\n";

export function composeJobDescription(description: string, qualifications: string): string {
  const d = description.trim();
  const q = qualifications.trim();
  return q ? `${d}${MARKER}${q}` : d;
}

export function splitJobDescription(text: string | null | undefined): { description: string; qualifications: string } {
  const t = text ?? "";
  const i = t.lastIndexOf(MARKER);
  if (i < 0) return { description: t, qualifications: "" };
  return { description: t.slice(0, i), qualifications: t.slice(i + MARKER.length) };
}
