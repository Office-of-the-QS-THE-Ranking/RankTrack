/*
 * The file readers in the Office's browser: workbooks and Word documents are opened here, with the browser's own
 * DecompressionStream, so only what the Hub needs travels to the server. A template's rows never leave this
 * computer: they are counted here and only the counts are sent.
 */
import { readCsv, docxText, docxTables } from "./text";
import { readWorkbook, WORKBOOK_PARTS, type Sheet } from "./xlsx";
import { openZip, type InflateAsync } from "./zip";

const inflate: InflateAsync = async (data, max) => {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw new Error("too large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
};

/** Most a file may be to be opened here. */
export const MAX_FILE_MB = 60;

async function bytesOf(file: File) {
  if (file.size > MAX_FILE_MB * 1_048_576) throw new Error(`${file.name} is larger than ${MAX_FILE_MB} MB.`);
  return new Uint8Array(await file.arrayBuffer());
}

/** The file's SHA-256, to tell later which upload a figure came from. */
export async function fingerprint(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** A workbook's sheets (.xlsx, or .csv as one sheet). */
export async function readSheets(file: File): Promise<Sheet[]> {
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") return readCsv(await file.text());
  const zip = await openZip(await bytesOf(file), inflate, WORKBOOK_PARTS);
  if (!zip.has("xl/workbook.xml")) throw new Error(`${file.name} isn’t an Excel workbook (.xlsx). Save it as .xlsx or .csv.`);
  return readWorkbook(zip);
}

async function documentXml(file: File) {
  const zip = await openZip(await bytesOf(file), inflate, (n) => n === "word/document.xml");
  const xml = zip.text("word/document.xml");
  if (!xml) throw new Error(`${file.name} isn’t a Word document (.docx).`);
  return xml;
}

/** A Word document's text, one paragraph per line. */
export const readDocxText = async (file: File) => docxText(await documentXml(file));

/** A Word document's tables. */
export const readDocxTablesIn = async (file: File) => docxTables(await documentXml(file));

/** Sheets cut down to what may travel to the server: text and numbers, at most `rows` rows each. */
export function portable(sheets: Sheet[], rows = 5000): Sheet[] {
  return sheets.map((s) => ({ name: s.name.slice(0, 120), rows: s.rows.slice(0, rows).map((r) => r.slice(0, 60).map((c) => (typeof c === "string" ? c.slice(0, 2000) : c))) }));
}
