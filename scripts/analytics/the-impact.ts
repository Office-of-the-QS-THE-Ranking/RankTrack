/*
 * THE Sustainability Impact Ratings, built from two of the Office's files: the question catalog (the "summary" sheet
 * of the data-collection workbook: each question's code, wording, format, and whether evidence and policy dates are
 * required) and the methodology's text (each metric's weight in its SDG, each question's share, and the points each
 * option earns for "existence"). Research metrics, which THE measures itself from Scopus, are kept as external
 * indicators so every SDG adds up to 100.
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { readXlsx } from "../../src/lib/analytics/tabular/node";
import { cellText } from "../../src/lib/analytics/tabular/text";
import type { CatalogIndicator, Choice, Group, InputSpec, MethodologyPack, ScoreRule } from "../../src/lib/analytics/types";
import { indicatorDefaults, ownersOf } from "./shared";

export const SDG_NAMES = [
  "No Poverty",
  "Zero Hunger",
  "Good Health and Well-being",
  "Quality Education",
  "Gender Equality",
  "Clean Water and Sanitation",
  "Affordable and Clean Energy",
  "Decent Work and Economic Growth",
  "Industry, Innovation and Infrastructure",
  "Reduced Inequalities",
  "Sustainable Cities and Communities",
  "Responsible Consumption and Production",
  "Climate Action",
  "Life Below Water",
  "Life on Land",
  "Peace, Justice and Strong Institutions",
  "Partnerships for the Goals",
];

/** The methodology's text, from a .txt file or (with pypdf installed) straight from the PDF. */
export function methodologyText(path: string): string {
  if (!/\.pdf$/i.test(path)) return readFileSync(path, "utf8");
  const r = spawnSync("python3", ["-I", "-c", "import sys,pypdf; r=pypdf.PdfReader(sys.argv[1]); print('\\n'.join((p.extract_text() or '') for p in r.pages))", path], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`Couldn’t read the PDF (needs python3 with pypdf): ${r.stderr}`);
  return r.stdout;
}

interface Weights {
  metric: Map<string, { name: string; weight?: number; points?: number; shares: number[] }>;
  indicator: Map<string, { name: string; weight?: number; text: string }>;
}

const WORD: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, half: 0.5 };
const numberWord = (s: string) => WORD[s.toLowerCase()] ?? Number(s);

/** Each metric's weight in its SDG, the per-question shares printed under it, and each question's own text. */
export function readWeights(text: string): Weights {
  const lines = text.split("\n").map((l) => l.trim());
  const metric: Weights["metric"] = new Map();
  const indicator: Weights["indicator"] = new Map();
  let m: string | null = null;
  let ind: string | null = null;
  const NOT = /(International Standard|World Health|LEED LEED|Organisation for|^\d+\.\d+ International$|Ausable|Useful information|Year$|Language$|Subsidiary|Reporting)/;
  // A heading may hold its code and name on one line, or the code alone with the name on the next.
  // A long heading wraps: "5.3.4 Women’s application in underrepresented" then "subjects".
  const withTail = (k: number, text: string) => {
    const next = (lines[k + 1] ?? "").trim();
    return /^[a-z(]/.test(next) && !/^to$/i.test(next) ? `${text.trim()} ${next}` : text;
  };
  const nameAfter = (i: number) => {
    for (let k = i + 1; k < Math.min(lines.length, i + 4); k++) if (lines[k] && !/^to$/i.test(lines[k]) && !/^\d{1,2}\.\d{1,2}/.test(lines[k])) return withTail(k, lines[k]);
    return "";
  };
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i];
    const alone = /^(\d{1,2}\.\d{1,2}(?:\.\d{1,2})?)$/.exec(s);
    const head = /^(\d{1,2}\.\d{1,2}\.\d{1,2})\s+(.*)$/.exec(s);
    const im = head ? [s, head[1], withTail(i, head[2])] : alone && alone[1].split(".").length === 3 ? [s, alone[1], nameAfter(i)] : null;
    const mm = /^(\d{1,2}\.\d{1,2})\s+([A-Z].*)$/.exec(s) ?? (alone && alone[1].split(".").length === 2 && /^[A-Z]/.test(nameAfter(i)) ? [s, alone[1], nameAfter(i)] : null);
    if (im && Number(im[1].split(".")[0]) <= 17) {
      ind = im[1];
      if (!indicator.has(ind)) indicator.set(ind, { name: im[2].replace(/^Indicator:\s*/i, "").replace(/\s+/g, " ").replace(/[\s.]+$/, ""), text: "" });
      continue;
    }
    if (mm && Number(mm[1].split(".")[0]) <= 17 && !NOT.test(s)) {
      m = mm[1];
      ind = null;
      if (!metric.has(m)) metric.set(m, { name: mm[2].trim(), shares: [] });
      continue;
    }
    if (ind) {
      const rec = indicator.get(ind)!;
      if (rec.text.length < 3000) rec.text += ` ${s}`;
    }
    const joined = lines.slice(i, i + 3).join(" ");
    const w = /(?:worth (?:up to )?)?([\d.]+)%\s*of the score in this\s*SDG/.exec(joined);
    if (w && (s.includes("worth") || s.includes(`${w[1]}%`))) {
      const value = Number(w[1]);
      if (ind && /^\d+\.1\.\d+$/.test(ind) && !indicator.get(ind)!.weight) indicator.get(ind)!.weight = value;
      else if (ind && /^9\.2\.1$/.test(ind) && !indicator.get(ind)!.weight) indicator.get(ind)!.weight = value;
      else if (m && metric.get(m)!.weight === undefined) metric.get(m)!.weight = value;
    }
    const p = /total of (\d+) points/.exec(s);
    if (p && m && metric.get(m)!.points === undefined) metric.get(m)!.points = Number(p[1]);
    const q = /^([\d.]+)% in\s*$|^([\d.]+)% in SDG/.exec(s);
    if (q && m) metric.get(m)!.shares.push(Number(q[1] ?? q[2]));
  }
  return { metric, indicator };
}

/** The methodology's running page header and per-question share lines, which split sentences across pages. */
const NOISE = new RegExp(`THE SUSTAINABILITY IMPACT RATINGS METHODOLOGY 2026\\s*\\|\\s*\\d+\\s*SDG\\s*\\d+\\s*(?:${SDG_NAMES.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")).join("|")})|[\\d.,]+%\\s*in\\s*SDG\\s*\\([\\d.,]+%\\s*Overall\\)`, "gi");

/**
 * Existence points from the first bullet under "Up to three points based on:". "maximum one point for free, only 0.25
 * points for subsidised": the best option counts. "0.4 points for A, 0.4 points for B, 0.2 for C", or anything with
 * "for both": the options add up. "0.25 points for each level": a share per option picked.
 */
export function existenceOf(text: string, options: Choice[]): { yes?: number; shares?: Record<string, number>; sum?: boolean; each?: number; cap?: number } {
  // Bullets followed by a lowercase word continue a sentence broken across lines; real bullets start a capital.
  const clean = text.replace(NOISE, " ").replace(/\s*•\s*(?=[a-z])/g, " ").replace(/\s+/g, " ");
  const first = /points? based on:\s*•\s*([^•]*)/i.exec(clean)?.[1] ?? /Existence[^•]*/i.exec(clean)?.[0] ?? "";
  const ex = first.replace(/^[^–-]*[–-]\s*/, "");
  const each = /(one|\d*\.\d+|\d+)\s*(?:points?\s*)?for\s*each/i.exec(ex);
  if (each) return { each: numberWord(each[1]), cap: 1 };
  // "one point for all three collaborations, 0.66 points for two … 0.33 points for one": a share per option picked.
  if (/for all (?:three|3)\b/i.test(ex) && /for (?:two|2)\b/i.test(ex) && /for (?:one|1)\b/i.test(ex)) return { each: 0.3334, cap: 1 };
  const parts = [...ex.matchAll(/(?:maximum\s+(?:of\s+)?)?(one|half|\d*\.\d+|\d+)\s*(?:points?\s*)?(?:only\s+)?(?:for|if)\s+([^,;]+?)(?=,|;|\.|$|\s+(?:and\s+)?(?:only\s+)?(?:one|half|\d*\.\d+|\d+)\s*(?:points?\s*)?(?:only\s+)?for\b)/gi)].map((m) => ({ value: numberWord(m[1]), said: m[2].trim() }));
  if (!parts.length || !options.length) return { yes: 1 };
  const STOP = new Set(["only", "access", "with", "both", "options", "point", "points", "for", "and", "the", "all"]);
  const words = (s: string) => s.toLowerCase().replace(/-/g, "").replace(/[^a-z ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
  const bothOption = options.some((o) => /\bboth\b/i.test(o.label));
  // "maximum one point for provision, 0.4 for mentoring, 0.4 for scholarships, 0.2 for other": the first part is the
  // whole, the rest add up to it.
  const rest = parts.slice(1).reduce((t, p) => t + p.value, 0);
  const wholeFirst = parts.length > 2 && /maximum/i.test(ex) && Math.abs(rest - parts[0].value) < 0.02 && words(parts[0].said).length <= 1;
  const usable = parts.filter((p, k) => !(wholeFirst && k === 0) && (bothOption || !/^both\b/i.test(p.said)));
  const shares: Record<string, number> = {};
  const left: typeof usable = [];
  for (const p of usable) {
    const said = words(p.said);
    const best = options
      .filter((o) => !(o.key in shares))
      .map((o) => ({ o, hits: words(o.label).filter((w) => said.includes(w)).length }))
      .sort((a, b) => b.hits - a.hits)[0];
    if (best && best.hits > 0) shares[best.o.key] = p.value;
    else left.push(p);
  }
  // Whatever the words didn't place goes to the options still open, in order.
  const open = options.filter((o) => !(o.key in shares));
  left.forEach((p, k) => {
    if (open[k]) shares[open[k].key] = p.value;
  });
  if (!Object.keys(shares).length) return { yes: 1 };
  for (const o of options) if (!(o.key in shares)) shares[o.key] = Math.min(...Object.values(shares));
  // Components add up to the whole point (0.4 + 0.4 + 0.2); levels add up to more (1, 0.5, 0.25), and the best counts.
  const additive = usable.reduce((t, p) => t + p.value, 0) <= 1.02;
  return additive ? { shares, sum: true, cap: 1 } : { shares };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "option";

/** Options from a catalog question's bullets: "… •Free •Subsidised" or "●overall report ●separate report". */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Where `name` ends in `text`, matching letters and digits only (spaces and punctuation may differ); -1 if it doesn't start the text. */
function endOf(text: string, name: string) {
  const want = squash(name);
  if (!want || !squash(text).startsWith(want)) return -1;
  let left = want.length;
  let i = 0;
  while (i < text.length && left > 0) if (/[a-z0-9]/i.test(text[i++])) left--;
  // Closing punctuation that belongs to the name: "(lifelong learning)", "students’".
  while (i < text.length && /[)\]’'".]/.test(text[i])) i++;
  return i;
}

/** Two names for one indicator, one abbreviated: "Policy of non-discrimination vs women" and "… against women". */
function sameEnds(a: string, b: string) {
  const words = (x: string) => x.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const [x, y] = [words(a), words(b)];
  return x.length > 1 && y.length > 1 && x[0] === y[0] && x[x.length - 1] === y[y.length - 1];
}

/** A workbook row's title and its ask, split where the ask begins: "… planning redevelopment Work with local authorities …". */
function splitAsk(text: string): [string, string] {
  const m = /[a-z0-9)’'\].]\s+(?=[A-Z][a-z])/.exec(text);
  return m ? [text.slice(0, m.index + 1).trim(), text.slice(m.index + m[0].length).trim()] : [text.trim(), ""];
}

function bulletsOf(text: string): { title: string; options: Choice[] } {
  const parts = text.split(/\s*[•●]\s*/).map((s) => s.trim()).filter(Boolean);
  const title = parts.shift() ?? text;
  const seen = new Set<string>();
  const options = parts.map((label) => {
    let key = slug(label);
    while (seen.has(key)) key = `${key}-2`;
    seen.add(key);
    return { key, label: label.replace(/\s+/g, " ") };
  });
  return { title, options };
}

/** Which numeric input is the denominator of a proportion. */
const DENOMINATOR = /^(number of students$|number of students starting a degree$|number of women starting a degree$|number of graduates$|number of graduates: total$|number of senior academic staff$|number of employees$|campus population$|university floor space$|university expenditure$|total energy used$|amount of waste generated$)/i;
const LOWER_BETTER = new Set(["2.2.2", "6.2.2", "7.3.1"]);

/** Who keeps a figure, from what it counts. */
function figureOwners(label: string) {
  if (/disabilit/i.test(label)) return ownersOf(/employee/i.test(label) ? "Human Resources Department / Health Service" : "Office of the Registrar / Health Service");
  if (/international students/i.test(label)) return ownersOf("Office of the Registrar / International Relations");
  if (/work placement/i.test(label)) return ownersOf("Office of the Registrar / Academic Affairs");
  if (/student|graduate|degree/i.test(label)) return ownersOf("Office of the Registrar");
  if (/employee|staff|contract/i.test(label)) return ownersOf("Human Resources Department");
  if (/expenditure/i.test(label)) return ownersOf("Finance Office");
  if (/research income/i.test(label)) return ownersOf("Office of Research and Innovation");
  if (/spin.?off/i.test(label)) return ownersOf("TOMASInno Center / Office of Research and Innovation");
  if (/energy|floor space|water|waste|food|population/i.test(label)) return ownersOf("Facilities Management Office");
  return ownersOf("");
}

interface Row {
  sdg: number;
  ref: string;
  text: string;
  format: string;
  evidence: boolean;
  policy: boolean;
}

function catalogRows(workbook: string): Row[] {
  const sheets = readXlsx(new Uint8Array(readFileSync(workbook)));
  const sheet = sheets.find((s) => s.name.trim().toLowerCase() === "summary");
  if (!sheet) throw new Error("The workbook has no summary sheet (the question catalog).");
  const rows: Row[] = [];
  let sdg = 0;
  for (const r of sheet.rows.slice(1)) {
    const ref = cellText(r[0]).replace(/\s+/g, "");
    const text = cellText(r[1]).replace(/\s+/g, " ");
    const heading = /^SDG\s*(\d+)/i.exec(text);
    if (!ref && heading) {
      sdg = Number(heading[1]);
      continue;
    }
    if (!ref && !text) continue;
    rows.push({ sdg, ref, text, format: cellText(r[2]), evidence: /^yes/i.test(cellText(r[3])), policy: /^yes/i.test(cellText(r[4])) });
  }
  return rows;
}

export function theImpact2026(workbook: string, methodology: string): { pack: MethodologyPack; report: string[] } {
  const weights = readWeights(methodologyText(methodology));
  const rows = catalogRows(workbook);
  const report: string[] = [];
  const groups: Group[] = SDG_NAMES.map((name, i) => ({ code: `SDG${i + 1}`, position: i + 1, name, points: 100, weight: i === 16 ? 0.22 : 0.26, mandatory: i === 16 }));
  const indicators: CatalogIndicator[] = [];
  const push = (x: Omit<CatalogIndicator, "position">) => indicators.push({ ...x, position: indicators.length + 1 });
  const base = indicatorDefaults();

  for (let sdg = 1; sdg <= 17; sdg++) {
    const group = `SDG${sdg}`;
    // Research metrics: measured by THE from Scopus, never asked of the University.
    for (const [code, w] of [...weights.indicator.entries()].filter(([c, v]) => (c.startsWith(`${sdg}.1.`) || c === "9.2.1") && Number(c.split(".")[0]) === sdg && v.weight)) {
      push({ ...base, code, group, parent: `${sdg}.1`, name: w.name, input: { type: "result" }, score: { kind: "external", points: w.weight! }, tags: ["research"], ownerLabels: ["Times Higher Education (Scopus)"] });
    }
    const mine = rows.filter((r) => r.sdg === sdg);
    // Metrics in order, each with its questions and the figures under them.
    const metrics = new Map<string, Row[]>();
    let current: string | null = null;
    let lastIndicator: Row | null = null;
    const children = new Map<string, Row[]>();
    for (const r of mine) {
      if (/^\d+\.\d+$/.test(r.ref)) {
        current = r.ref;
        metrics.set(current, []);
        lastIndicator = null;
        continue;
      }
      if (/^\d+\.\d+\.\d+$/.test(r.ref)) {
        const m = r.ref.split(".").slice(0, 2).join(".");
        if (!metrics.has(m)) metrics.set(m, []);
        metrics.get(m)!.push(r);
        lastIndicator = r;
        current = m;
        continue;
      }
      // A row without a code: a figure under the last question (or a question of its own, like "Achieve by").
      if (!r.ref && lastIndicator) children.set(lastIndicator.ref, [...(children.get(lastIndicator.ref) ?? []), r]);
      else if (!r.ref && current) {
        const fake = { ...r, ref: `${current}.1` };
        metrics.get(current)!.push(fake);
        lastIndicator = fake;
      }
    }
    // A metric whose weight the text doesn't state takes what the others leave of the SDG's 100%.
    const research = [...weights.indicator.entries()].filter(([c, v]) => Number(c.split(".")[0]) === sdg && (c.startsWith(`${sdg}.1.`) || c === "9.2.1") && v.weight).reduce((s, [, v]) => s + v.weight!, 0);
    const stated = [...metrics.keys()].map((m) => weights.metric.get(m)?.weight).filter((w): w is number => !!w);
    const missing = [...metrics.keys()].filter((m) => !weights.metric.get(m)?.weight);
    const remainder = missing.length === 1 ? Math.round((100 - research - stated.reduce((s, w) => s + w, 0)) * 100) / 100 : 0;
    for (const [m, list] of metrics) {
      const mw = weights.metric.get(m);
      const weight = mw?.weight ?? (missing.length === 1 && remainder > 0 ? remainder : undefined);
      if (!mw?.weight && weight) report.push(`${m}: weight not stated; takes the remaining ${weight}% of SDG ${sdg}.`);
      if (!weight) report.push(`${m}: no weight found in the methodology; its questions are unscored.`);
      const shares = mw?.shares ?? [];
      // Questions printed as a run (17.3.1 to 17.3.17) share the first one's format.
      let inherited = "";
      for (const r of list) {
        if (r.format) inherited = r.format;
        else if (inherited && !children.get(r.ref)?.length) r.format = inherited;
      }
      // Questions THE says it won't score this year stay in the catalog, unscored.
      const unscoredText = /will not score|not be scored|we will not score/i;
      const scorable = list.filter((r) => (r.format || children.get(r.ref)?.length) && !unscoredText.test(r.text));
      for (const r of list.filter((x) => unscoredText.test(x.text))) {
        const { title, options } = bulletsOf(r.text);
        push({ ...base, code: r.ref, group, parent: m, name: title.slice(0, 200), input: options.length ? { type: "picks", options } : { type: "yesno" }, evidence: r.evidence ? { required: true } : {}, tags: ["not-scored"], ownerLabels: ["Every unit (SDG narrative report)"] });
      }
      const shareOf = (k: number) => {
        if (!weight) return 0;
        if (shares.length === scorable.length && shares.every((s) => s > 0)) return shares[k];
        // A proportion and its tracking question split the metric; evidence questions share it equally.
        return Math.round((weight / Math.max(1, scorable.length)) * 100) / 100;
      };
      scorable.forEach((r, k) => {
        const format = r.format;
        const info = weights.indicator.get(r.ref);
        const { title, options } = bulletsOf(r.text);
        // The methodology's heading, where the row starts with all of it (compared by letters and digits: the row may lose
        // a space, "Studentshunger"); otherwise the row's own title. The methodology numbers some items differently
        // (its 6.5.6 is the workbook's 6.5.5), so a heading that only starts the same way may name another indicator.
        const [head, ask] = splitAsk(title);
        const end = info?.name ? endOf(r.text, info.name) : -1;
        const whole = end >= 0 && !/^\s*[a-z(]/.test(r.text.slice(end));
        const name = (whole || (info?.name && sameEnds(info.name, head)) ? info!.name : head).replace(/\s+/g, " ").replace(/[\s.]+$/, "").slice(0, 200);
        const guidance = (whole ? r.text.slice(end) : ask).replace(/^[\s:.–-]+/, "").split(/\s*[•●]\s*/)[0].trim();
        const points = shareOf(k);
        const subs = (children.get(r.ref) ?? []).filter((c) => !/^achieve by/i.test(c.text));
        const dated = (children.get(r.ref) ?? []).find((c) => /^achieve by/i.test(c.text)) ?? (/^achieve by/i.test(r.text) ? r : null);
        const evidence = { ...(r.evidence && { required: true, public: true }), ...(r.policy && { policyDates: true }) };
        if (dated) {
          push({
            ...base,
            code: r.ref,
            group,
            parent: m,
            name: /achieve by/i.test(r.text) ? "Achieve carbon neutrality by" : name,
            guidance: "The date the University commits to (or did) become carbon neutral.",
            input: { type: "date" },
            score: { kind: "dated", points, steps: [{ until: "2023-12-31", share: 1 }, { until: "2029-12-31", share: 0.75 }, { until: "2039-12-31", share: 0.5 }, { until: "2049-12-31", share: 0.25 }], later: 0.125 },
            evidence,
            ...ownersOf("Office of the Rector / Facilities Management Office"),
          });
          return;
        }
        if (/continuous/i.test(format) || subs.length) {
          // A proportion THE normalises: its figures are inputs, the question computes the ratio.
          const inputs = subs.length ? subs : [r];
          const codes = inputs.map((c, j) => (subs.length ? `${r.ref}.${String.fromCharCode(97 + j)}` : r.ref));
          inputs.forEach((c, j) => {
            if (!subs.length) return;
            push({ ...base, code: codes[j], group, parent: r.ref, name: c.text.slice(0, 200), input: { type: "number", min: 0 }, rollup: "sum", ...figureOwners(c.text), evidence: c.evidence ? { required: true } : {} });
          });
          let expr: string;
          if (!subs.length) expr = `{${r.ref}}`;
          else if (r.ref === "5.5.1") {
            const total = codes[inputs.findIndex((c) => /^number of graduates: total$/i.test(c.text))] ?? codes[0];
            const female = codes[inputs.findIndex((c) => /female graduates by subject area.*total/i.test(c.text))] ?? codes[codes.length - 1];
            expr = `{${female}} / {${total}} * 100`;
          } else if (r.ref === "9.4.1") {
            const income = codes.filter((_, j) => /research income/i.test(inputs[j].text));
            const staff = codes.filter((_, j) => /academic staff/i.test(inputs[j].text));
            expr = `(${income.map((c) => `{${c}}`).join(" + ")}) / (${staff.map((c) => `{${c}}`).join(" + ")})`;
          } else if (r.ref === "12.3.2") {
            const gen = codes[inputs.findIndex((c) => /generated/i.test(c.text))];
            const rec = codes[inputs.findIndex((c) => /recycled/i.test(c.text))];
            expr = `{${rec}} / {${gen}} * 100`;
          } else {
            const d = inputs.findIndex((c) => DENOMINATOR.test(c.text));
            const den = d >= 0 ? d : 0;
            const numIdx = inputs.findIndex((_, j) => j !== den);
            expr = numIdx >= 0 ? `{${codes[numIdx]}} / {${codes[den]}}${LOWER_BETTER.has(r.ref) ? "" : " * 100"}` : `{${codes[0]}}`;
          }
          push({
            ...base,
            code: r.ref,
            group,
            parent: m,
            name,
            guidance,
            unit: LOWER_BETTER.has(r.ref) || r.ref === "9.4.1" || r.ref === "8.3.1" ? null : expr.includes("* 100") ? "%" : null,
            input: subs.length ? { type: "none" } : { type: "number", min: 0 },
            score: points ? { kind: "ratio", points, expr, ...(LOWER_BETTER.has(r.ref) && { better: "lower" as const }) } : null,
            evidence,
            tags: ["normalised"],
            ...(subs.length ? { ownerLabels: [] } : figureOwners(name)),
          });
          if (r.ref === "8.3.1" || r.ref === "9.4.1") indicators[indicators.length - 1].score = points ? { kind: "ratio", points, expr: expr.replace(" * 100", "") } : null;
          return;
        }
        const input: InputSpec = /picklist/i.test(format) && options.length ? { type: "picks", options } : { type: "yesno" };
        // A run of questions printed once (17.3.1 to 17.3.17) shares the first one's rules.
        const text = info?.text ?? weights.indicator.get(scorable[0].ref)?.text ?? "";
        const total = Number(/Up to (one|two|three|four|five) points?/i.exec(text)?.[1] ? numberWord(/Up to (one|two|three|four|five) points?/i.exec(text)![1]) : 3);
        const hasDates = total >= 4 && /\bdate/i.test(text.replace(/Existence[^•]*/, ""));
        const existence = input.type === "picks" ? existenceOf(text, options) : { yes: 1 };
        const rule: ScoreRule | null = points
          ? { kind: "claim", points, existence, evidence: r.evidence ? 1 : 0, public: r.evidence ? 1 : 0, ...(hasDates && { dates: 1 }) }
          : null;
        if (input.type === "picks" && !info?.text && !text) report.push(`${r.ref}: no methodology text; options score equally.`);
        push({ ...base, code: r.ref, group, parent: m, name, guidance, input, score: rule, evidence, ownerLabels: ["Every unit (SDG narrative report)"] });
      });
    }
    // A question whose wording the methodology printed under another (3.3.5 under 3.3.7) takes its twin's rule.
    const keysOf = (i: CatalogIndicator) => (i.input.type === "picks" ? i.input.options.map((o) => o.key).join() : "");
    for (const i of indicators.filter((x) => x.group === group && x.score?.kind === "claim" && x.score.existence.yes !== undefined && keysOf(x))) {
      const twin = indicators.find((x) => x !== i && x.parent === i.parent && keysOf(x) === keysOf(i) && x.score?.kind === "claim" && x.score.existence.yes === undefined);
      if (twin?.score?.kind === "claim" && i.score?.kind === "claim") i.score = { ...i.score, existence: { ...twin.score.existence } };
    }
    const sum = indicators.filter((i) => i.group === group && i.score).reduce((s, i) => s + i.score!.points, 0);
    if (Math.abs(sum - 100) > 1.5) report.push(`SDG ${sdg}: the questions add up to ${Math.round(sum * 100) / 100}% of the SDG, not 100%.`);
  }
  return {
    report,
    pack: {
      pack: 1,
      edition: {
        id: "the-impact-2026",
        ranking: "the-impact",
        year: 2026,
        label: "THE Impact Ratings 2026",
        methodology: "Sustainability Impact Ratings Methodology 2026 v1.1",
        period: "Data year 2024 (calendar, academic or financial year ending in 2024)",
        status: "Closed",
        scale: 100,
        aggregate: "the-impact",
        options: { mandatory: "SDG17", mandatoryWeight: 0.22, best: 3, bestWeight: 0.26 },
        sources: ["THE.SustainabilityImpactRatings.METHODOLOGY.2026.v2.1.pdf", "UST SIMBAHAYAN Impact 2026-data collection support v1.xlsx (summary sheet)"],
        notes: "Overall rating: SDG 17 at 22% plus the three strongest other SDGs at 26% each, averaged with the previous year. Evidence: existence, relevance (specific 1, general 0.5) and public, one point each.",
        years: [2024],
      },
      groups,
      indicators,
    },
  };
}
