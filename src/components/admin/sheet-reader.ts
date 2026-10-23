/*
 * Reads the first worksheet of an .xlsx file, or a .csv file, into rows of strings, in the browser and
 * without a library: an .xlsx file is a ZIP of XML parts, and modern browsers can inflate them.
 */

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === ";" || ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

interface Entry {
  name: string;
  method: number;
  size: number;
  offset: number;
}

function entries(buf: ArrayBuffer): Entry[] {
  const v = new DataView(buf);
  let end = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66_000); i--)
    if (v.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) throw new Error("This is not a valid .xlsx file.");
  const count = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const out: Entry[] = [];
  const dec = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const method = v.getUint16(p + 10, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const extraLen = v.getUint16(p + 30, true);
    const commentLen = v.getUint16(p + 32, true);
    const offset = v.getUint32(p + 42, true);
    out.push({ name: dec.decode(new Uint8Array(buf, p + 46, nameLen)), method, size, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

async function read(buf: ArrayBuffer, e: Entry): Promise<string> {
  const v = new DataView(buf);
  const start = e.offset + 30 + v.getUint16(e.offset + 26, true) + v.getUint16(e.offset + 28, true);
  const raw = new Uint8Array(buf, start, e.size);
  if (e.method === 0) return new TextDecoder().decode(raw);
  if (e.method !== 8) throw new Error("This .xlsx file uses an unsupported compression.");
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return await new Response(stream).text();
}

const colIndex = (ref: string) => {
  const letters = ref.replace(/\d+/g, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export async function readXlsx(buf: ArrayBuffer): Promise<string[][]> {
  const list = entries(buf);
  const find = (name: string) => list.find((e) => e.name === name);
  const xml = (s: string) => new DOMParser().parseFromString(s, "application/xml");
  const shared: string[] = [];
  const ss = find("xl/sharedStrings.xml");
  if (ss) for (const si of Array.from(xml(await read(buf, ss)).getElementsByTagName("si"))) shared.push(Array.from(si.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""));
  const sheet = find("xl/worksheets/sheet1.xml") ?? list.find((e) => /^xl\/worksheets\/sheet\d+\.xml$/.test(e.name));
  if (!sheet) throw new Error("No worksheet found in this file.");
  const doc = xml(await read(buf, sheet));
  const rows: string[][] = [];
  for (const r of Array.from(doc.getElementsByTagName("row"))) {
    const row: string[] = [];
    for (const c of Array.from(r.getElementsByTagName("c"))) {
      const i = colIndex(c.getAttribute("r") ?? "A");
      const t = c.getAttribute("t");
      const val = c.getElementsByTagName("v")[0]?.textContent ?? "";
      row[i] = t === "s" ? shared[Number(val)] ?? "" : t === "inlineStr" ? Array.from(c.getElementsByTagName("t")).map((x) => x.textContent ?? "").join("") : val;
    }
    rows.push(Array.from(row, (x) => x ?? ""));
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export async function readSheetFile(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) return readXlsx(await file.arrayBuffer());
  if (/\.(csv|txt)$/i.test(file.name)) return parseCsv(await file.text());
  throw new Error("Use a .csv or .xlsx file.");
}
