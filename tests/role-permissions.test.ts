import { describe, expect, it } from "vitest";
import { COMMAND_CONTROL_MODULES, HUB_OFFICE, MODULES, ROLE, roleOf } from "@/lib/governance/catalog";
import { checkCommand } from "@/lib/governance/command-guard";
import type { Command } from "@/lib/governance/commands";
import { execute } from "@/lib/governance/engine";
import { canWith, grantsFor, has, rolePermissions, UNIVERSITY } from "@/lib/governance/rbac";
import { fromRows, toRows } from "@/lib/governance/server/db/rows";
import type { PermissionSet } from "@/lib/governance/types";
import { world } from "./helpers";

const edit = (permissions: PermissionSet): Extract<Command, { type: "role.permissions" }> => ({
  type: "role.permissions", id: ROLE.student, previous: roleOf(ROLE.student)!.permissions, permissions,
});

describe("editable role permissions", () => {
  it("saves as a Super Administrator, audits it, and applies it to existing holders", () => {
    const w = world();
    const admin = w.person("Super administrator", "office@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE);
    const student = w.person("Student", "student@ust.edu.ph", ROLE.student, w.eng.id);
    const ctx = w.ctxFor(admin);
    const command = edit({ knowledge: ["view", "edit"], reports: ["view"] });
    expect(checkCommand(command).ok).toBe(true);
    expect(execute(ctx, command).ok).toBe(true);
    expect(ctx.drafts.at(-1)).toMatchObject({ action: "role.permissions", category: "Access", outcome: "Success" });
    expect(canWith(w.ctxFor(student).actor.grants, "knowledge", "edit")).toBe(true);
    expect(canWith(grantsFor(student, w.state.units, ctx.day, w.state.config.rolePermissions), "knowledge", "edit")).toBe(true);
    expect(has(rolePermissions(ROLE.student, undefined, w.state.config.rolePermissions), "knowledge", "edit")).toBe(true);
  });

  it("refuses Administrators, coordinators, and inactive or expired Super Administrators", () => {
    const w = world();
    const people = [
      w.person("Unit admin", "unit@ust.edu.ph", ROLE.admin, w.eng.id),
      w.person("Other office admin", "other@ust.edu.ph", ROLE.superAdmin, w.university.id, false, UNIVERSITY, "specialist"),
      w.person("Office coordinator", "coordinator@ust.edu.ph", ROLE.coordinator, HUB_OFFICE),
      w.person("Suspended", "suspended@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE),
      w.person("Expired", "expired@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE),
      w.person("Office administrator", "officeadmin@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE, false, UNIVERSITY, "specialist"),
    ];
    people[3].status = "Suspended";
    people[4].assignments[0].expires = "2000-01-01";
    for (const person of people) {
      expect(execute(w.ctxFor(person), edit({})).ok).toBe(false);
      expect(w.state.config.rolePermissions).toBeUndefined();
    }
  });

  it("does not let a coordinator edit roles even when their configured permissions include roles.manage", () => {
    const w = world();
    const admin = w.person("Super administrator", "office@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE);
    const coordinator = w.person("Coordinator", "coord@ust.edu.ph", ROLE.coordinator, HUB_OFFICE);
    expect(execute(w.ctxFor(admin), {
      ...edit({ roles: ["view", "edit", "manage"] }), id: ROLE.coordinator, previous: roleOf(ROLE.coordinator)!.permissions,
    }).ok).toBe(true);
    expect(execute(w.ctxFor(coordinator), edit({})).ok).toBe(false);
  });

  it("requires the Super Administrator assignment to be active", () => {
    const w = world();
    const admin = w.person("Super administrator", "office@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE);
    admin.assignments.push({ ...admin.assignments[0], id: "coordinator-assignment", roleId: ROLE.coordinator });
    admin.activeAssignment = "coordinator-assignment";
    expect(execute(w.ctxFor(admin), edit({})).ok).toBe(false);
  });

  it("edits the Administrator's permissions, never their role management, and leaves the Office's positions fixed", () => {
    const w = world();
    const owner = w.person("Director", "office@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE, false, undefined, "director");
    const specialist = w.person("Ranking Specialist", "specialist@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE, false, UNIVERSITY, "specialist");
    const unitAdmin = w.person("Faculty administrator", "faculty@ust.edu.ph", ROLE.admin, w.eng.id);
    const previous = roleOf(ROLE.admin)!;
    expect(execute(w.ctxFor(owner), { ...edit({ reports: ["view"], roles: ["view", "edit", "manage"] }), id: ROLE.admin, previous: previous.permissions }).ok).toBe(true);
    expect(canWith(w.ctxFor(unitAdmin).actor.grants, "evidence", "view")).toBe(false);
    expect(canWith(w.ctxFor(unitAdmin).actor.grants, "roles", "view")).toBe(false);
    expect(canWith(w.ctxFor(specialist).actor.grants, "evidence", "view")).toBe(true);
    expect(canWith(w.ctxFor(specialist).actor.grants, "roles", "view")).toBe(true);
    expect(canWith(w.ctxFor(specialist).actor.grants, "roles", "edit")).toBe(false);
    for (const action of MODULES.find((m) => m.key === "roles")!.actions)
      expect(canWith(w.ctxFor(owner).actor.grants, "roles", action)).toBe(true);
    expect(execute(w.ctxFor(specialist), edit({})).ok).toBe(false);
    expect(execute(w.ctxFor(owner), { ...edit({}), id: ROLE.superAdmin, previous: roleOf(ROLE.superAdmin)!.permissions }).ok).toBe(false);
  });

  it("lets only the Director appoint the Office's people, and keeps Administrators to one unit", () => {
    const w = world();
    const owner = w.person("Director", "office@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE, false, undefined, "director");
    const specialist = w.person("Ranking Specialist", "specialist@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE, false, UNIVERSITY, "specialist");
    const target = w.person("Coordinator", "coord@ust.edu.ph", ROLE.coordinator, w.eng.id);
    const add = (roleId: string, scope = UNIVERSITY, position?: string) => ({ type: "assignment.add", accountId: target.id, roleId, scope, position }) as Command;
    expect(execute(w.ctxFor(specialist), add(ROLE.superAdmin, UNIVERSITY, "staff")).ok).toBe(false);
    expect(execute(w.ctxFor(owner), add(ROLE.admin)).ok).toBe(false);
    expect(execute(w.ctxFor(owner), add(ROLE.admin, { ...UNIVERSITY, units: [HUB_OFFICE] })).ok).toBe(false);
    expect(execute(w.ctxFor(specialist), add(ROLE.admin, { ...UNIVERSITY, units: [w.eng.id] })).ok).toBe(true);
    expect(execute(w.ctxFor(specialist), { type: "account.status", id: owner.id, status: "Suspended", reason: "Testing the guard" } as Command).ok).toBe(false);
    expect(execute(w.ctxFor(owner), add(ROLE.superAdmin)).ok).toBe(false);
    const fresh = w.person("New hire", "new@ust.edu.ph", ROLE.coordinator, w.eng.id);
    expect(execute(w.ctxFor(owner), { type: "assignment.add", accountId: fresh.id, roleId: ROLE.superAdmin, scope: UNIVERSITY, position: "staff" } as Command).ok).toBe(true);
    // straight away, or through privilege escalation, the position goes with the role
    const added = fresh.assignments.find((x) => x.roleId === ROLE.superAdmin);
    const asked = w.state.requests.find((r) => r.payload.kind === "privilege-escalation" && r.payload.accountId === fresh.id);
    expect(added?.position ?? (asked?.payload as { position?: string } | undefined)?.position).toBe("staff");
  });

  it("ranks the Office's positions: Director over Ranking Specialist over Staff", () => {
    const w = world();
    const day = new Date().toISOString().slice(0, 10);
    const at = (position: "director" | "specialist" | "staff") =>
      grantsFor(w.person(position, `${position}@ust.edu.ph`, ROLE.superAdmin, HUB_OFFICE, false, undefined, position), w.state.units, day);
    const [director, specialist, staff] = [at("director"), at("specialist"), at("staff")];
    expect(director[0].roleName).toBe("Super Administrator · Director");
    expect(canWith(director, "roles", "edit")).toBe(true);
    expect(canWith(specialist, "roles", "edit")).toBe(false);
    expect(canWith(specialist, "accounts", "create")).toBe(true);
    expect(canWith(specialist, "workflows", "approve")).toBe(true);
    expect(canWith(staff, "accounts", "create")).toBe(false);
    expect(canWith(staff, "workflows", "approve")).toBe(false);
    expect(canWith(staff, "config", "edit")).toBe(false);
    for (const g of [director, specialist, staff]) {
      expect(canWith(g, "evidence", "approve")).toBe(true);
      expect(canWith(g, "dashboard", "view")).toBe(true);
      expect(canWith(g, "evidence", "submit")).toBe(false);
    }
  });

  it("keeps the Director last: the only active one can't be suspended or lose the position", () => {
    const w = world();
    const owner = w.person("Director", "office@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE, false, undefined, "director");
    const other = w.person("Director two", "two@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE, false, undefined, "director");
    other.status = "Suspended";
    expect(execute(w.ctxFor(other), { type: "assignment.remove", accountId: owner.id, assignmentId: owner.assignments[0].id } as Command).ok).toBe(false);
    other.status = "Active";
    expect(execute(w.ctxFor(other), { type: "account.status", id: owner.id, status: "Suspended", reason: "Testing the guard" } as Command).ok).toBe(true);
    expect(execute(w.ctxFor(owner), { type: "account.status", id: other.id, status: "Suspended", reason: "Testing the guard" } as Command).ok).toBe(false);
  });

  it("never gives another role an Command & Control module, whatever is saved", () => {
    const w = world();
    const owner = w.person("Director", "office@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE, false, undefined, "director");
    const unitAdmin = w.person("Faculty administrator", "faculty@ust.edu.ph", ROLE.admin, w.eng.id);
    const everything = Object.fromEntries(MODULES.map((m) => [m.key, [...m.actions]])) as PermissionSet;
    for (const id of [ROLE.admin, ROLE.coordinator, ROLE.student, ROLE.external])
      expect(execute(w.ctxFor(owner), { ...edit(everything), id, previous: roleOf(id, w.state.config.rolePermissions)!.permissions }).ok).toBe(true);
    for (const id of [ROLE.admin, ROLE.coordinator, ROLE.student, ROLE.external])
      for (const m of COMMAND_CONTROL_MODULES) expect(roleOf(id, w.state.config.rolePermissions)!.permissions[m]).toBeUndefined();
    // and permissions saved before this rule are ignored too
    expect(roleOf(ROLE.admin, { administrator: { permissions: { accounts: ["view", "edit"], units: ["view"] } } })!.permissions).toEqual({ units: ["view"] });
    for (const m of COMMAND_CONTROL_MODULES) expect(canWith(w.ctxFor(unitAdmin).actor.grants, m, "view")).toBe(false);
    for (const m of COMMAND_CONTROL_MODULES.filter((x) => x !== "ai" && x !== "backup" && x !== "security")) expect(canWith(w.ctxFor(owner).actor.grants, m, "view")).toBe(true);
  });

  it("refuses stale edits without overwriting newer permissions", () => {
    const w = world();
    const admin = w.person("Super administrator", "office@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE);
    expect(execute(w.ctxFor(admin), edit({ knowledge: ["view", "edit"] })).ok).toBe(true);
    expect(execute(w.ctxFor(admin), edit({}))).toMatchObject({ ok: false, message: expect.stringMatching(/changed while/) });
    expect(w.state.config.rolePermissions?.student?.permissions).toEqual({ knowledge: ["view", "edit"] });
  });

  it("rejects unknown roles, modules and actions without changing the configuration", () => {
    const w = world();
    const admin = w.person("Super administrator", "office@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE);
    for (const patch of [
      { id: "unknown" },
      { permissions: { unknown: ["view"] } }, { permissions: { knowledge: ["delete"] } },
      { permissions: null }, { previous: { knowledge: "view" } },
    ]) {
      expect(execute(w.ctxFor(admin), { ...edit({}), ...patch } as Command).ok).toBe(false);
      expect(w.state.config.rolePermissions).toBeUndefined();
    }
  });

  it("persists overrides through the relational store without changing catalog defaults", () => {
    const w = world();
    const admin = w.person("Super administrator", "office@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE);
    const defaults = structuredClone(roleOf(ROLE.student));
    expect(execute(w.ctxFor(admin), edit({ knowledge: ["view", "edit"] })).ok).toBe(true);
    const { auditHead: _head, recentAudit: _audit, ...stored } = w.state;
    const restored = fromRows(toRows(stored));
    expect(restored.config.rolePermissions).toEqual(w.state.config.rolePermissions);
    expect(roleOf(ROLE.student)).toEqual(defaults);
  });
});
