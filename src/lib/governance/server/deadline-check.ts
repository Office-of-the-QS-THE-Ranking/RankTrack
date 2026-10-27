import "server-only";

/*
 * The deadline check: read each ranking body's page once a day and record what it says (engine/deadlines.ts).
 * The Hub names itself in every request, reads only public pages, follows each source's fixed rule
 * (deadline-read.ts) and never signs in. A site that refuses automated reading is reported, not worked around.
 */
import { createHash } from "node:crypto";
import type { DeadlineSource } from "@/lib/reference";
import type { CommandResult } from "../commands";
import { fillUrl, readSentence, readTable, readWatch, type Reading } from "../deadline-read";
import { recordCheck } from "../engine/deadlines";
import { reference } from "./reference";
import { run, runSystem } from "./run";

const AGENT = "UST-Rankings-Hub-deadline-check/1.0 (+https://rankings.ust.edu.ph)";
const TIMEOUT_MS = 15_000;
/** Pages larger than this are cut; the dates sit well inside. */
const MAX_CHARS = 3_000_000;

const sign = (s: string) => (s ? createHash("sha256").update(s).digest("hex") : "");

async function get(url: string) {
  const res = await fetch(url, {
    headers: { "User-Agent": AGENT, Accept: "text/html,application/xhtml+xml,application/json;q=0.9" },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: res.status, json: /json/.test(res.headers.get("content-type") ?? ""), body: res.ok ? (await res.text()).slice(0, MAX_CHARS) : "" };
}

async function read(source: DeadlineSource, today: string): Promise<Reading> {
  const url = fillUrl(source.page, today);
  const reading = (status: Reading["status"], note: string, found: Reading["found"] = [], signature = ""): Reading => ({ sourceId: source.id, url, status, note, found, signature });
  if (source.kind === "manual" || !source.fetchUrl) return reading("Manual", source.note);

  const address = fillUrl(source.fetchUrl, today);
  let res: Awaited<ReturnType<typeof get>>;
  try {
    res = await get(address);
  } catch (e) {
    return reading("Failed", (e as Error).name === "TimeoutError" ? "The site didn't answer in time." : "The site couldn't be reached.");
  }
  // A page named after the coming edition appears once the body announces it.
  if (res.status === 404 && /\{(year|next)\}/.test(source.fetchUrl)) return reading("Waiting", "Not published yet.");
  if (res.status === 401 || res.status === 403) return reading("Failed", "The site refused the Hub's request.");
  if (res.status !== 200) return reading("Failed", `The site answered ${res.status}.`);

  if (source.kind === "table") {
    let html = res.body;
    let title = "";
    if (res.json) {
      try {
        const doc = JSON.parse(res.body) as { article?: { body?: string; title?: string } };
        html = doc.article?.body ?? "";
        title = doc.article?.title ?? "";
      } catch {
        return reading("Failed", "The site's answer couldn't be read.");
      }
    }
    const { found, missing, signature } = readTable(html, source, today);
    if (!found.length) return reading("Failed", "The dates table is gone or changed. Open the page to check.");
    return reading("Read", missing.length ? `Not found: ${missing.join(", ")}.` : title, found, sign(signature));
  }
  if (source.kind === "sentence") {
    const { found, signature } = readSentence(res.body, source, today);
    if (!found.length) return reading("Failed", "The page no longer says when. Open it to check.");
    return reading("Read", signature, found, sign(signature));
  }
  const marks = readWatch(res.body, source);
  if (!marks.length) return reading("Failed", "The page changed shape. Open it to check.");
  const latest = marks.every((m) => /^\d{4}$/.test(m)) ? `Latest: ${marks[marks.length - 1]}` : `${marks.length} items`;
  return reading("Read", latest, [], sign(marks.join(",")));
}

/** Every source, read side by side. */
export async function readSources(today = new Date().toISOString().slice(0, 10)): Promise<Reading[]> {
  const { deadlineSources } = await reference();
  return Promise.all(deadlineSources.map((s) => read(s, today)));
}

/** The daily check, as the Hub itself. */
export async function checkAsSystem(): Promise<CommandResult> {
  const readings = await readSources();
  return runSystem((ctx) => recordCheck(ctx, readings));
}

/** Check now, as the person who asked; recordCheck refuses anyone who may not change deadlines. */
export async function checkAs(accountId: string): Promise<CommandResult> {
  const readings = await readSources();
  return run(accountId, (ctx) => recordCheck(ctx, readings));
}
