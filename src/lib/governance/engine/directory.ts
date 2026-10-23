/*
 * The organizational directory. Units are never deleted: a discontinued college or programme is archived,
 * so rankings data it submitted stays associated with it.
 */
import type { CommandResult } from "../commands";
import { descendants } from "../rbac";
import type { OrgKind, OrgUnit } from "../types";
import { accountById, can, clean, cleanText, deny, invalid, log, ok, unitById, type Ctx } from "./core";
import { createUnit } from "./mutations";
import { openRequest, workflowOn } from "./requests";

const KINDS: OrgKind[] = ["Office", "Faculty", "College", "Institute", "Research Centre", "Department", "Program"];

const res = (u: OrgUnit) => ({ type: "Unit", id: u.id, label: u.name });

const note = (ctx: Ctx, u: OrgUnit, change: string) => u.history.push({ at: ctx.iso, by: ctx.actor.id, change });

export function createUnitCmd(ctx: Ctx, input: { name: string; code: string; kind: OrgKind; parentId: string; justification: string }): CommandResult {
  const parent = unitById(ctx, input.parentId);
  const name = clean(input.name, 120);
  const code = clean(input.code, 16).toUpperCase();
  if (!parent) return invalid("Choose where the unit sits.");
  if (parent.status !== "Active") return invalid(`${parent.name} is archived; units cannot be added under it.`);
  if (name.length < 3) return invalid("Name the unit.");
  if (!/^[A-Z0-9][A-Z0-9-]{1,15}$/.test(code)) return invalid("Use a code of 2–16 letters, digits or dashes, like ENG-CE.");
  if (ctx.state.units.some((u) => u.code.toUpperCase() === code)) return invalid(`Code ${code} is already used by ${ctx.state.units.find((u) => u.code.toUpperCase() === code)!.name}.`);
  if (!KINDS.includes(input.kind)) return invalid("Choose the kind of unit.");
  if (!can(ctx, "directory", "create", { unitId: parent.id }))
    return deny(ctx, "unit.create", "Directory", { type: "Unit", id: code, label: name }, `You cannot add units under ${parent.name}.`);
  if (workflowOn(ctx, "org-unit") && !ctx.actor.superAdmin) {
    if (cleanText(input.justification).length < 10) return invalid("Add a reason for the approvers.");
    const req = openRequest(ctx, "org-unit", { kind: "org-unit", name, code, kind2: input.kind, parentId: parent.id }, `New unit: ${name}`, input.justification);
    return ok(`${name} sent for approval.`, { requestId: req.id });
  }
  const u = createUnit(ctx, { name, code, kind: input.kind, parentId: parent.id });
  log(ctx, "unit.create", "Directory", res(u), "Success", `${input.kind} under ${parent.name}`);
  return ok(`${u.name} added under ${parent.name}.`, { data: u.id });
}

export function updateUnit(ctx: Ctx, id: string, patch: { name?: string; code?: string; adminIds?: string[] }): CommandResult {
  const u = unitById(ctx, id);
  if (!u) return invalid("That unit no longer exists.");
  if (!can(ctx, "directory", "edit", { unitId: u.id })) return deny(ctx, "unit.update", "Directory", res(u), `${u.name} is outside the units you administer.`);
  const changes: string[] = [];
  if (patch.name !== undefined && clean(patch.name, 120) !== u.name) {
    if (clean(patch.name, 120).length < 3) return invalid("Name the unit.");
    changes.push(`renamed from “${u.name}”`);
    u.name = clean(patch.name, 120);
  }
  if (patch.code !== undefined && clean(patch.code, 16).toUpperCase() !== u.code) {
    const code = clean(patch.code, 16).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9-]{1,15}$/.test(code)) return invalid("Codes use 2–16 letters, digits or dashes.");
    if (ctx.state.units.some((x) => x.id !== u.id && x.code.toUpperCase() === code)) return invalid(`Code ${code} is already taken.`);
    changes.push(`code ${u.code} → ${code}`);
    u.code = code;
  }
  if (patch.adminIds) {
    const ids = [...new Set(patch.adminIds)];
    const missing = ids.filter((x) => !accountById(ctx, x));
    if (missing.length) return invalid("One of the administrators no longer exists.");
    const inactive = ids.map((x) => accountById(ctx, x)!).filter((a) => a.status === "Deactivated");
    if (inactive.length) return invalid(`${inactive[0].name} is deactivated.`);
    const before = u.adminIds.join();
    if (ids.join() !== before) {
      changes.push(`administrators: ${ids.map((x) => accountById(ctx, x)!.name).join(", ") || "none"}`);
      u.adminIds = ids;
    }
  }
  if (!changes.length) return ok("No changes.");
  note(ctx, u, changes.join("; "));
  log(ctx, "unit.update", "Directory", res(u), "Success", changes.join("; "));
  return ok(`${u.name} saved.`);
}

export function moveUnit(ctx: Ctx, id: string, parentId: string): CommandResult {
  const u = unitById(ctx, id);
  const parent = unitById(ctx, parentId);
  if (!u || !parent) return invalid("Choose the unit and its new parent.");
  if (!u.parentId) return invalid("The University is the root of the directory.");
  if (!can(ctx, "directory", "manage")) return deny(ctx, "unit.move", "Directory", res(u), "Moving units needs directory management rights.");
  if (descendants(ctx.state.units, u.id).includes(parent.id)) return invalid("A unit cannot move beneath itself.");
  if (parent.status !== "Active") return invalid(`${parent.name} is archived.`);
  if (u.parentId === parent.id) return ok("No changes.");
  const from = unitById(ctx, u.parentId)?.name ?? u.parentId;
  u.parentId = parent.id;
  note(ctx, u, `Moved from ${from} to ${parent.name}`);
  log(ctx, "unit.move", "Directory", res(u), "Success", `${from} → ${parent.name}`);
  return ok(`${u.name} moved under ${parent.name}.`);
}

export function archiveUnit(ctx: Ctx, id: string, reason: string): CommandResult {
  const u = unitById(ctx, id);
  if (!u) return invalid("That unit no longer exists.");
  if (!u.parentId) return invalid("The University cannot be archived.");
  if (!can(ctx, "directory", "manage", { unitId: u.id })) return deny(ctx, "unit.archive", "Directory", res(u), "Archiving needs directory management rights.");
  if (u.status === "Archived") return ok(`${u.name} is already archived.`);
  const why = cleanText(reason, 300);
  if (why.length < 5) return invalid("Say why the unit is archived; the reason stays with its records.");
  const tree = descendants(ctx.state.units, u.id).map((x) => unitById(ctx, x)!).filter((x) => x.status === "Active");
  for (const x of tree) {
    x.status = "Archived";
    x.archivedAt = ctx.iso;
    x.archivedReason = x.id === u.id ? why : `Archived with ${u.name}`;
    note(ctx, x, x.id === u.id ? `Archived: ${why}` : `Archived with ${u.name}`);
  }
  const homed = ctx.state.accounts.filter((a) => a.status === "Active" && tree.some((x) => x.id === a.unitId)).length;
  log(ctx, "unit.archive", "Directory", res(u), "Success", `${why}${tree.length > 1 ? ` · ${tree.length - 1} units beneath it archived` : ""}${homed ? ` · ${homed} active accounts still belong here` : ""}`);
  return ok(
    `${u.name} archived.${homed ? ` ${homed} ${homed === 1 ? "person still belongs" : "people still belong"} here: transfer them in Account Management.` : ""}`,
  );
}

export function reactivateUnit(ctx: Ctx, id: string): CommandResult {
  const u = unitById(ctx, id);
  if (!u) return invalid("That unit no longer exists.");
  if (!can(ctx, "directory", "manage")) return deny(ctx, "unit.reactivate", "Directory", res(u), "Reactivating needs directory management rights.");
  if (u.status === "Active") return ok(`${u.name} is already active.`);
  const parent = u.parentId ? unitById(ctx, u.parentId) : undefined;
  if (parent && parent.status !== "Active") return invalid(`Reactivate ${parent.name} first.`);
  if (u.mergedInto) return invalid("Merged units can't be reactivated. Add a new unit instead.");
  u.status = "Active";
  u.archivedAt = undefined;
  u.archivedReason = undefined;
  note(ctx, u, "Reactivated");
  log(ctx, "unit.reactivate", "Directory", res(u));
  return ok(`${u.name} is active again.`);
}

export function mergeUnit(ctx: Ctx, id: string, intoId: string, reason: string): CommandResult {
  const u = unitById(ctx, id);
  const into = unitById(ctx, intoId);
  if (!u || !into) return invalid("Choose the unit to merge and the unit that absorbs it.");
  if (!u.parentId) return invalid("The University cannot be merged.");
  if (!can(ctx, "directory", "manage")) return deny(ctx, "unit.merge", "Directory", res(u), "Merging units needs directory management rights.");
  if (u.id === into.id || descendants(ctx.state.units, u.id).includes(into.id)) return invalid("A unit cannot merge into itself or into a unit beneath it.");
  if (into.status !== "Active") return invalid(`${into.name} is archived.`);
  const why = cleanText(reason, 300);
  if (why.length < 5) return invalid("Say why the units are merging.");
  // Units beneath the merged one now sit under the unit that absorbs it.
  const children = ctx.state.units.filter((x) => x.parentId === u.id && x.status === "Active");
  for (const c of children) {
    c.parentId = into.id;
    note(ctx, c, `Moved to ${into.name} when ${u.name} merged`);
  }
  // People move with the work; their earlier submissions stay credited to the merged unit.
  const people = ctx.state.accounts.filter((a) => a.unitId === u.id && a.status !== "Deactivated");
  for (const a of people) {
    a.transfers.push({ from: u.id, to: into.id, at: ctx.iso, by: ctx.actor.id });
    a.unitId = into.id;
    for (const asg of a.assignments) if (asg.scope.units !== "all") asg.scope = { ...asg.scope, units: [...new Set(asg.scope.units.map((x) => (x === u.id ? into.id : x)))] };
  }
  u.status = "Archived";
  u.mergedInto = into.id;
  u.archivedAt = ctx.iso;
  u.archivedReason = `Merged into ${into.name}: ${why}`;
  note(ctx, u, `Merged into ${into.name}: ${why}`);
  note(ctx, into, `Absorbed ${u.name}`);
  log(ctx, "unit.merge", "Directory", res(u), "Success", `Into ${into.name} · ${children.length} units and ${people.length} accounts moved · history kept`);
  return ok(`${u.name} merged into ${into.name}.`);
}
