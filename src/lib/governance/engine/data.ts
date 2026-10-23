/*
 * Data governance: ownership and stewardship, classification, retention, versions, quality rules,
 * duplicates and the University-wide data dictionary.
 */
import { DICTIONARY } from "@/lib/data";
import type { CommandResult } from "../commands";
import { daysSince } from "../derive";
import { findDuplicates, runRules } from "../quality";
import { evidenceById, evidenceList, storyList } from "../records";
import type { Classification, Dataset, ExportPolicy } from "../types";
import { accountById, can, cleanText, deny, invalid, log, ok, unitById, type Ctx } from "./core";

const res = (d: Dataset) => ({ type: "Dataset", id: d.id, label: d.name });

const RANK: Record<Classification, number> = { Public: 0, Internal: 1, Confidential: 2, Restricted: 3 };

export function updateDataset(
  ctx: Ctx,
  id: string,
  patch: { classification?: Classification; stewardId?: string; ownerUnitId?: string; retention?: { years: number; then: "Archive" | "Review" | "Dispose" }; exportPolicy?: ExportPolicy; justification: string },
): CommandResult {
  const d = ctx.state.datasets.find((x) => x.id === id);
  if (!d) return invalid("That dataset no longer exists.");
  if (!can(ctx, "governance", "edit", { datasetId: d.id })) return deny(ctx, "dataset.update", "Data", res(d), `You are not a steward for ${d.name}.`);
  const changes: string[] = [];
  const why = cleanText(patch.justification, 400);
  if (patch.classification && patch.classification !== d.classification) {
    if (!can(ctx, "governance", "manage")) return deny(ctx, "dataset.classify", "Data", res(d), "Reclassifying data needs data governance management rights.");
    if (d.locked) return invalid(`${d.name} cannot be reclassified: ${d.locked}`);
    if (why.length < 10) return invalid("Explain the reclassification; it is kept with the dataset's history.");
    if (patch.classification === "Public" && d.personal) return invalid(`${d.name} contains personal data and cannot be Public.`);
    const down = RANK[patch.classification] < RANK[d.classification];
    changes.push(`classification ${d.classification} → ${patch.classification}${down ? " (lowered)" : ""}`);
    d.classification = patch.classification;
    if (patch.classification === "Restricted") d.exportPolicy = "Blocked";
    if (patch.classification === "Confidential" && d.exportPolicy === "Allowed") d.exportPolicy = "Approval required";
  }
  if (patch.exportPolicy && patch.exportPolicy !== d.exportPolicy) {
    if (d.classification === "Restricted" && patch.exportPolicy !== "Blocked") return invalid("Restricted data is never exported.");
    if (d.classification === "Confidential" && patch.exportPolicy === "Allowed") return invalid("Confidential data needs approval before export.");
    changes.push(`export ${d.exportPolicy} → ${patch.exportPolicy}`);
    d.exportPolicy = patch.exportPolicy;
  }
  if (patch.stewardId && patch.stewardId !== d.stewardId) {
    const s = accountById(ctx, patch.stewardId);
    if (!s || s.status !== "Active") return invalid("Stewards must be active accounts.");
    changes.push(`steward ${accountById(ctx, d.stewardId)?.name ?? d.stewardId} → ${s.name}`);
    d.stewardId = s.id;
  }
  if (patch.ownerUnitId && patch.ownerUnitId !== d.ownerUnitId) {
    const u = unitById(ctx, patch.ownerUnitId);
    if (!u || u.status !== "Active") return invalid("Owners must be active units.");
    changes.push(`owner ${unitById(ctx, d.ownerUnitId)?.name ?? d.ownerUnitId} → ${u.name}`);
    d.ownerUnitId = u.id;
  }
  if (patch.retention && (patch.retention.years !== d.retention.years || patch.retention.then !== d.retention.then)) {
    const y = Math.round(patch.retention.years);
    if (y < 1 || y > 50) return invalid("Retention must be between 1 and 50 years.");
    changes.push(`retention ${d.retention.years} y then ${d.retention.then.toLowerCase()} → ${y} y then ${patch.retention.then.toLowerCase()}`);
    d.retention = { years: y, then: patch.retention.then };
  }
  if (!changes.length) return ok("No changes.");
  d.version += 1;
  d.versions.unshift({ v: d.version, at: ctx.iso, by: ctx.actor.id, note: `Governance: ${changes.join("; ")}${why ? ` (${why})` : ""}` });
  d.updatedAt = ctx.iso;
  log(ctx, changes.some((c) => c.startsWith("classification")) ? "dataset.classify" : "dataset.update", "Data", res(d), "Success", changes.join("; ") + (why ? ` · ${why}` : ""));
  const surface = d.publicSurface && changes.some((c) => c.startsWith("classification"));
  return ok(`${d.name} saved.${surface ? (d.classification === "Public" ? " It can appear on the website again." : " It is now hidden from the website.") : ""}`);
}

export function recordVersion(ctx: Ctx, id: string, text: string): CommandResult {
  const d = ctx.state.datasets.find((x) => x.id === id);
  if (!d) return invalid("That dataset no longer exists.");
  if (!can(ctx, "governance", "edit", { datasetId: d.id })) return deny(ctx, "dataset.version", "Data", res(d), `You are not a steward for ${d.name}.`);
  const n = cleanText(text, 300);
  if (n.length < 5) return invalid("Describe what changed in this version.");
  d.version += 1;
  d.versions.unshift({ v: d.version, at: ctx.iso, by: ctx.actor.id, note: n });
  d.updatedAt = ctx.iso;
  log(ctx, "dataset.version", "Data", res(d), "Success", `Version ${d.version}: ${n}`);
  return ok(`Version ${d.version} added.`);
}

export function toggleRule(ctx: Ctx, id: string, enabled: boolean): CommandResult {
  const r = ctx.state.rules.find((x) => x.id === id);
  if (!r) return invalid("That rule no longer exists.");
  const target = { type: "Quality rule", id: r.id, label: r.name };
  if (!can(ctx, "governance", "edit", { datasetId: r.datasetId })) return deny(ctx, "rule.toggle", "Data", target, "You are not a steward for this dataset.");
  if (r.enabled === enabled) return ok("No changes.");
  r.enabled = enabled;
  log(ctx, "rule.toggle", "Data", target, "Success", enabled ? "Switched on" : "Switched off");
  return ok(`${r.name} ${enabled ? "switched on" : "switched off"}.`);
}

export function runChecks(ctx: Ctx): CommandResult {
  if (!can(ctx, "governance", "view")) return deny(ctx, "rule.run", "Data", { type: "Quality rules", id: "all", label: "All datasets" }, "Your role cannot run quality checks.");
  const results = runRules(ctx.state.rules, evidenceList(ctx.state), storyList(ctx.state), ctx.state.duplicates);
  for (const r of ctx.state.rules) r.lastRun = ctx.iso;
  const failing = results.filter((r) => r.status === "Failing").length;
  const warning = results.filter((r) => r.status === "Warning").length;
  log(ctx, "rule.run", "Data", { type: "Quality rules", id: "all", label: `${results.length} rules` }, "Success", `${failing} failing · ${warning} warnings`);
  return ok(failing || warning ? `Checks done: ${failing} failing, ${warning} warnings.` : "Checks done: all passing.");
}

export function resolveDuplicate(ctx: Ctx, key: string, decision: "Merged" | "Dismissed", keep?: string): CommandResult {
  const [a, b] = key.split("|");
  const pair = findDuplicates(evidenceList(ctx.state), []).find((p) => p.key === key);
  const target = { type: "Duplicate", id: key, label: `${a} and ${b}` };
  if (!pair) return invalid("Those records are no longer a likely duplicate.");
  if (!can(ctx, "governance", "edit", { datasetId: "DS-EVIDENCE" }) && !can(ctx, "evidence", "approve")) return deny(ctx, "duplicate.resolve", "Data", target, "Your role cannot resolve duplicates.");
  if (ctx.state.duplicates.some((d) => d.key === key)) return ok("Already resolved.");
  if (decision === "Merged") {
    const kept = keep === b ? b : a;
    const drop = kept === a ? b : a;
    const rec = evidenceById(ctx.state, drop)!;
    ctx.state.records.evidence[drop] = {
      ...rec,
      status: "Not applicable",
      comments: [...rec.comments, { by: ctx.actor.name, role: "Data governance", date: ctx.day, text: `Merged into ${kept}: the same evidence was submitted twice. Mappings and credit stay with ${kept}.` }],
    };
    ctx.state.duplicates.push({ key, decision, keep: kept, by: ctx.actor.id, at: ctx.iso });
    log(ctx, "duplicate.merge", "Data", target, "Success", `Kept ${kept}; ${drop} marked not applicable`);
    return ok(`Merged: ${kept} kept, ${drop} closed as a duplicate.`);
  }
  ctx.state.duplicates.push({ key, decision, by: ctx.actor.id, at: ctx.iso });
  log(ctx, "duplicate.dismiss", "Data", target, "Success", "Not a duplicate");
  return ok("Marked as not a duplicate.");
}

export function updateTerm(ctx: Ctx, input: { term: string; definition?: string; unitOfMeasure?: string; stewardId?: string; datasetId?: string }): CommandResult {
  const meta = ctx.state.terms.find((t) => t.term === input.term);
  const base = DICTIONARY.find((d) => d.term === input.term);
  if (!meta || !base) return invalid("That term is not in the dictionary.");
  const target = { type: "Dictionary term", id: meta.term, label: meta.term };
  if (!can(ctx, "governance", "edit", { datasetId: meta.datasetId }) && !can(ctx, "knowledge", "edit")) return deny(ctx, "term.update", "Data", target, "Your role cannot edit the data dictionary.");
  const changes: string[] = [];
  if (input.definition !== undefined) {
    const def = cleanText(input.definition, 600);
    if (def.length < 10) return invalid("Write a definition of at least a sentence.");
    if (def !== (meta.definition ?? base.definition)) {
      meta.definition = def;
      changes.push("definition");
    }
  }
  if (input.unitOfMeasure !== undefined && input.unitOfMeasure.trim() !== meta.unitOfMeasure) {
    meta.unitOfMeasure = input.unitOfMeasure.trim().slice(0, 40);
    changes.push("unit of measure");
  }
  if (input.stewardId && input.stewardId !== meta.stewardId) {
    if (!accountById(ctx, input.stewardId)) return invalid("Choose an active steward.");
    meta.stewardId = input.stewardId;
    changes.push("steward");
  }
  if (input.datasetId && input.datasetId !== meta.datasetId) {
    if (!ctx.state.datasets.some((d) => d.id === input.datasetId)) return invalid("Choose a dataset.");
    meta.datasetId = input.datasetId;
    changes.push("dataset");
  }
  if (!changes.length) return ok("No changes.");
  meta.updatedAt = ctx.iso;
  log(ctx, "term.update", "Data", target, "Success", `Changed ${changes.join(", ")}`);
  return ok(`${meta.term} saved.`);
}

/** Review each dataset against its retention period. Versions past it are listed for the steward to act on. */
export function runRetention(ctx: Ctx): CommandResult {
  if (!can(ctx, "governance", "manage")) return deny(ctx, "retention.run", "Data", { type: "Retention", id: "all", label: "All datasets" }, "Retention reviews need data governance management rights.");
  const due = ctx.state.datasets.flatMap((d) =>
    d.versions.filter((v) => daysSince(v.at, ctx.now) > d.retention.years * 365).map((v) => ({ dataset: d.name, version: v.v, then: d.retention.then })),
  );
  log(ctx, "retention.run", "Data", { type: "Retention", id: "all", label: `${ctx.state.datasets.length} datasets` }, "Success", due.length ? `${due.length} versions past retention` : "Nothing past retention");
  return ok(due.length ? `${due.length} ${due.length === 1 ? "version is" : "versions are"} past retention.` : "Nothing is past retention.", { data: due });
}
