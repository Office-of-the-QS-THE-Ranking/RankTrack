/*
 * Reads the entries of a ZIP archive held in memory (XLSX and DOCX files are ZIP archives). Stored and deflated
 * entries only, no ZIP64, and hard limits on what may be inflated, so a crafted file can't exhaust memory. Nothing
 * is written to disk. The inflater is passed in: Node's zlib on the server and in scripts (node.ts), the browser's
 * DecompressionStream in the Office's browser (browser.ts), so the same readers run in both places.
 */

/** Inflates raw DEFLATE data, refusing to produce more than `max` bytes. */
export type InflateSync = (data: Uint8Array, max: number) => Uint8Array;
export type InflateAsync = (data: Uint8Array, max: number) => Promise<Uint8Array>;

export const ZIP_LIMITS = { entries: 4000, entryBytes: 64 * 1024 * 1024, totalBytes: 256 * 1024 * 1024 };

export class ZipError extends Error {}

interface Entry {
  name: string;
  method: number;
  compressed: number;
  size: number;
  offset: number;
}

function entries(buf: Uint8Array): Entry[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // The end-of-central-directory record sits in the last 64 KiB (its comment can be that long).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError("This file isn’t a ZIP-based document (XLSX or DOCX).");
  const count = view.getUint16(eocd + 10, true);
  const dirOffset = view.getUint32(eocd + 16, true);
  if (count > ZIP_LIMITS.entries) throw new ZipError("This file holds too many parts to read.");
  const out: Entry[] = [];
  let p = dirOffset;
  const decoder = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (p + 46 > buf.length || view.getUint32(p, true) !== 0x02014b50) throw new ZipError("This file’s table of contents is damaged.");
    const method = view.getUint16(p + 10, true);
    const compressed = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const offset = view.getUint32(p + 42, true);
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    out.push({ name, method, compressed, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export interface Zip {
  names: string[];
  has: (name: string) => boolean;
  bytes: (name: string) => Uint8Array | null;
  text: (name: string) => string | null;
}

/** Where an entry's compressed bytes sit. */
function dataOf(buf: Uint8Array, e: Entry): Uint8Array {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (e.offset + 30 > buf.length || view.getUint32(e.offset, true) !== 0x04034b50) throw new ZipError("A part of this file is damaged.");
  const start = e.offset + 30 + view.getUint16(e.offset + 26, true) + view.getUint16(e.offset + 28, true);
  return buf.subarray(start, start + e.compressed);
}

const decoder = new TextDecoder();

/** Every entry's bytes, by name, inflated on demand. */
export function readZip(buf: Uint8Array, inflate: InflateSync): Zip {
  const list = entries(buf);
  const byName = new Map(list.map((e) => [e.name, e]));
  let inflated = 0;
  const bytes = (name: string): Uint8Array | null => {
    const e = byName.get(name);
    if (!e) return null;
    if (e.size > ZIP_LIMITS.entryBytes || inflated + e.size > ZIP_LIMITS.totalBytes) throw new ZipError("This file is too large to read.");
    const data = dataOf(buf, e);
    let out: Uint8Array;
    if (e.method === 0) out = data;
    else if (e.method === 8) {
      try {
        out = inflate(data, ZIP_LIMITS.entryBytes);
      } catch {
        throw new ZipError("A part of this file couldn’t be decompressed.");
      }
    } else throw new ZipError("This file uses a compression the Hub can’t read.");
    inflated += out.length;
    return out;
  };
  return { names: list.map((e) => e.name), has: (n) => byName.has(n), bytes, text: (n) => (bytes(n) ? decoder.decode(bytes(n)!) : null) };
}

/** The same, with the wanted entries inflated up front by an asynchronous inflater (the browser's). */
export async function openZip(buf: Uint8Array, inflate: InflateAsync, wanted: (name: string) => boolean): Promise<Zip> {
  const list = entries(buf);
  const ready = new Map<string, Uint8Array>();
  let inflated = 0;
  for (const e of list.filter((x) => wanted(x.name))) {
    if (e.size > ZIP_LIMITS.entryBytes || inflated + e.size > ZIP_LIMITS.totalBytes) throw new ZipError("This file is too large to read.");
    const data = dataOf(buf, e);
    let out: Uint8Array;
    if (e.method === 0) out = data;
    else if (e.method === 8) {
      try {
        out = await inflate(data, ZIP_LIMITS.entryBytes);
      } catch {
        throw new ZipError("A part of this file couldn’t be decompressed.");
      }
    } else throw new ZipError("This file uses a compression the Hub can’t read.");
    inflated += out.length;
    ready.set(e.name, out);
  }
  const names = list.map((e) => e.name);
  return { names, has: (n) => names.includes(n), bytes: (n) => ready.get(n) ?? null, text: (n) => (ready.has(n) ? decoder.decode(ready.get(n)!) : null) };
}


const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** XML text with its character references resolved. */
export function xmlText(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** An attribute's value on an XML start tag. */
export function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`(?:^|\\s)${name.replace(/[:]/g, "\\:")}="([^"]*)"`).exec(tag);
  return m ? xmlText(m[1]) : undefined;
}
