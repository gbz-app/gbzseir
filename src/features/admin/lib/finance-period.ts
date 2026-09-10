/** Period presets for the finance screen (Istanbul dates, "YYYY-MM-DD"). */
import { istanbulDateKey } from "@/core/time";

export const PERIODS = ["bu-ay", "gecen-ay", "bu-yil", "son-12-ay", "ozel"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABELS: Record<Period, string> = { "bu-ay": "Bu ay", "gecen-ay": "Geçen ay", "bu-yil": "Bu yıl", "son-12-ay": "Son 12 ay", ozel: "Özel aralık" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function periodRange(period: Period, custom: { from?: string; to?: string }, now = new Date()): { from: string; to: string } {
  const today = istanbulDateKey(now);
  const [y, m] = today.split("-").map(Number);
  switch (period) {
    case "gecen-ay": {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDay(py, pm))}` };
    }
    case "bu-yil":
      return { from: `${y}-01-01`, to: today };
    case "son-12-ay": {
      const start = new Date(Date.UTC(y, m - 12, 1));
      return { from: `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-01`, to: today };
    }
    case "ozel": {
      const from = custom.from && DATE_RE.test(custom.from) ? custom.from : `${y}-${pad(m)}-01`;
      const to = custom.to && DATE_RE.test(custom.to) ? custom.to : today;
      return from <= to ? { from, to } : { from: to, to: from };
    }
    default:
      return { from: `${y}-${pad(m)}-01`, to: today };
  }
}
