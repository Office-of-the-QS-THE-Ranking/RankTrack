/*
 * Plain text from Word documents (DOCX) and rows from CSV files, both held in memory. DOCX paragraphs become lines;
 * table cells become lines too, so a two-column template ("Program name" | the answer) reads as label then value.
 */
import { xmlText } from "./zip";
import type { Cell, Sheet } from "./xlsx";

/** The text of a Word document's word/document.xml, one paragraph per line. */
export function docxText(xml: string): string {
  const body = /<w:body\b[^>]*>([\s\S]*)<\/w:body>/.exec(xml)?.[1] ?? xml;
  const lines: string[] = [];
  for (const p of body.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>|<w:p\b[^>]*\/>/g)) {
    const inner = (p[1] ?? "").replace(/<w:tab\b[^>]*\/>/g, "\t").replace(/<w:br\b[^>]*\/>/g, "\n");
    const text = [...inner.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>|(\t)|(\n)/g)].map((m) => (m[1] !== undefined ? xmlText(m[1]) : m[2] ?? m[3] ?? "")).join("");
    lines.push(text.replace(/[  ]+/g, " ").trimEnd());
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const paragraphText = (xml: string) =>
  [...xml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g)]
    .map((p) => [...p[1].matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((t) => xmlText(t[1])).join("").replace(/[  ]+/g, " ").trim())
    .filter(Boolean);

/** A Word document's tables: each a list of rows, each row a list of cells, each cell its paragraphs. */
export function docxTables(xml: string): string[][][][] {
  const tables: string[][][][] = [];
  // Nested tables are rare in these templates; the outer table's cells keep their text.
  for (const t of xml.matchAll(/<w:tbl>([\s\S]*?)<\/w:tbl>/g)) {
    const rows = [...t[1].matchAll(/<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g)].map((r) => [...r[1].matchAll(/<w:tc>([\s\S]*?)<\/w:tc>/g)].map((c) => paragraphText(c[1])));
    tables.push(rows);
  }
  return tables;
}

/** Rows of a CSV (or semicolon- or tab-separated) file, quotes and embedded line breaks honoured. */
export function readCsv(text: string): Sheet[] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.indexOf("\n") >= 0 ? src.indexOf("\n") : src.length);
  const delim = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = "";
  let quoted = false;
  let wasQuoted = false;
  const push = () => {
    const f = wasQuoted ? field : field.trim();
    row.push(f === "" ? null : !wasQuoted && /^-?\d+(?:\.\d+)?$/.test(f) ? Number(f) : f);
    field = "";
    wasQuoted = false;
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field.trim() === "") {
      quoted = true;
      wasQuoted = true;
      field = "";
    } else if (c === delim) push();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      push();
      rows.push(row);
      row = [];
    } else field += c;
    if (rows.length > 200_000) break;
  }
  if (field !== "" || row.length) {
    push();
    rows.push(row);
  }
  return [{ name: "CSV", rows }];
}

/** A cell as trimmed text ("" for empty). */
export const cellText = (c: Cell | undefined): string => (c === null || c === undefined ? "" : typeof c === "string" ? c.trim() : String(c));

/** A header for matching: lowercase letters and digits, single spaces. */
export const headerKey = (s: string) =>
  s
    .toLowerCase()
    .replace(/\([^)]*\)/g, (m) => ` ${m.slice(1, -1)} `)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * The first row (within the top 30) that holds every wanted header, and where each one is. `wanted` are header
 * texts; a header matches when its key equals the wanted key or starts with it.
 */
export function findHeader(rows: Cell[][], wanted: string[]): { row: number; cols: Record<string, number> } | null {
  const keys = wanted.map(headerKey);
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const cells = (rows[r] ?? []).map((c) => headerKey(cellText(c)));
    const cols: Record<string, number> = {};
    keys.forEach((k, i) => {
      const at = cells.findIndex((c) => c === k);
      const loose = at >= 0 ? at : cells.findIndex((c) => !!c && (c.startsWith(k) || k.startsWith(c)) && Math.min(c.length, k.length) >= 3);
      if (loose >= 0) cols[wanted[i]] = loose;
    });
    if (Object.keys(cols).length === wanted.length) return { row: r, cols };
  }
  return null;
}
