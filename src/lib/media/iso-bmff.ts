/**
 * Location-metadata removal for MP4 / MOV (ISO BMFF / QuickTime) WITHOUT re-encoding or remuxing.
 *
 * An MP4/MOV file is a tree of boxes ("atoms"): 4-byte big-endian size + 4-byte type (+ 8-byte size when size == 1,
 * "to the end" when size == 0), then the payload, which for container boxes is again a list of boxes. Phones write the
 * recording place into metadata boxes:
 * - iPhone: moov/meta (keys + ilst, com.apple.quicktime.location.ISO6709) and moov/udta
 * - Android: moov/udta/©xyz ("+40.8+029.4/")
 * - editing apps: XMP in a `uuid` box (BE7ACFCB-97A9-42E8-9C71-999491E3AFAC) or top-level udta/meta
 * We walk the tree and rename every `udta` and `meta` box (top level, inside moov and inside each trak) and every XMP
 * `uuid` box to `free`. `free` is the standard "ignore these bytes" box, so players skip it; sizes and offsets do not
 * change, so the sample tables (stco/co64 chunk offsets) stay valid and the video and audio are untouched. The 4-byte
 * type fields are the only bytes that change; the caller rebuilds the file from slices (no full copy in memory).
 *
 * Anything that does not parse cleanly (bad sizes, no moov, a box running past its parent) throws IsoBmffError: the
 * uploader then refuses the file instead of sending it with its metadata.
 *
 * Also reads the movie duration from moov/mvhd (works even when the browser cannot decode the codec, e.g. HEVC).
 */

export class IsoBmffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IsoBmffError";
  }
}

/** Random access to the file bytes (a File/Blob in the browser, a Uint8Array in tests). */
export type ByteSource = { size: number; read(offset: number, length: number): Promise<Uint8Array> };

export type StripPlan = {
  /** Absolute offsets of the 4-byte type fields to overwrite with "free". */
  patches: number[];
  /** What was found, e.g. ["moov/meta", "moov/udta", "moov/trak/udta"] (for logs / tests). */
  renamed: string[];
  /** From moov/mvhd; null when unknown (fragmented files often store 0). */
  durationS: number | null;
};

const TOP_LEVEL_FIRST = new Set(["ftyp", "wide", "free", "skip", "mdat", "moov", "pnot", "junk"]);
/** Containers we descend into inside moov. udta/meta are renamed whole, so never entered. */
const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "dinf", "stbl", "edts", "mvex"]);
const STRIP = new Set(["udta", "meta"]);
const XMP_UUID = "be7acfcb97a942e89c71999491e3afac";
/** Upper bound for the moov box we load into memory (a 60 s phone clip has well under 5 MB). */
const MAX_MOOV_BYTES = 64 * 1024 * 1024;
const MAX_TOP_LEVEL_BOXES = 10_000;

function u32(b: Uint8Array, o: number): number {
  return b[o] * 0x1000000 + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
}

function u64(b: Uint8Array, o: number): number {
  const hi = u32(b, o);
  if (hi >= 0x200000) throw new IsoBmffError("box too large");
  return hi * 0x100000000 + u32(b, o + 4);
}

function typeAt(b: Uint8Array, o: number): string {
  return String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
}

function hex(b: Uint8Array, o: number, n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += b[o + i].toString(16).padStart(2, "0");
  return s;
}

type Header = { type: string; headerSize: number; size: number };

/** Box header at `pos`; `limit` = bytes available to the box inside its parent (or to the end of the file). */
function parseHeader(buf: Uint8Array, pos: number, limit: number): Header {
  if (limit < 8 || buf.length - pos < 8) throw new IsoBmffError("truncated box header");
  let size = u32(buf, pos);
  const type = typeAt(buf, pos + 4);
  let headerSize = 8;
  if (size === 1) {
    if (limit < 16 || buf.length - pos < 16) throw new IsoBmffError("truncated large box header");
    size = u64(buf, pos + 8);
    headerSize = 16;
  } else if (size === 0) {
    size = limit;
  }
  if (size < headerSize || size > limit) throw new IsoBmffError(`invalid size for box ${JSON.stringify(type)}`);
  return { type, headerSize, size };
}

function mvhdDuration(b: Uint8Array, p: number, len: number): number | null {
  if (len < 20) return null;
  const version = b[p];
  let timescale: number;
  let duration: number;
  if (version === 1) {
    if (len < 32) return null;
    timescale = u32(b, p + 20);
    duration = u64(b, p + 24);
  } else {
    timescale = u32(b, p + 12);
    duration = u32(b, p + 16);
    if (duration === 0xffffffff) return null;
  }
  return timescale > 0 && duration > 0 ? duration / timescale : null;
}

/** Plans the renames (does not modify anything). Throws IsoBmffError when the file is not a well-formed MP4/MOV. */
export async function planMetadataStrip(src: ByteSource): Promise<StripPlan> {
  if (!(src.size >= 16)) throw new IsoBmffError("file too small");
  const patches: number[] = [];
  const renamed: string[] = [];
  let moov: { offset: number; header: Header } | null = null;

  // 1) Top level: only headers are read (mdat can be 100 MB).
  let offset = 0;
  for (let n = 0; offset < src.size; n++) {
    if (n >= MAX_TOP_LEVEL_BOXES) throw new IsoBmffError("too many boxes");
    const remaining = src.size - offset;
    const head = await src.read(offset, Math.min(32, remaining));
    // A few writers pad the file end with zero bytes; accept up to 7 of them.
    if (remaining < 8 && head.every((x) => x === 0)) break;
    const h = parseHeader(head, 0, remaining);
    if (n === 0 && !TOP_LEVEL_FIRST.has(h.type)) throw new IsoBmffError("not an MP4/MOV file");
    if (h.type === "moov") {
      if (moov) throw new IsoBmffError("two moov boxes");
      moov = { offset, header: h };
    } else if (STRIP.has(h.type)) {
      patches.push(offset + 4);
      renamed.push(h.type);
    } else if (h.type === "uuid" && head.length >= h.headerSize + 16 && hex(head, h.headerSize, 16) === XMP_UUID) {
      patches.push(offset + 4);
      renamed.push("uuid(xmp)");
    }
    offset += h.size;
  }
  if (!moov) throw new IsoBmffError("no moov box");
  if (moov.header.size > MAX_MOOV_BYTES) throw new IsoBmffError("moov box too large");

  // 2) moov in memory.
  const bytes = await src.read(moov.offset, moov.header.size);
  if (bytes.length !== moov.header.size) throw new IsoBmffError("short read");
  let durationS: number | null = null;

  const walk = (start: number, end: number, path: string, depth: number) => {
    if (depth > 12) throw new IsoBmffError("boxes nested too deep");
    let pos = start;
    while (pos < end) {
      // QuickTime may end a child list with a 32-bit zero terminator.
      if (end - pos < 8) {
        for (let i = pos; i < end; i++) if (bytes[i] !== 0) throw new IsoBmffError(`trailing bytes in ${path}`);
        return;
      }
      const h = parseHeader(bytes, pos, end - pos);
      const childPath = `${path}/${h.type}`;
      if (STRIP.has(h.type)) {
        patches.push(moov!.offset + pos + 4);
        renamed.push(childPath);
      } else if (h.type === "uuid" && h.size >= h.headerSize + 16 && hex(bytes, pos + h.headerSize, 16) === XMP_UUID) {
        patches.push(moov!.offset + pos + 4);
        renamed.push(`${path}/uuid(xmp)`);
      } else if (h.type === "mvhd" && path === "moov") {
        durationS = mvhdDuration(bytes, pos + h.headerSize, h.size - h.headerSize);
      } else if (CONTAINERS.has(h.type)) {
        walk(pos + h.headerSize, pos + h.size, childPath, depth + 1);
      }
      pos += h.size;
    }
  };
  walk(moov.header.headerSize, moov.header.size, "moov", 0);

  return { patches: patches.sort((a, b) => a - b), renamed, durationS };
}

/** "free" as bytes. */
export const FREE_TYPE = new Uint8Array([0x66, 0x72, 0x65, 0x65]);
