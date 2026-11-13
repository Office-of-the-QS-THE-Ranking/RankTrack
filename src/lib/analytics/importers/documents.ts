/*
 * Word documents the Office already uses: WURI's innovative-programme template (one case per file) and UI
 * GreenMetric's evidence template (one indicator per file, named University_Country_<category>_<number>_…). From the
 * first come the case's name, category and abstract, and what was left blank; from the second the indicator it
 * answers and the figures its description gives, for the Office to confirm.
 */
import type { Case } from "../types";

const lines = (text: string) => text.split("\n").map((l) => l.trim());

/** A template's instruction in brackets, not an answer. */
const isHint = (l: string) => /^\(.*\)$/.test(l) || /^\(.+/.test(l);

/** The answer under a label: the next line that isn't empty or an instruction, unless another label comes first. */
function answerAfter(ls: string[], label: RegExp, stop: RegExp, from = 0): { text: string; at: number } | null {
  const i = ls.findIndex((l, k) => k >= from && label.test(l));
  if (i < 0) return null;
  for (let k = i + 1; k < Math.min(ls.length, i + 12); k++) {
    const l = ls[k];
    if (!l || isHint(l)) continue;
    if (stop.test(l)) return { text: "", at: k };
    return { text: l, at: k };
  }
  return { text: "", at: i };
}

const LABELS = /^(University name|Full name|Relationship|Official title|Email address|Phone number|Program name|Category|Champion|School, College|WURI’s Serial Number|WURI's Serial Number|Summary of Program|Abstract of Program|Details of Program|Program Profile|Writer)/i;

export interface WuriCase {
  title: string;
  category: string;
  abstract: string;
  checks: Case["checks"];
}

export const isWuriTemplate = (text: string) => /TEMPLATE OF UNIVERSITY.S INNOVATIVE PROGRAM/i.test(text);

export function readWuriCase(text: string, categories: string[]): WuriCase {
  const ls = lines(text);
  const writer = answerAfter(ls, /^Full name$/i, LABELS);
  const champStart = ls.findIndex((l) => /^Champion/i.test(l));
  const champion = champStart >= 0 ? answerAfter(ls, /^Full name$/i, LABELS, champStart) : null;
  const champEmail = champStart >= 0 ? answerAfter(ls, /^Email address$/i, LABELS, champStart) : null;
  const title = answerAfter(ls, /^Program name$/i, LABELS)?.text ?? "";
  const catRaw = answerAfter(ls, /^Category$/i, LABELS)?.text ?? "";
  const category = /^([ABC][1-8])\b/i.exec(catRaw)?.[1].toUpperCase() ?? "";
  const absAt = ls.findIndex((l) => /^Abstract of Program/i.test(l));
  const abstractLines: string[] = [];
  if (absAt >= 0)
    for (let k = absAt + 1; k < ls.length; k++) {
      const l = ls[k];
      if (/^Details of Program|^Planning$/i.test(l)) break;
      if (l && !isHint(l)) abstractLines.push(l);
    }
  const abstract = abstractLines.join(" ").replace(/\s+/g, " ").trim();
  const words = abstract ? abstract.split(" ").length : 0;
  return {
    title: title.slice(0, 300),
    category,
    abstract: abstract.slice(0, 4000),
    checks: [
      { label: "Program name given", ok: !!title },
      { label: "Category given", ok: !!category && categories.includes(category) },
      { label: "Abstract within 300 words", ok: words > 0 && words <= 300 },
      { label: "Writer named", ok: !!writer?.text && !LABELS.test(writer.text) },
      { label: "Champion named", ok: !!champion?.text && !LABELS.test(champion.text) },
      { label: "Champion’s email given", ok: !!champEmail?.text && /@/.test(champEmail.text) },
    ],
  };
}

export interface EvidenceDoc {
  /** The questionnaire number it answers (1.5, 2.6), from the file name or the document. */
  code: string | null;
  title: string;
  /** Figures in the description, with the words around them. */
  figures: { value: number; context: string }[];
  links: string[];
}

/** University_Country_1_5_Total_main_campus_area.docx → 1.5 */
export function codeFromFileName(name: string): string | null {
  const m = /University_Country_(\d)_(\d{1,2})_/i.exec(name);
  return m ? `${m[1]}.${Number(m[2])}` : null;
}

export function readEvidenceDoc(text: string, fileName: string): EvidenceDoc {
  const ls = lines(text).filter(Boolean);
  const tag = ls.map((l) => /^\[(\d\.\d{1,2})\]\s*(.+)$/.exec(l)).find(Boolean);
  const code = codeFromFileName(fileName) ?? tag?.[1] ?? null;
  const title = tag?.[2]?.replace(/\s+/g, " ").trim() ?? fileName.replace(/\.docx$/i, "").replace(/_/g, " ");
  const from = Math.max(0, ls.findIndex((l) => /^Description/i.test(l)));
  const figures: EvidenceDoc["figures"] = [];
  for (const l of ls.slice(from)) {
    if (/^Additional evidence link/i.test(l)) break;
    for (const m of l.matchAll(/(?<![\w.])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?![\w.]*\d)/g)) {
      const value = Number(m[1].replace(/,/g, ""));
      if (!Number.isFinite(value) || (value < 1 && !/\./.test(m[1])) || /^(19|20)\d{2}$/.test(m[1])) continue;
      const start = Math.max(0, (m.index ?? 0) - 40);
      figures.push({ value, context: l.slice(start, (m.index ?? 0) + m[1].length + 30).trim() });
      if (figures.length >= 8) break;
    }
    if (figures.length >= 8) break;
  }
  const links = [...text.matchAll(/https?:\/\/[^\s<>"']+/g)].map((m) => m[0]).slice(0, 10);
  return { code, title: title.slice(0, 200), figures, links };
}
