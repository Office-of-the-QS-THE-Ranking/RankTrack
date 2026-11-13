/*
 * Telling when two files say nearly the same thing, without comparing their text: a MinHash of each file's five-word
 * runs. Two signatures agree in about the share of runs the texts have in common, so a report resubmitted under a new
 * title, or by another unit, shows up even after small edits. Plain functions (tests/review.test.ts).
 */
import { isStop, plain, stem } from "./text";

export const SIGNATURE_SIZE = 64;
const SHINGLE = 5;
/** Fewer runs than this and a signature says little. */
const MIN_SHINGLES = 40;

/** FNV-1a, 32 bits. */
function hash(text: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** One hash made into another, differently for each position of the signature. */
function mix(h: number, i: number) {
  let x = (h ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/** A text's signature as 32-bit integers (signed, as Postgres keeps them), or null when it is too short to compare. */
export function signatureOf(text: string): number[] | null {
  const words = plain(text)
    .split(" ")
    .filter((w) => w && !isStop(w) && !/^\d+$/.test(w))
    .map(stem);
  if (words.length < SHINGLE + MIN_SHINGLES) return null;
  const mins = new Array<number>(SIGNATURE_SIZE).fill(0xffffffff);
  for (let i = 0; i + SHINGLE <= words.length; i++) {
    const h = hash(words.slice(i, i + SHINGLE).join(" "));
    for (let k = 0; k < SIGNATURE_SIZE; k++) {
      const v = mix(h, k);
      if (v < mins[k]) mins[k] = v;
    }
  }
  return mins.map((v) => v | 0);
}

/** The share of two texts' runs that are the same, estimated from their signatures: 0 to 1. */
export function similarity(a: readonly number[] | null | undefined, b: readonly number[] | null | undefined) {
  if (!a || !b || a.length !== SIGNATURE_SIZE || b.length !== SIGNATURE_SIZE) return 0;
  let same = 0;
  for (let i = 0; i < SIGNATURE_SIZE; i++) if (a[i] === b[i]) same++;
  return same / SIGNATURE_SIZE;
}

/** At or above this, two files are shown as nearly the same. */
export const SIMILAR_AT = 0.6;
