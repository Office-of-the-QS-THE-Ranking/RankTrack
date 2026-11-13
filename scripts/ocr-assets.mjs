/*
 * Copies what the evidence reader runs in the reviewer's browser into public/ocr, so nothing is fetched from another
 * site (the Content Security Policy wouldn't allow it): pdf.js's worker, character maps, fonts and decoders, and
 * Tesseract's worker, engine and language data (English and Filipino). Runs after every `npm install`, and the folder
 * is not kept in git. See docs/evidence-review.md.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mods = path.join(root, "node_modules");
const out = path.join(root, "public", "ocr");

const FILES = [
  ["pdfjs-dist/legacy/build/pdf.worker.min.mjs", "pdf.worker.min.mjs"],
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "tesseract-core-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"],
  ["@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz", "lang/eng.traineddata.gz"],
  ["@tesseract.js-data/fil/4.0.0_best_int/fil.traineddata.gz", "lang/fil.traineddata.gz"],
];
const FOLDERS = [
  ["pdfjs-dist/cmaps", "cmaps"],
  ["pdfjs-dist/standard_fonts", "standard_fonts"],
  ["pdfjs-dist/wasm", "wasm"],
  ["pdfjs-dist/iccs", "iccs"],
];

const missing = [...FILES, ...FOLDERS].map(([from]) => from).filter((from) => !existsSync(path.join(mods, from)));
if (missing.length) {
  // A partial install (--omit, --ignore-scripts later run by hand): say what's absent and leave the folder alone.
  console.warn(`ocr-assets: not copied, missing ${missing.join(", ")}`);
  process.exit(0);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, "lang"), { recursive: true });
for (const [from, to] of FILES) cpSync(path.join(mods, from), path.join(out, to));
for (const [from, to] of FOLDERS) cpSync(path.join(mods, from), path.join(out, to), { recursive: true });
console.log(`ocr-assets: copied to ${path.relative(root, out)}`);
