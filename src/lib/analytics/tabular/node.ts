/*
 * The file readers with Node's zlib: for the server, the builder scripts and tests. Never import this from a client
 * component (browser.ts is the browser's).
 */
import { inflateRawSync } from "node:zlib";
import { docxTables, docxText } from "./text";
import { readWorkbook, type Sheet } from "./xlsx";
import { readZip, type InflateSync } from "./zip";

const inflate: InflateSync = (data, max) => inflateRawSync(data, { maxOutputLength: max });

/** Every sheet of an Excel workbook (.xlsx), in tab order. */
export function readXlsx(input: Uint8Array): Sheet[] {
  const zip = readZip(input, inflate);
  if (!zip.has("xl/workbook.xml")) throw new Error("This file isn’t an Excel workbook (.xlsx).");
  return readWorkbook(zip);
}

function documentXml(input: Uint8Array) {
  const xml = readZip(input, inflate).text("word/document.xml");
  if (!xml) throw new Error("This file isn’t a Word document (.docx).");
  return xml;
}

/** The text of a Word document (.docx), one paragraph per line. */
export const readDocx = (input: Uint8Array) => docxText(documentXml(input));

/** A Word document's tables: rows of cells, each cell its paragraphs. */
export const readDocxTables = (input: Uint8Array) => docxTables(documentXml(input));
