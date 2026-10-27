/*
 * Ranking deadlines and the other dates in each ranking's calendar: set by hand on the ranking's page, or read
 * from the ranking bodies' websites by the deadline check and applied by the Office. The check never changes a
 * date itself; what it reads that differs from the Hub becomes a finding, and the Office is told.
 */
import type { Command, CommandResult } from "../commands";
import { DEADLINE_LABEL, type Reading } from "../deadline-read";
import type { DeadlineFinding, Notice, RankingConfig } from "../types";
import { can, clean, deny, invalid, isDay, log, nextId, ok, type Ctx } from "./core";

const RESOURCE = (slug: string, label: string) => ({ type: "Ranking calendar", id: slug, label });
const CHECK = { type: "Deadline check", id: "deadline-check", label: "Deadline check" };

/** Dates a ranking's calendar may hold besides its deadline. */
const MAX_ENTRIES = 20;
/** Findings kept once decided, newest first. */
const KEEP_FINDINGS = 200;

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function rankingConfig(ctx: Ctx, slug: string): RankingConfig | null {
  const meta = ctx.ref.rankings.find((x) => x.slug === slug);
  if (!meta) return null;
  // A framework added in Supabase gets its configuration the first time someone changes it.
  let r = ctx.state.config.rankings.find((x) => x.slug === slug);
  if (!r) ctx.state.config.rankings.push((r = { slug, enabled: true, public: false, deadline: meta.deadline }));
  return r;
}

function guard(ctx: Ctx, action: string, slug: string, label: string): CommandResult | null {
  return can(ctx, "config", "edit") ? null : deny(ctx, action, "Configuration", RESOURCE(slug, label), "Your role cannot change ranking deadlines.");
}

/** Post a notice to the Office under the "new date found" template, when it is switched on. */
function tellOffice(ctx: Ctx, text: string, href: string) {
  const t = ctx.state.config.templates.find((x) => x.id === "tpl-deadline-found");
  if (!t?.enabled || t.channel === "Email") return;
  const notice: Notice = { id: nextId(ctx, "notice", "NT-"), at: ctx.iso, to: "office", text, href, templateId: t.id, readBy: [] };
  ctx.state.notices.unshift(notice);
  ctx.state.notices = ctx.state.notices.slice(0, 300);
}

/** Findings still waiting that a new value settles: the same date, now in place. */
function settle(ctx: Ctx, slug: string, target: DeadlineFinding["target"], label: string, due: string) {
  for (const f of ctx.state.config.findings)
    if (f.state === "New" && f.slug === slug && f.target === target && f.label === label && f.due === due) Object.assign(f, { state: "Applied", decidedBy: ctx.actor.name, decidedAt: ctx.iso });
}

/** deadline.set: the deadline and the other dates, as typed on the ranking's page. */
export function setDeadlines(ctx: Ctx, cmd: Extract<Command, { type: "deadline.set" }>): CommandResult {
  const meta = ctx.ref.rankings.find((x) => x.slug === cmd.slug);
  if (!meta) return invalid("Unknown ranking.");
  const g = guard(ctx, "deadline.set", meta.slug, meta.short);
  if (g) return g;
  const c = ctx.state.config;
  const r = rankingConfig(ctx, meta.slug)!;
  const changes: string[] = [];

  if (cmd.deadline !== undefined && cmd.deadline !== r.deadline) {
    if (!isDay(cmd.deadline)) return invalid("Enter the deadline as a date.");
    changes.push(`deadline ${r.deadline} → ${cmd.deadline}`);
    Object.assign(r, { deadline: cmd.deadline, deadlineSource: "Manual", deadlineBy: ctx.actor.name, deadlineAt: ctx.iso });
    delete r.deadlineUrl;
    settle(ctx, meta.slug, "deadline", DEADLINE_LABEL, cmd.deadline);
  }

  if (cmd.entries !== undefined) {
    if (!Array.isArray(cmd.entries) || cmd.entries.length > MAX_ENTRIES) return invalid(`A ranking's calendar holds up to ${MAX_ENTRIES} dates.`);
    const before = c.calendar.filter((e) => e.slug === meta.slug);
    const seen = new Set<string>();
    const next = [];
    for (const e of cmd.entries) {
      const label = clean(e?.label, 120);
      if (!label) return invalid("Name each date, like “Survey contacts close”.");
      if (!isDay(e.due)) return invalid(`Enter a date for “${label}”.`);
      const key = label.toLowerCase();
      if (key === DEADLINE_LABEL.toLowerCase()) return invalid("The deadline has its own field.");
      if (seen.has(key)) return invalid(`“${label}” is listed twice.`);
      seen.add(key);
      const old = typeof e.id === "string" ? before.find((b) => b.id === e.id) : undefined;
      if (old && old.label === label && old.due === e.due) next.push(old);
      else {
        next.push({ id: old?.id ?? nextId(ctx, "calendar", "CAL-", 4), slug: meta.slug, label, due: e.due, source: "Manual" as const, by: ctx.actor.name, at: ctx.iso });
        settle(ctx, meta.slug, "milestone", label, e.due);
      }
    }
    const kept = new Set(next.map((e) => e.id));
    const removed = before.filter((b) => !kept.has(b.id)).length;
    const added = next.filter((e) => !before.some((b) => b.id === e.id)).length;
    const edited = next.filter((e) => before.some((b) => b.id === e.id && b !== e)).length;
    if (added) changes.push(`${added} ${added === 1 ? "date" : "dates"} added`);
    if (edited) changes.push(`${edited} changed`);
    if (removed) changes.push(`${removed} removed`);
    c.calendar = [...c.calendar.filter((e) => e.slug !== meta.slug), ...next];
  }

  if (!changes.length) return ok("No changes.");
  log(ctx, "deadline.set", "Configuration", RESOURCE(meta.slug, meta.short), "Success", changes.join("; "));
  return ok(`${meta.short} dates saved.`);
}

/** deadline.apply: a date the check read takes the place of the Hub's. */
export function applyFinding(ctx: Ctx, id: string): CommandResult {
  const f = ctx.state.config.findings.find((x) => x.id === id);
  if (!f) return invalid("That date is no longer waiting.");
  const meta = ctx.ref.rankings.find((x) => x.slug === f.slug);
  if (!meta) return invalid("Unknown ranking.");
  const g = guard(ctx, "deadline.apply", meta.slug, meta.short);
  if (g) return g;
  if (f.state !== "New") return invalid(`That date was already ${f.state.toLowerCase()}.`);
  const c = ctx.state.config;
  let from: string | undefined;
  if (f.target === "deadline") {
    const r = rankingConfig(ctx, meta.slug)!;
    from = r.deadline;
    Object.assign(r, { deadline: f.due, deadlineSource: "Automatic", deadlineUrl: f.url, deadlineBy: ctx.actor.name, deadlineAt: ctx.iso });
  } else {
    const e = c.calendar.find((x) => x.slug === f.slug && x.label === f.label);
    from = e?.due;
    if (e) Object.assign(e, { due: f.due, source: "Automatic", url: f.url, by: ctx.actor.name, at: ctx.iso });
    else c.calendar.push({ id: nextId(ctx, "calendar", "CAL-", 4), slug: f.slug, label: f.label, due: f.due, source: "Automatic", url: f.url, by: ctx.actor.name, at: ctx.iso });
  }
  Object.assign(f, { state: "Applied", decidedBy: ctx.actor.name, decidedAt: ctx.iso });
  settle(ctx, f.slug, f.target, f.label, f.due);
  log(ctx, "deadline.apply", "Configuration", RESOURCE(meta.slug, meta.short), "Success", `${f.label}: ${from ?? "none"} → ${f.due} (read from ${f.url})`);
  return ok(`${meta.short}: ${f.label.toLowerCase()} ${day(f.due)}.`);
}

/** deadline.dismiss: the Hub keeps its date; the same reading is not raised again. */
export function dismissFinding(ctx: Ctx, id: string): CommandResult {
  const f = ctx.state.config.findings.find((x) => x.id === id);
  if (!f) return invalid("That date is no longer waiting.");
  const meta = ctx.ref.rankings.find((x) => x.slug === f.slug);
  const g = guard(ctx, "deadline.dismiss", f.slug, meta?.short ?? f.slug);
  if (g) return g;
  if (f.state !== "New") return invalid(`That date was already ${f.state.toLowerCase()}.`);
  Object.assign(f, { state: "Dismissed", decidedBy: ctx.actor.name, decidedAt: ctx.iso });
  log(ctx, "deadline.dismiss", "Configuration", RESOURCE(f.slug, meta?.short ?? f.slug), "Success", `${f.label} ${f.due} (read from ${f.url})`);
  return ok("Dismissed. The current date stays.");
}

/**
 * Record a check: each source's reading, and a finding for every date that differs from the Hub's and hasn't
 * been raised before. Run as the system by the daily check, or as the person who pressed Check now.
 */
export function recordCheck(ctx: Ctx, readings: Reading[]): CommandResult {
  if (!can(ctx, "config", "edit")) return deny(ctx, "deadline.check", "Configuration", CHECK, "Your role cannot run the deadline check.");
  const c = ctx.state.config;
  const fresh: DeadlineFinding[] = [];
  const changedPages: string[] = [];
  const failed: string[] = [];
  for (const r of readings) {
    const src = ctx.ref.deadlineSources.find((s) => s.id === r.sourceId);
    if (!src) continue;
    let w = c.watch.find((x) => x.id === src.id);
    const wasFailing = w?.status === "Failed";
    if (!w) c.watch.push((w = { id: src.id, checkedAt: ctx.iso, status: r.status, note: r.note }));
    const changed = !!r.signature && !!w.hash && w.hash !== r.signature;
    Object.assign(w, { checkedAt: ctx.iso, status: r.status, note: r.note });
    if (r.signature) {
      if (changed) w.changedAt = ctx.iso;
      w.hash = r.signature;
    }
    if (r.status === "Failed" && !wasFailing) failed.push(`${src.name}: ${r.note}`);
    if (changed && src.kind === "watch") changedPages.push(src.id);

    for (const f of r.found) {
      // A date already past belongs to the cycle that ended.
      if (!ctx.ref.rankings.some((x) => x.slug === f.slug) || !isDay(f.due) || f.due < ctx.day) continue;
      const current = f.target === "deadline" ? rankingConfig(ctx, f.slug)!.deadline : c.calendar.find((e) => e.slug === f.slug && e.label === f.label)?.due;
      if (current === f.due) continue;
      const same = (x: DeadlineFinding) => x.slug === f.slug && x.target === f.target && x.label === f.label;
      // Raised before (waiting, applied or dismissed): not again.
      if (c.findings.some((x) => same(x) && x.due === f.due)) continue;
      // An earlier reading of the same date that the page has since changed.
      for (const x of c.findings) if (same(x) && x.state === "New") Object.assign(x, { state: "Dismissed", decidedBy: ctx.actor.name, decidedAt: ctx.iso });
      const finding: DeadlineFinding = { id: nextId(ctx, "finding", "DF-", 4), sourceId: src.id, slug: f.slug, target: f.target, label: f.label, due: f.due, quote: f.quote.slice(0, 300), url: r.url, foundAt: ctx.iso, state: "New" };
      c.findings.unshift(finding);
      fresh.push(finding);
    }
  }
  const waiting = c.findings.filter((f) => f.state === "New");
  c.findings = [...waiting, ...c.findings.filter((f) => f.state !== "New").slice(0, KEEP_FINDINGS)].sort((a, b) => b.foundAt.localeCompare(a.foundAt) || b.id.localeCompare(a.id));

  const short = (slug: string) => ctx.ref.rankings.find((x) => x.slug === slug)?.short ?? slug;
  for (const f of fresh.slice(0, 6)) {
    const src = ctx.ref.deadlineSources.find((s) => s.id === f.sourceId);
    tellOffice(ctx, `${short(f.slug)}: ${f.label.toLowerCase()} ${day(f.due)} on ${src?.name ?? "the ranking body's website"}. Apply it or dismiss it on the ranking's page.`, `/admin/rankings/${f.slug}#deadlines`);
  }
  for (const id of changedPages) {
    const src = ctx.ref.deadlineSources.find((s) => s.id === id)!;
    const slug = src.rules[0]?.slugs[0];
    tellOffice(ctx, `${src.name} changed. Open it to check for new dates.`, slug ? `/admin/rankings/${slug}#deadlines` : "/admin/administration/config");
  }
  if (fresh.length) log(ctx, "deadline.check", "Configuration", CHECK, "Success", fresh.map((f) => `${short(f.slug)} ${f.label.toLowerCase()} ${f.due}`).join("; ").slice(0, 300));
  if (changedPages.length) log(ctx, "deadline.check", "Configuration", CHECK, "Success", `Changed: ${changedPages.join(", ")}`);
  if (failed.length) log(ctx, "deadline.check", "Configuration", CHECK, "Failed", failed.join("; ").slice(0, 300));

  const unread = readings.filter((r) => r.status === "Failed").length;
  const parts = [fresh.length ? `${fresh.length} new ${fresh.length === 1 ? "date" : "dates"} found.` : "No new dates."];
  if (unread) parts.push(`${unread} ${unread === 1 ? "source" : "sources"} couldn't be read.`);
  return ok(parts.join(" "), { data: { found: fresh.length, failed: unread } });
}
