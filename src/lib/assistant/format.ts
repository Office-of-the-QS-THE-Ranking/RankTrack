/*
 * How an answer's text is read, as plain functions (tests/assistant-format.test.ts). Answers are Markdown with graphs in
 * ```chart blocks, and arrive a few words at a time, so this also makes half-finished text presentable. Safe in the
 * browser: the model's instructions live in rules.ts, which client code must not import.
 */

/** A citation, not an index: "May [1]" and "May.[1]" are, "arr[1]" in a piece of code isn't. */
export const CITATION_MARK = /(?<![\w)])\[(\d+)\]/;

/** A fenced block, to its closing fence or the end of what's arrived, or a span of inline code. */
const CODE = /^ {0,3}(`{3,}|~{3,})[^\n]*\n?[\s\S]*?(?:^ {0,3}\1[`~]*[ \t]*$|(?![\s\S]))|`[^`\n]+`/gm;

/** Runs an edit over the prose only, because a chart's [40, 60] or a program's x = [1] isn't a citation. */
export function outsideCode(text: string, edit: (prose: string) => string) {
  let out = "";
  let at = 0;
  for (const match of text.matchAll(CODE)) {
    out += edit(text.slice(at, match.index)) + match[0];
    at = match.index + match[0].length;
  }
  return out + edit(text.slice(at));
}

/* ---------- Cleaning up what models send ---------- */

const WRAPPED_OPEN = /^\s*```(?:markdown|md)[ \t]*\n/i;
const WRAPPED_CLOSE = /\n```\s*$/;
const ODD_BULLET = /^([ \t]*)[•●▪◦‣∙·][ \t]*/gm;
/** Without blank lines round it, a rule under a sentence would turn that sentence into a heading. */
const RULE = /^[ \t]*(-{3,}|\*{3,}|_{3,})[ \t]*$/gm;

const unwrapped = (text: string) => (WRAPPED_OPEN.test(text) ? text.replace(WRAPPED_OPEN, "").replace(WRAPPED_CLOSE, "") : text);

/** The answer as Markdown to display: tidied, and while it's still arriving, with its loose ends held or closed. */
export function prepareAnswer(raw: string, streaming = false) {
  const text = outsideCode(unwrapped(raw), (prose) => prose.replace(ODD_BULLET, "$1- ").replace(RULE, "\n$1\n"));
  return streaming ? settle(text) : text;
}

/** Where a link really goes, for showing beside its text. Links within the Hub, and anything else that isn't a web address, have none. */
export function linkSite(href: string) {
  if (!/^https?:\/\//i.test(href)) return null;
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/* ---------- Half-finished text ---------- */

function insideFence(text: string) {
  let fence: string | null = null;
  for (const line of text.split("\n")) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!match) continue;
    if (!fence) fence = match[1]!;
    else if (match[1]!.startsWith(fence) && !match[2]!.trim()) fence = null;
  }
  return !!fence;
}

const cells = (line: string) => line.trim().replace(/^\||\|$/g, "").split("|");

/** A table shows once its header and whole divider are here, so nobody watches raw pipes arrive. */
function holdBackTable(text: string) {
  const lines = text.split("\n");
  let start = lines.length;
  while (start > 0 && /^ {0,3}\|/.test(lines[start - 1]!)) start--;
  const run = lines.slice(start);
  const divided = run.length === 2 && cells(run[1]!).length >= cells(run[0]!).length && cells(run[1]!).every((c) => /^\s*:?-+:?\s*$/.test(c));
  return !run.length || run.length > 2 || divided ? text : lines.slice(0, start).join("\n");
}

function closeInline(text: string) {
  const blockStart = text.lastIndexOf("\n\n") + 1;
  const head = text.slice(0, blockStart);
  let block = text
    .slice(blockStart)
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*$/, "$1")
    .replace(/\[\d*$/, "");
  if ((block.match(/`/g)?.length ?? 0) % 2) block += "`";
  const bold = block.replace(/`[^`\n]*`/g, "").match(/\*\*/g)?.length ?? 0;
  if (bold % 2) block = /\*\*\s*$/.test(block) ? block.replace(/\*\*\s*$/, "") : `${block.trimEnd()}**`;
  return head + block;
}

function settle(text: string) {
  const lineStart = text.lastIndexOf("\n") + 1;
  const last = text.slice(lineStart);
  // The start of a fence: it could still become a graph or the end of a code block, so it waits for its line to finish.
  if (/^ {0,3}(`+|~{2,})[\w-]*$/.test(last)) return settle(text.slice(0, lineStart).trimEnd());
  if (insideFence(text)) return text;
  // A lone dash could be a bullet about to start or a heading's underline.
  if (/^[ \t]*[-*+=#_>]{1,2}[ \t]*$/.test(last)) return text.slice(0, lineStart).trimEnd();
  return closeInline(holdBackTable(text));
}

/* ---------- Graphs ---------- */

export type ChartType = "bar" | "column" | "line" | "area" | "pie";

export interface ChartSpec {
  type: ChartType;
  title: string;
  sub?: string;
  unit: string;
  labels: string[];
  series: { name: string; values: (number | null)[] }[];
  /** For ranks, where 1 belongs at the top. */
  invert: boolean;
}

/** As many colours as stay apart for colour-blind readers. Past this, the numbers go in a table. */
export const CHART_SERIES = 6;
export const CHART_POINTS = 60;
const PIE_PARTS = 6;
const MAX_COLUMNS = 24;

const TYPES: Record<string, ChartType> = {
  bar: "bar",
  bars: "bar",
  horizontalbar: "bar",
  hbar: "bar",
  column: "column",
  columns: "column",
  verticalbar: "column",
  line: "line",
  area: "area",
  pie: "pie",
  donut: "pie",
  doughnut: "pie",
};

const words = (value: unknown, limit = 80) => (typeof value === "string" || typeof value === "number" ? String(value).trim().slice(0, limit) : "");

function amount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const n = Number(value.replace(/[,%\s$€£₱¥]/g, ""));
  return Number.isFinite(n) ? n : null;
}

const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/** The numbers in either shape models write: labels with series, or a list of label and value pairs. */
function readData(raw: Record<string, unknown>) {
  const pairs = asList(raw.data).filter((d): d is Record<string, unknown> => !!d && typeof d === "object");
  if (pairs.length && !raw.labels) {
    return {
      labels: pairs.map((p) => words(p.label ?? p.name ?? p.x)),
      series: [{ name: words(raw.name) || "Value", values: pairs.map((p) => amount(p.value ?? p.y)) }],
    };
  }
  const labels = asList(raw.labels).map((l) => words(l));
  const listed = asList(raw.series).filter((s): s is Record<string, unknown> => !!s && typeof s === "object");
  const series = listed.length ? listed : raw.values ? [{ name: raw.name, values: raw.values }] : [];
  return {
    labels,
    series: series.map((s, i) => ({
      name: words(s.name) || (series.length > 1 ? `Series ${i + 1}` : "Value"),
      values: labels.map((_, k) => amount(asList(s.values ?? s.data)[k])),
    })),
  };
}

/** A graph from a ```chart block, or null if its text isn't one, as is the case for a block that's still arriving. */
export function parseChart(source: string): ChartSpec | null {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const { labels, series } = readData(r);
  if (!labels.length || !series.length || labels.length > CHART_POINTS || series.length > MAX_COLUMNS) return null;
  if (!series.some((s) => s.values.some((v) => v !== null))) return null;

  let type = TYPES[words(r.type).toLowerCase().replace(/[^a-z]/g, "")] ?? "bar";
  let shownLabels = labels;
  let shownSeries = series;
  if (type === "pie") {
    const values = series[0]!.values;
    const whole = series.length === 1 && labels.length <= PIE_PARTS && values.every((v) => v !== null && v >= 0) && values.some((v) => v);
    if (!whole) {
      // Too many slices to tell apart, or not parts of one whole: bars, largest first, say the same thing more clearly.
      type = "bar";
      if (series.length === 1) {
        const order = labels.map((_, i) => i).sort((a, b) => (values[b] ?? -Infinity) - (values[a] ?? -Infinity));
        shownLabels = order.map((i) => labels[i]!);
        shownSeries = [{ name: series[0]!.name, values: order.map((i) => values[i]!) }];
      }
    }
  }
  const sub = words(r.sub ?? r.subtitle, 160);
  const unit = words(r.unit, 12);
  // Some models forget, and a rising line would then read as a fall. "Rank" names the numbers; "Ranking score" wouldn't.
  const ranks = [unit, ...shownSeries.map((s) => s.name)].some((name) => /\branks?$/i.test(name));
  return {
    type,
    title: words(r.title, 120) || (shownSeries.length === 1 && shownSeries[0]!.name !== "Value" ? shownSeries[0]!.name : "Graph"),
    ...(sub && { sub }),
    unit: /^ranks?$/i.test(unit) ? "" : unit,
    labels: shownLabels,
    series: shownSeries,
    invert: r.invert === true || (ranks && (type === "line" || type === "area")),
  };
}

/** 1,284 · 42% · $1,200 · 8 pts */
export function formatValue(value: number, unit = "") {
  const text = value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (!unit) return text;
  if (/^[$€£₱¥]/.test(unit)) return `${unit}${text}`;
  return unit === "%" ? `${text}%` : `${text} ${unit}`;
}

/** For an axis: full under 10,000, then 10K, with a symbol but never a long unit, which the title carries. */
export function formatTick(value: number, unit = "") {
  const short = Math.abs(value) >= 10_000 ? `${(value / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}K` : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (/^[$€£₱¥]/.test(unit)) return `${unit}${short}`;
  return unit === "%" ? `${short}%` : short;
}

/** Round axis values covering the range, about `count` steps of 1, 2, 2.5 or 5 times a power of ten. */
export function niceTicks(low: number, high: number, count = 4) {
  const lo = low === high ? (low === 0 ? 0 : low - Math.abs(low) * 0.1) : low;
  const hi = low === high ? (high === 0 ? 1 : high + Math.abs(high) * 0.1) : high;
  const rough = (hi - lo) / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough * 0.999) ?? rough;
  const first = Math.floor(lo / step);
  const last = Math.ceil(hi / step);
  return Array.from({ length: last - first + 1 }, (_, i) => Number(((first + i) * step).toFixed(10)));
}
