/** iCalendar (.ics, RFC 5545) file of one event, in Europe/Istanbul local time (pure TS). */
import { istanbulParts } from "@/core/time";

export type IcsEvent = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  /** Place name, address and city, joined for LOCATION. */
  location: string | null;
  lat: number | null;
  lng: number | null;
  /** Absolute URL of the event page. */
  url: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** 20260914T200000 in Istanbul local time (used with TZID=Europe/Istanbul). */
function localStamp(iso: string): string {
  const p = istanbulParts(iso);
  return `${p.year}${pad(p.month)}${pad(p.day)}T${pad(p.hour)}${pad(p.minute)}${pad(p.second)}`;
}

/** 20260911T120000Z (UTC, for DTSTAMP). */
function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** TEXT value escaping: backslash, semicolon, comma and line breaks. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

const utf8Length = (ch: string) => {
  const c = ch.codePointAt(0) ?? 0;
  return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
};

/** Folds a content line at 75 octets without splitting a UTF-8 character (continuation lines start with a space). */
function fold(line: string): string {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const len = utf8Length(ch);
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + len > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += len;
  }
  out.push(current);
  return out.join("\r\n ");
}

/**
 * The .ics text. Without an end time the event gets no DTEND (it starts at DTSTART); a multi-day event is one span
 * from its start to its end. `host` makes the UID globally unique ("<id>@gbzsehir.vercel.app").
 */
export function buildEventIcs(e: IcsEvent, host: string, now: Date = new Date()): string {
  const description = [e.description?.trim(), e.url].filter(Boolean).join("\n\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Gebzem//Etkinlikler//TR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    // Turkey has been UTC+3 all year since 2016 (no DST).
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Istanbul",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0300",
    "TZOFFSETTO:+0300",
    "TZNAME:+03",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${e.id}@${host}`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART;TZID=Europe/Istanbul:${localStamp(e.starts_at)}`,
    e.ends_at && new Date(e.ends_at).getTime() > new Date(e.starts_at).getTime() ? `DTEND;TZID=Europe/Istanbul:${localStamp(e.ends_at)}` : null,
    `SUMMARY:${escapeText(e.title)}`,
    description ? `DESCRIPTION:${escapeText(description)}` : null,
    e.location ? `LOCATION:${escapeText(e.location)}` : null,
    typeof e.lat === "number" && typeof e.lng === "number" ? `GEO:${e.lat.toFixed(6)};${e.lng.toFixed(6)}` : null,
    `URL:${e.url}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((l): l is string => l !== null);
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
