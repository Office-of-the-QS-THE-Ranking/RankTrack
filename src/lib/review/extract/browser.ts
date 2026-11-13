/*
 * Reading an evidence file in the reviewer's browser, so the file itself goes nowhere and only its text reaches the
 * Hub. A PDF's own text is taken first; a page with none is a scan, which is drawn and read by OCR (Tesseract, English
 * and Filipino). Word documents, slides, sheets and text files are opened with the readers the importers already use.
 * pdf.js and Tesseract run from /ocr (scripts/ocr-assets.mjs), never from another site. See docs/evidence-review.md.
 */
import { inflate, readSheets } from "@/lib/analytics/tabular/browser";
import { cellText, docxText } from "@/lib/analytics/tabular/text";
import { openZip, xmlText } from "@/lib/analytics/tabular/zip";
import { readerOf, UNIT_OF } from "../files";
import { READ_LIMITS, type PageText, type PageUnit } from "../types";

const OCR = "/ocr";

export interface ReadProgress {
  /** Opening the file, taking its text, reading scans by OCR. */
  phase: "open" | "text" | "ocr";
  done: number;
  total: number;
}

export interface ReadResult {
  unit: PageUnit;
  pages: PageText[];
  /** The file had more pages than are read. */
  truncated: boolean;
}

/** A failure with words for the person: a locked PDF, a damaged file, a browser that can't run the reader. */
export class ReadError extends Error {}

const stopped = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
};

/** Text with no pages of its own, cut into parts of a page's length at line breaks. */
function parts(text: string, size = 3000): string[] {
  const out: string[] = [];
  let current = "";
  const close = () => {
    if (current.trim()) out.push(current);
    current = "";
  };
  for (const line of text.replace(/\r/g, "").split("\n")) {
    if (current.length + line.length + 1 > size) close();
    // One line longer than a part (a table row pasted as text) is cut as it is.
    let rest = line;
    for (; rest.length > size; rest = rest.slice(size)) out.push(rest.slice(0, size));
    current = current ? `${current}\n${rest}` : rest;
  }
  if (current.trim()) out.push(current);
  return out;
}

const asPages = (texts: string[], ocr = false): { pages: PageText[]; truncated: boolean } => ({
  pages: texts.slice(0, READ_LIMITS.pages).map((text, i) => ({ n: i + 1, text: text.slice(0, READ_LIMITS.pageChars), ocr })),
  truncated: texts.length > READ_LIMITS.pages,
});

/* ---------- OCR ---------- */

type OcrWorker = { recognize: (image: Blob) => Promise<{ data: { text: string } }>; terminate: () => Promise<unknown> };

/** A few Tesseract workers, each with English and Filipino. More than three gains little and costs memory. */
async function ocrWorkers(jobs: number): Promise<OcrWorker[]> {
  const { createWorker } = await import("tesseract.js");
  const cores = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
  const count = Math.max(1, Math.min(3, Math.floor(cores / 2), jobs));
  try {
    return await Promise.all(
      Array.from({ length: count }, () => createWorker(["eng", "fil"], 1, { workerPath: `${OCR}/worker.min.js`, corePath: OCR, langPath: `${OCR}/lang`, workerBlobURL: false, gzip: true }) as unknown as Promise<OcrWorker>),
    );
  } catch {
    throw new ReadError("The text reader for scans couldn’t start in this tab. Reload the page and try again.");
  }
}

/**
 * Images read by OCR, a few at a time. `next` hands over one image at a time (a drawn page), so only as many are
 * held as there are workers.
 */
async function ocrAll(total: number, next: (i: number) => Promise<Blob | null>, onDone: (done: number) => void, signal?: AbortSignal): Promise<string[]> {
  const texts = new Array<string>(total).fill("");
  if (!total) return texts;
  const workers = await ocrWorkers(total);
  let done = 0;
  try {
    const free = [...workers];
    const running = new Set<Promise<void>>();
    for (let i = 0; i < total; i++) {
      stopped(signal);
      const image = await next(i);
      if (!image) {
        onDone(++done);
        continue;
      }
      while (!free.length) await Promise.race(running);
      const worker = free.pop()!;
      const job = worker
        .recognize(image)
        .then((r) => {
          texts[i] = r.data.text ?? "";
        })
        .catch(() => {
          // A page that can't be read is left empty rather than stopping the file.
        })
        .finally(() => {
          free.push(worker);
          running.delete(job);
          onDone(++done);
        });
      running.add(job);
    }
    await Promise.all(running);
    stopped(signal);
  } finally {
    await Promise.all(workers.map((w) => w.terminate().catch(() => {})));
  }
  return texts;
}

const toBlob = (canvas: HTMLCanvasElement) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));

/* ---------- PDF ---------- */

/** How wide a scanned page is drawn for OCR: about 200 dpi on A4, which Tesseract reads well. */
const OCR_WIDTH = 1700;

async function readPdf(data: ArrayBuffer, onProgress: (p: ReadProgress) => void, signal?: AbortSignal): Promise<{ pages: PageText[]; truncated: boolean }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = `${OCR}/pdf.worker.min.mjs`;
  const task = pdfjs.getDocument({
    data,
    cMapUrl: `${OCR}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${OCR}/standard_fonts/`,
    wasmUrl: `${OCR}/wasm/`,
    iccUrl: `${OCR}/iccs/`,
    disableWorkerRendering: true,
    verbosity: 0,
  });
  let doc: Awaited<typeof task.promise>;
  try {
    doc = await task.promise;
  } catch (e) {
    const name = (e as { name?: string })?.name;
    throw new ReadError(name === "PasswordException" ? "This PDF is locked with a password." : "This PDF couldn’t be opened. It may be damaged.");
  }
  try {
    const total = Math.min(doc.numPages, READ_LIMITS.pages);
    const pages: PageText[] = [];
    const scans: number[] = [];
    for (let n = 1; n <= total; n++) {
      stopped(signal);
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += item.str;
        if (item.hasEOL) text += "\n";
      }
      page.cleanup();
      if (text.replace(/\s/g, "").length < READ_LIMITS.scanBelow) scans.push(n);
      pages.push({ n, text, ocr: false });
      onProgress({ phase: "text", done: n, total });
    }

    if (scans.length) {
      onProgress({ phase: "ocr", done: 0, total: scans.length });
      const canvas = document.createElement("canvas");
      const texts = await ocrAll(
        scans.length,
        async (i) => {
          const page = await doc.getPage(scans[i]);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(3, OCR_WIDTH / Math.max(1, base.width)) });
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvas, viewport, background: "#ffffff" }).promise;
          page.cleanup();
          return toBlob(canvas);
        },
        (done) => onProgress({ phase: "ocr", done, total: scans.length }),
        signal,
      );
      canvas.width = canvas.height = 0;
      scans.forEach((n, i) => {
        const text = texts[i].trim();
        // Whatever little text the page had of its own (a stamp, a page number) stays if OCR found less.
        if (text.length > pages[n - 1].text.trim().length) pages[n - 1] = { n, text, ocr: true };
      });
    }
    return { pages: pages.map((p) => ({ ...p, text: p.text.slice(0, READ_LIMITS.pageChars) })), truncated: doc.numPages > total };
  } finally {
    await task.destroy().catch(() => {});
  }
}

/* ---------- Other files ---------- */

async function readDocx(bytes: Uint8Array) {
  const zip = await openZip(bytes, inflate, (n) => n === "word/document.xml");
  const xml = zip.text("word/document.xml");
  if (!xml) throw new ReadError("This isn’t a Word document (.docx).");
  return asPages(parts(docxText(xml)));
}

async function readPptx(bytes: Uint8Array) {
  const slide = /^ppt\/slides\/slide(\d+)\.xml$/;
  const zip = await openZip(bytes, inflate, (n) => slide.test(n));
  const names = zip.names.filter((n) => slide.test(n)).sort((a, b) => Number(slide.exec(a)![1]) - Number(slide.exec(b)![1]));
  if (!names.length) throw new ReadError("This isn’t a PowerPoint file (.pptx).");
  const texts = names.map((n) =>
    [...(zip.text(n) ?? "").matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)]
      .map((p) => [...p[1].matchAll(/<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g)].map((t) => xmlText(t[1])).join(""))
      .filter((line) => line.trim())
      .join("\n"),
  );
  return asPages(texts);
}

async function readSheet(blob: Blob, name: string) {
  const sheets = await readSheets(new File([blob], name, { type: blob.type }));
  const texts: string[] = [];
  for (const s of sheets) {
    const lines = s.rows.map((r) => r.map(cellText).filter(Boolean).join(" | ")).filter(Boolean);
    if (lines.length) texts.push(...parts(`Sheet: ${s.name}\n${lines.join("\n")}`));
  }
  return asPages(texts);
}

async function readImage(blob: Blob, onProgress: (p: ReadProgress) => void, signal?: AbortSignal) {
  onProgress({ phase: "ocr", done: 0, total: 1 });
  const [text] = await ocrAll(1, async () => blob, (done) => onProgress({ phase: "ocr", done, total: 1 }), signal);
  return { pages: [{ n: 1, text: text.trim().slice(0, READ_LIMITS.pageChars), ocr: true }], truncated: false };
}

/**
 * An evidence file as pages of text. `src` is its /media address: the browser fetches it with the reviewer's own
 * session, which is what decides whether they may have it.
 */
export async function readEvidenceFile(src: string, name: string, onProgress: (p: ReadProgress) => void, signal?: AbortSignal): Promise<ReadResult> {
  const reader = readerOf(name);
  if (!reader) throw new ReadError("This type of file can’t be read here.");
  onProgress({ phase: "open", done: 0, total: 1 });
  const res = await fetch(src, { credentials: "same-origin", cache: "no-store", signal });
  if (!res.ok) throw new ReadError(res.status === 404 ? "This file is no longer available to you." : "The file couldn’t be downloaded. Try again in a moment.");
  const blob = await res.blob();
  if (blob.size > READ_LIMITS.fileMB * 1_048_576) throw new ReadError(`Files over ${READ_LIMITS.fileMB} MB can’t be read here.`);
  stopped(signal);
  try {
    const read =
      reader === "pdf"
        ? await readPdf(await blob.arrayBuffer(), onProgress, signal)
        : reader === "image"
          ? await readImage(blob, onProgress, signal)
          : reader === "docx"
            ? await readDocx(new Uint8Array(await blob.arrayBuffer()))
            : reader === "pptx"
              ? await readPptx(new Uint8Array(await blob.arrayBuffer()))
              : reader === "sheet"
                ? await readSheet(blob, name)
                : asPages(parts(await blob.text()));
    return { unit: UNIT_OF[reader], ...read };
  } catch (e) {
    if (e instanceof ReadError || (e as { name?: string })?.name === "AbortError") throw e;
    console.error(e);
    throw new ReadError("This file couldn’t be read. It may be damaged.");
  }
}

/** Pages in batches small enough for one call each. */
export function batches(pages: PageText[]): PageText[][] {
  const out: PageText[][] = [];
  let current: PageText[] = [];
  let size = 0;
  for (const p of pages) {
    if (current.length && size + p.text.length > READ_LIMITS.batchChars) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(p);
    size += p.text.length;
  }
  if (current.length || !out.length) out.push(current);
  return out;
}
