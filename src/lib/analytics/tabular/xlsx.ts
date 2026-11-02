/*
 * Reads an Excel workbook (XLSX) held in memory into plain rows: shared and inline strings, numbers, booleans, and
 * dates (cells whose number format is a date become ISO dates, in either of Excel's date systems). Formulas are read
 * as their cached results. Enough for the Office's templates and units' workbooks; nothing is written to disk.
 */
import { attr, xmlText, type Zip } from "./zip";

export type Cell = string | number | boolean | null;

export interface Sheet {
  name: string;
  rows: Cell[][];
}

/** Most rows read from one sheet; templates are far smaller. */
export const SHEET_ROWS = 200_000;

const BUILTIN_DATES = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

/** A custom number format that shows a date: it has a day or a year once quoted text and colours are taken out. */
const isDateFormat = (code: string) => /[dy]/i.test(code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, ""));

function dateStyles(zip: Zip): Set<number> {
  const xml = zip.text("xl/styles.xml");
  const out = new Set<number>();
  if (!xml) return out;
  const custom = new Map<number, string>();
  for (const m of xml.matchAll(/<numFmt\b([^>]*)\/?>/g)) {
    const id = Number(attr(m[1], "numFmtId"));
    const code = attr(m[1], "formatCode");
    if (Number.isFinite(id) && code) custom.set(id, code);
  }
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? "";
  let i = 0;
  for (const m of xfs.matchAll(/<xf\b([^>]*?)(?:\/>|>)/g)) {
    const id = Number(attr(m[1], "numFmtId") ?? 0);
    if (BUILTIN_DATES.has(id) || (custom.has(id) && isDateFormat(custom.get(id)!))) out.add(i);
    i++;
  }
  return out;
}

function sharedStrings(zip: Zip): string[] {
  const xml = zip.text("xl/sharedStrings.xml");
  if (!xml) return [];
  const out: string[] = [];
  for (const m of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    // Rich text keeps its runs' text; phonetic hints (rPh) are not part of the value.
    const body = m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
    out.push([...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => xmlText(t[1])).join(""));
  }
  return out;
}

/** Column letters to a zero-based index: A → 0, AA → 26. */
export function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, "").toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** An Excel serial day as an ISO date. */
export function serialDate(serial: number, date1904 = false): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return null;
  // 1900 system: day 1 is 1900-01-01, and Excel counts a 29 February 1900 that never was.
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  return new Date(base + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10);
}

function readSheet(xml: string, strings: string[], dates: Set<number>, date1904: boolean): Cell[][] {
  const rows: Cell[][] = [];
  const data = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(xml)?.[1] ?? "";
  let next = 0;
  for (const rm of data.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    const rAttr = attr(rm[1] ?? rm[3] ?? "", "r");
    const index = rAttr ? Number(rAttr) - 1 : next;
    next = index + 1;
    if (index >= SHEET_ROWS) break;
    const row: Cell[] = [];
    let col = 0;
    for (const cm of (rm[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = cm[1];
      const ref = attr(tag, "r");
      const c = ref ? colIndex(ref) : col;
      col = c + 1;
      const body = cm[2] ?? "";
      const t = attr(tag, "t");
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value: Cell = null;
      if (t === "s") value = v !== undefined ? (strings[Number(v)] ?? null) : null;
      else if (t === "inlineStr") value = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((x) => xmlText(x[1])).join("");
      else if (t === "b") value = v === "1";
      else if (t === "str" || t === "e") value = v !== undefined ? xmlText(v) : null;
      else if (v !== undefined) {
        const n = Number(v);
        const style = Number(attr(tag, "s") ?? -1);
        value = Number.isFinite(n) ? (dates.has(style) ? (serialDate(n, date1904) ?? n) : n) : xmlText(v);
      }
      if (value !== null) row[c] = value;
    }
    for (let k = 0; k < row.length; k++) if (row[k] === undefined) row[k] = null;
    rows[index] = row;
  }
  for (let k = 0; k < rows.length; k++) if (rows[k] === undefined) rows[k] = [];
  return rows;
}

/** The entries a workbook needs. */
export const WORKBOOK_PARTS = (name: string) => name === "xl/workbook.xml" || name === "xl/_rels/workbook.xml.rels" || name === "xl/sharedStrings.xml" || name === "xl/styles.xml" || /^xl\/worksheets\/[^/]+\.xml$/.test(name);

/** Every sheet of a workbook, in tab order. */
export function readWorkbook(zip: Zip): Sheet[] {
  const wb = zip.text("xl/workbook.xml");
  if (!wb) throw new Error("This file isn’t an Excel workbook (.xlsx).");
  const date1904 = /<workbookPr\b[^>]*date1904="(?:1|true)"/.test(wb);
  const rels = zip.text("xl/_rels/workbook.xml.rels") ?? "";
  const target = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1], "Id");
    const t = attr(m[1], "Target");
    if (id && t) target.set(id, t.startsWith("/") ? t.slice(1) : `xl/${t.replace(/^\.\//, "")}`);
  }
  const strings = sharedStrings(zip);
  const dates = dateStyles(zip);
  const out: Sheet[] = [];
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = attr(m[1], "name") ?? `Sheet ${out.length + 1}`;
    const rid = attr(m[1], "r:id");
    const path = rid ? target.get(rid) : undefined;
    const xml = path ? zip.text(path) : null;
    if (xml) out.push({ name, rows: readSheet(xml, strings, dates, date1904) });
  }
  return out;
}

/** Whether bytes look like a ZIP-based Office file. */
export const isZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
