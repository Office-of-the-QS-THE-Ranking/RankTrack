/*
 * Workspace records written through the governance layer: evidence, reporting-period values, story and
 * innovation proposals, assistance requests, report exports and notifications. Each is authorized by
 * role and by organizational scope, and audited.
 */
import { RANKINGS } from "@/lib/data";
import type { Command, CommandResult } from "../commands";
import { evidenceBodies, featureOn, mappingActive } from "../derive";
import { descendants, has } from "../rbac";
import { evidenceById } from "../records";
import type { EvidenceRecord } from "../types";
import { can, clean, cleanText, deny, invalid, log, nextId, notify, ok, unitById, type Ctx } from "./core";
import { publishStory } from "./mutations";
import { needsApproval, openRequest, workflowOn } from "./requests";
import { raiseAlert } from "./security";

export const EVIDENCE_TYPES = [
  "Operational data",
  "Research output",
  "Policy",
  "Narrative and outcomes",
  "Financial data",
  "Teaching and course data",
  "Innovation or intellectual property",
];

const evRes = (e: { id: string; title: string }) => ({ type: "Evidence", id: e.id, label: e.title });

/**
 * Where a new record from `unitSlug`'s workspace belongs. Someone scoped to a department or programme
 * files records against it, so organizational scope keeps working below the faculty level.
 */
function placement(ctx: Ctx, unitSlug: string, module: "evidence" | "data" | "stories", action: "submit" | "create"): { unitSlug: string; programId?: string } | null {
  if (can(ctx, module, action, { unitId: unitSlug })) return { unitSlug };
  const tree = descendants(ctx.state.units, unitSlug);
  const narrow = ctx.actor.grants.find((g) => has(g.perms, module, action) && g.scopeUnits !== "all" && g.scopeUnits.some((u) => tree.includes(u)));
  if (narrow && narrow.scopeUnits !== "all") return { unitSlug, programId: narrow.scopeUnits.find((u) => tree.includes(u)) };
  return null;
}

const targetOf = (e: EvidenceRecord) => ({ unitId: e.programId ?? e.unitSlug, bodies: evidenceBodies(e.mappedTo) });

function ext(name: string) {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1].toUpperCase() : "";
}

export function submitEvidence(ctx: Ctx, cmd: Extract<Command, { type: "evidence.submit" }>): CommandResult {
  const unit = unitById(ctx, cmd.unitSlug);
  const i = cmd.input;
  if (!unit) return invalid("Choose the unit you are submitting for.");
  const target = { type: "Evidence", id: "new", label: clean(i.title) || "Untitled" };
  if (!featureOn(ctx.state, "submit-evidence")) return invalid("Evidence submission is switched off in System Configuration.");
  if (unit.status !== "Active") return invalid(`${unit.name} is archived and cannot submit new evidence.`);
  const place = placement(ctx, unit.id, "evidence", "submit");
  if (!place) return deny(ctx, "evidence.submit", "Data", target, `You cannot submit evidence for ${unit.name}.`);
  if (clean(i.title).length < 4) return invalid("Give the contribution a title of at least four characters.");
  if (!EVIDENCE_TYPES.includes(i.type)) return invalid("Choose the kind of evidence.");
  const period = ctx.state.config.periods.find((p) => p.label === i.period);
  if (!period) return invalid("Choose a reporting period.");
  if (!period.accepting) return invalid(`${period.label} is closed to submissions.`);
  if (!clean(i.result)) return invalid("Enter the measurable result.");
  if (!clean(i.beneficiaries)) return invalid("Say who benefited.");
  if (!i.sdgs.length || i.sdgs.some((n) => n < 1 || n > 17)) return invalid("Select at least one SDG.");
  const up = ctx.state.config.uploads;
  if (i.files.length > up.maxFiles) return invalid(`Attach at most ${up.maxFiles} files.`);
  const wrong = i.files.find((f) => !up.types.includes(ext(f.name)));
  if (wrong) return invalid(`${wrong.name} is not an accepted file type (${up.types.join(", ")}).`);
  const big = i.files.find((f) => f.sizeMB > up.maxFileMB);
  if (big) return invalid(`${big.name} is larger than ${up.maxFileMB} MB.`);
  const url = i.url.trim();
  if (url && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(url)) return invalid("Enter a full public URL starting with https://");
  if (!i.files.length && !url) return invalid("Attach a file or give a public URL.");
  const mapped = [...new Set(i.mappedTo.filter((m) => mappingActive(ctx.state, m)))];
  if (!mapped.length) return invalid("Keep at least one ranking indicator.");
  const id = nextId(ctx, "evidence", "EV-", 4);
  const rec: EvidenceRecord = {
    id,
    title: clean(i.title, 160),
    unitSlug: place.unitSlug,
    programId: place.programId,
    type: i.type,
    period: period.label,
    submitted: ctx.day,
    submittedBy: ctx.actor.name,
    status: "For review",
    stage: 0,
    level: i.level,
    mappedTo: mapped,
    sdgs: [...new Set(i.sdgs)].sort((a, b) => a - b),
    summary: cleanText(i.summary, 1200),
    result: clean(i.result, 200),
    beneficiaries: clean(i.beneficiaries, 200),
    files: [...i.files.map((f) => f.name), ...(url ? [url] : [])],
    comments: [],
  };
  ctx.state.records.evidence[id] = rec;
  log(ctx, "evidence.submit", "Data", evRes(rec), "Success", `${unit.name}${place.programId ? ` · ${unitById(ctx, place.programId)?.name}` : ""} · ${mapped.length} indicators · ${rec.files.length} files`);
  notify(ctx, "office", "tpl-submitted", { unit: unit.name, title: rec.title }, `/admin/contribute?item=${id}`);
  return ok(`Received as ${id}.`, { data: id });
}

export function review(ctx: Ctx, id: string, decision: "accept" | "revise", text: string): CommandResult {
  const e = evidenceById(ctx.state, id);
  if (!e) return invalid("That submission no longer exists.");
  const action = decision === "accept" ? "evidence.accept" : "evidence.revise";
  if (!can(ctx, "evidence", "approve", targetOf(e)))
    return deny(ctx, action, "Approval", evRes(e), "This submission is outside the units or ranking bodies you review.");
  if (e.submittedBy === ctx.actor.name) return deny(ctx, action, "Approval", evRes(e), "You submitted this item, so another reviewer must decide it.");
  const t = cleanText(text, 1000);
  if (decision === "revise" && t.length < 5) return invalid("Say what the unit should change before requesting a revision.");
  const unit = unitById(ctx, e.unitSlug);
  const role = `Reviewer, ${unitById(ctx, ctx.actor.account?.unitId ?? "")?.name ?? "Office of QS/THE Rankings"}`;
  const next: EvidenceRecord =
    decision === "accept"
      ? { ...e, status: "Validated", stage: Math.max(e.stage, 2), comments: t ? [...e.comments, { by: ctx.actor.name, role, date: ctx.day, text: t }] : e.comments }
      : { ...e, status: "Needs revision", stage: 1, comments: [...e.comments, { by: ctx.actor.name, role, date: ctx.day, text: t }] };
  ctx.state.records.evidence[e.id] = next;
  const rankings = new Set(next.mappedTo.map((m) => m.split(" · ")[0])).size;
  log(ctx, action, "Approval", evRes(e), "Success", decision === "accept" ? `Accepted · counts in ${rankings} rankings` : `Revision requested: ${t.slice(0, 140)}`);
  if (decision === "accept") notify(ctx, `unit:${e.unitSlug}`, "tpl-accepted", { title: e.title, count: rankings }, "/portal/history");
  else notify(ctx, `unit:${e.unitSlug}`, "tpl-revision", { title: e.title, comment: t }, "/portal/feedback");
  return ok(decision === "accept" ? `Accepted. ${unit?.name ?? "The unit"} will see where it counts.` : `Revision requested from ${unit?.name ?? "the unit"}.`);
}

export function remap(ctx: Ctx, id: string, add?: string, remove?: string): CommandResult {
  const e = evidenceById(ctx.state, id);
  if (!e) return invalid("That submission no longer exists.");
  if (!can(ctx, "evidence", "approve", targetOf(e))) return deny(ctx, "evidence.map", "Data", evRes(e), "This submission is outside what you review.");
  let mappedTo = e.mappedTo;
  if (add) {
    if (!mappingActive(ctx.state, add)) return invalid(`${add.split(" · ")[0]} is not a supported ranking right now.`);
    mappedTo = [...new Set([...mappedTo, add])];
  }
  if (remove) {
    mappedTo = mappedTo.filter((m) => m !== remove);
    if (!mappedTo.length) return invalid("Keep at least one indicator; request a revision instead if none applies.");
  }
  ctx.state.records.evidence[e.id] = { ...e, mappedTo };
  log(ctx, "evidence.map", "Data", evRes(e), "Success", add ? `Mapped to ${add}` : `Removed ${remove}`);
  return ok(add ? `Mapped to ${add}.` : `Removed ${remove}.`);
}

export function respond(ctx: Ctx, id: string, text: string, file?: string): CommandResult {
  const e = evidenceById(ctx.state, id);
  if (!e) return invalid("That submission no longer exists.");
  if (!can(ctx, "evidence", "edit", { unitId: e.programId ?? e.unitSlug })) return deny(ctx, "evidence.respond", "Data", evRes(e), "This submission belongs to another unit.");
  if (e.status !== "Needs revision") return invalid("Only items waiting for a revision can be resubmitted.");
  const t = cleanText(text, 1000);
  if (t.length < 5) return invalid("Write a reply so the reviewer knows what changed.");
  const f = file ? clean(file, 120) : "";
  if (f && !ctx.state.config.uploads.types.includes(ext(f))) return invalid(`${f} is not an accepted file type (${ctx.state.config.uploads.types.join(", ")}).`);
  const unit = unitById(ctx, e.unitSlug);
  ctx.state.records.evidence[e.id] = {
    ...e,
    status: "For review",
    stage: 1,
    files: f ? [...e.files, f] : e.files,
    comments: [...e.comments, { by: ctx.actor.name, role: unit?.name ?? e.unitSlug, date: ctx.day, text: f ? `${t}\n\nAttached: ${f}` : t }],
  };
  log(ctx, "evidence.resubmit", "Data", evRes(e), "Success", f ? `Corrected file ${f}` : "Reply without a new file");
  notify(ctx, "office", "tpl-submitted", { unit: unit?.name ?? e.unitSlug, title: `${e.title} (resubmitted)` }, `/admin/contribute?item=${e.id}`);
  return ok("Resubmitted. The reviewer has been notified and the item is back in the queue.");
}

export function submitValues(ctx: Ctx, unitSlug: string, values: { id: string; label: string; value: string; source: string }[]): CommandResult {
  const unit = unitById(ctx, unitSlug);
  if (!unit) return invalid("Choose the unit.");
  if (!featureOn(ctx.state, "data-entry")) return invalid("Reporting-period data entry is switched off in System Configuration.");
  const target = { type: "Data values", id: unit.id, label: `${values.length} values, ${unit.name}` };
  if (!placement(ctx, unit.id, "data", "submit")) return deny(ctx, "data.submit", "Data", target, `You cannot submit data for ${unit.name}.`);
  const good = values.filter((v) => /^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(v.value.trim()) && v.source.trim());
  if (!good.length) return invalid("Every value needs a number and its source document.");
  for (const v of good) ctx.state.records.values[v.id] = { value: v.value.trim(), source: clean(v.source, 200), status: "For review", by: ctx.actor.id, at: ctx.iso };
  log(ctx, "data.submit", "Data", target, "Success", good.map((v) => `${v.label}: ${v.value}`).join("; ").slice(0, 300));
  notify(ctx, "office", "tpl-submitted", { unit: unit.name, title: `${good.length} reporting-period ${good.length === 1 ? "value" : "values"}` }, "/admin/contribute");
  return ok(`${good.length} ${good.length === 1 ? "value" : "values"} sent for validation.`);
}

export function proposeStory(ctx: Ctx, cmd: Extract<Command, { type: "story.propose" }>): CommandResult {
  const unit = unitById(ctx, cmd.unitSlug);
  const i = cmd.input;
  if (!unit) return invalid("Choose the unit.");
  if (!featureOn(ctx.state, "story-proposals")) return invalid("Story proposals are switched off in System Configuration.");
  const target = { type: "Story", id: "new", label: clean(i.title) || "Untitled story" };
  if (!placement(ctx, unit.id, "stories", "create")) return deny(ctx, "story.propose", "Data", target, `You cannot propose stories for ${unit.name}.`);
  if (clean(i.title).length < 4 || cleanText(i.challenge).length < 10 || !clean(i.figure) || !clean(i.beneficiaries)) return invalid("Complete the title, challenge, outcome figure and beneficiaries.");
  const base = clean(i.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "story";
  let slug = base;
  for (let n = 2; ctx.state.records.proposals.some((p) => p.slug === slug) || RANKINGS.some((r) => r.slug === slug); n++) slug = `${base}-${n}`;
  const id = nextId(ctx, "story", "ST-", 4);
  ctx.state.records.proposals.unshift({
    slug,
    title: clean(i.title, 160),
    unitSlug: unit.id,
    by: ctx.actor.id,
    at: ctx.iso,
    sdgs: i.sdgs,
    rankings: i.rankings,
    challenge: cleanText(i.challenge, 600),
    outcome: `${clean(i.figure, 40)} ${clean(i.figureLabel, 120)}`.trim(),
  });
  ctx.state.records.stories[slug] = "In review";
  log(ctx, "story.propose", "Data", { type: "Story", id: slug, label: clean(i.title) }, "Success", `${id} · ${unit.name}`);
  let requestId: string | undefined;
  if (needsApproval(ctx, "publication")) {
    const req = openRequest(ctx, "publication", { kind: "publication", target: "story", id: slug, title: clean(i.title) }, `Publish story: ${clean(i.title)}`, `Proposed by ${ctx.actor.name} for ${unit.name}.`);
    requestId = req.id;
  }
  return ok(`Proposal ${id} received.${requestId ? ` Publication request ${requestId} opened.` : ""}`, { data: id, requestId });
}

export function setStoryState(ctx: Ctx, slug: string, state: "Published" | "Withdrawn", title: string): CommandResult {
  const target = { type: "Story", id: slug, label: title };
  if (!can(ctx, "stories", "approve")) return deny(ctx, `story.${state === "Published" ? "publish" : "withdraw"}`, "Approval", target, "Your role cannot publish or withdraw stories.");
  if (state === "Withdrawn") {
    ctx.state.records.stories[slug] = "Withdrawn";
    log(ctx, "story.withdraw", "Approval", target, "Success", "Removed from the public website");
    return ok(`“${title}” is no longer on the public website.`);
  }
  if (needsApproval(ctx, "publication")) {
    const req = openRequest(ctx, "publication", { kind: "publication", target: "story", id: slug, title }, `Publish story: ${title}`, `Republication requested by ${ctx.actor.name}.`);
    return ok(`Publication needs two approvals: ${req.id} opened.`, { requestId: req.id });
  }
  publishStory(ctx, slug, title);
  return ok(`“${title}” is on the public website.`);
}

export function proposeInnovation(ctx: Ctx, unitSlug: string, name: string, category: string): CommandResult {
  const unit = unitById(ctx, unitSlug);
  if (!unit) return invalid("Choose the unit.");
  if (!featureOn(ctx.state, "innovation-proposals")) return invalid("Innovation proposals are switched off in System Configuration.");
  const target = { type: "Innovation", id: "new", label: clean(name) };
  if (!placement(ctx, unit.id, "stories", "create")) return deny(ctx, "innovation.propose", "Data", target, `You cannot propose innovations for ${unit.name}.`);
  if (clean(name).length < 3 || !clean(category)) return invalid("Name the innovation and choose a WURI category.");
  const id = nextId(ctx, "innovation", "IN-", 4);
  ctx.state.records.innovations.unshift({ id, name: clean(name, 160), unitSlug: unit.id, by: ctx.actor.id, at: ctx.iso, category: clean(category) });
  log(ctx, "innovation.propose", "Data", { type: "Innovation", id, label: clean(name) }, "Success", `${clean(category)} · ${unit.name}`);
  notify(ctx, "office", "tpl-submitted", { unit: unit.name, title: `innovation proposal “${clean(name)}”` }, "/admin/impact");
  return ok(`Innovation ${id} entered the pipeline.`, { data: id });
}

export function requestAssistance(ctx: Ctx, unitSlug: string, topic: string, urgent: boolean, message: string): CommandResult {
  const unit = unitById(ctx, unitSlug);
  if (!unit) return invalid("Choose the unit.");
  if (!featureOn(ctx.state, "assistance")) return invalid("Assistance requests are switched off in System Configuration.");
  if (!clean(topic) || cleanText(message).length < 10) return invalid("Choose a topic and write at least a sentence.");
  const id = nextId(ctx, "assistance", "AR-", 4);
  ctx.state.records.assistance.unshift({ id, topic: clean(topic), unitSlug: unit.id, by: ctx.actor.id, at: ctx.iso, urgent });
  log(ctx, "assistance.request", "Data", { type: "Assistance request", id, label: clean(topic) }, "Success", `${unit.name}${urgent ? " · urgent" : ""}`);
  notify(ctx, "office", "tpl-submitted", { unit: unit.name, title: `assistance request: ${clean(topic)}${urgent ? " (urgent)" : ""}` }, "/admin/units/" + unit.id);
  return ok(`Request ${id} sent.`, { data: id });
}

export function exportReport(ctx: Ctx, report: string, cycle: string, rows: number, datasets: string[]): CommandResult {
  const target = { type: "Report", id: report.toLowerCase().replace(/\s+/g, "-"), label: `${report}, cycle ${cycle}` };
  if (!featureOn(ctx.state, "reports")) return invalid("The report builder is switched off in System Configuration.");
  if (!can(ctx, "reports", "export", { year: cycle })) return deny(ctx, "report.export", "Export", target, "Your role cannot export reports for this cycle.");
  const sec = ctx.state.security.exports;
  const classes: string[] = [];
  for (const id of datasets) {
    const d = ctx.state.datasets.find((x) => x.id === id);
    if (!d) continue;
    classes.push(d.classification);
    if (!can(ctx, "reports", "export", { datasetId: d.id })) return deny(ctx, "report.export", "Export", target, `${d.name} is outside the datasets you can reach.`);
    if (sec.blocked.includes(d.classification) || d.exportPolicy === "Blocked") {
      raiseAlert(ctx, "Unusual export", "Medium", `${ctx.actor.name} tried to export ${d.name} (${d.classification}).`, ctx.actor.id);
      return deny(ctx, "report.export", "Export", target, `${d.name} is ${d.classification} and never leaves the Hub.`);
    }
    const needs = sec.approvalFor.includes(d.classification) || d.exportPolicy === "Approval required";
    const granted = (ctx.actor.account?.dataGrants ?? []).some((g) => g.datasetId === d.id && g.access === "Export" && g.until > ctx.day);
    if (needs && !granted && !can(ctx, "governance", "manage")) {
      log(ctx, "report.export", "Export", target, "Denied", `${d.name} is ${d.classification}: export needs an approved data access request`);
      return { ok: false, message: `${d.name} is ${d.classification}. Exporting it needs an approved data access request.`, needsApproval: { datasetId: d.id, name: d.name } };
    }
  }
  const worst = ["Restricted", "Confidential", "Internal", "Public"].find((c) => classes.includes(c)) ?? "Public";
  log(ctx, "report.export", "Export", target, "Success", `CSV, ${rows} rows · ${worst}${sec.watermark && worst !== "Public" ? " · watermarked" : ""}`);
  const recent = [...ctx.state.audit, ...ctx.drafts].filter((e) => e.actorId === ctx.actor.id && e.action === "report.export" && e.outcome === "Success" && ctx.now.getTime() - Date.parse(e.at) < 10 * 60_000).length;
  if (recent >= 4 && recent % 4 === 0) raiseAlert(ctx, "Unusual export", "Low", `${ctx.actor.name} exported ${recent} reports in ten minutes.`, ctx.actor.id);
  return ok(`${report} exported with ${rows} rows.`, { data: { watermark: sec.watermark && worst !== "Public" ? `${worst} · exported by ${ctx.actor.name} on ${ctx.day}` : null } });
}

export function publishReport(ctx: Ctx, report: string, cycle: string, justification: string): CommandResult {
  const title = `${report}, cycle ${cycle}`;
  if (!can(ctx, "reports", "create")) return deny(ctx, "report.publish", "Approval", { type: "Report", id: report, label: title }, "Your role cannot request report publication.");
  if (!needsApproval(ctx, "publication")) {
    ctx.state.records.publishedReports.unshift({ id: `RPT-${nextId(ctx, "report", "", 3)}`, title, at: ctx.iso, by: ctx.actor.id });
    log(ctx, "report.publish", "Approval", { type: "Report", id: report, label: title }, "Success", workflowOn(ctx, "publication") ? "Too few other administrators to approve: released directly" : "Publication workflow is off: released directly");
    return ok(`${title} released.`);
  }
  if (cleanText(justification).length < 10) return invalid("Say who the report is for; approvers read this first.");
  const id = `RPT-${nextId(ctx, "report", "", 3)}`;
  const req = openRequest(ctx, "publication", { kind: "publication", target: "report", id, title }, `Publish report: ${title}`, justification);
  return ok(`${req.id} opened: the report is released once both approvals are in.`, { requestId: req.id });
}

export function readNotices(ctx: Ctx, visible: (to: string) => boolean): CommandResult {
  let n = 0;
  for (const x of ctx.state.notices)
    if (visible(x.to) && !x.readBy.includes(ctx.actor.id)) {
      x.readBy.push(ctx.actor.id);
      n++;
    }
  return ok(n ? `${n} marked read.` : "Nothing new.");
}
