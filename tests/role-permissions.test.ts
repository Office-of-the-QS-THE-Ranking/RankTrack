import { describe, expect, it } from "vitest";
import { HUB_OFFICE, MODULES, ROLE, roleOf } from "@/lib/governance/catalog";
import { checkCommand } from "@/lib/governance/command-guard";
import type { Command } from "@/lib/governance/commands";
import { execute } from "@/lib/governance/engine";
import { canWith, grantsFor, has, rolePermissions, UNIVERSITY } from "@/lib/governance/rbac";
import { fromRows, toRows } from "@/lib/governance/server/db/rows";
import type { PermissionSet } from "@/lib/governance/types";
import { world } from "./helpers";

const edit = (permissions: PermissionSet): Extract<Command, { type: "role.permissions" }> => ({
  type: "role.permissions", id: ROLE.student, scope: "unit", previous: roleOf(ROLE.student)!.permissions, permissions,
});

describe("editable role permissions", () => {
  it("saves as a Rankings Office Administrator, audits it, and applies it to existing holders", () => {
    const w = world();
    const admin = w.person("Office administrator", "office@ust.edu.ph", ROLE.admin, HUB_OFFICE);
    const student = w.person("Student", "student@ust.edu.ph", ROLE.student, w.eng.id);
    const ctx = w.ctxFor(admin);
    const command = edit({ knowledge: ["view", "edit"], reports: ["view"] });
    expect(checkCommand(command).ok).toBe(true);
    expect(execute(ctx, command).ok).toBe(true);
    expect(ctx.drafts.at(-1)).toMatchObject({ action: "role.permissions", category: "Access", outcome: "Success" });
    expect(canWith(w.ctxFor(student).actor.grants, "knowledge", "edit")).toBe(true);
    expect(canWith(grantsFor(student, w.state.units, ctx.day, w.state.config.rolePermissions), "knowledge", "edit")).toBe(true);
    expect(has(rolePermissions(ROLE.student, student.assignments[0].scope, w.state.config.rolePermissions), "knowledge", "edit")).toBe(true);
  });

  it("refuses unit administrators, other offices, coordinators, and inactive or expired Office administrators", () => {
    const w = world();
    const people = [
      w.person("Unit admin", "unit@ust.edu.ph", ROLE.admin, w.eng.id),
      w.person("Other office admin", "other@ust.edu.ph", ROLE.admin, w.university.id, false, UNIVERSITY),
      w.person("Office coordinator", "coordinator@ust.edu.ph", ROLE.coordinator, HUB_OFFICE),
      w.person("Suspended", "suspended@ust.edu.ph", ROLE.admin, HUB_OFFICE),
      w.person("Expired", "expired@ust.edu.ph", ROLE.admin, HUB_OFFICE),
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
    const admin = w.person("Office administrator", "office@ust.edu.ph", ROLE.admin, HUB_OFFICE);
    const coordinator = w.person("Coordinator", "coord@ust.edu.ph", ROLE.coordinator, HUB_OFFICE);
    expect(execute(w.ctxFor(admin), {
      ...edit({ roles: ["view", "edit", "manage"] }), id: ROLE.coordinator, previous: roleOf(ROLE.coordinator)!.permissions,
    }).ok).toBe(true);
    expect(execute(w.ctxFor(coordinator), edit({})).ok).toBe(false);
  });

  it("requires the Administrator assignment to be active", () => {
    const w = world();
    const admin = w.person("Office administrator", "office@ust.edu.ph", ROLE.admin, HUB_OFFICE);
    admin.assignments.push({ ...admin.assignments[0], id: "coordinator-assignment", roleId: ROLE.coordinator });
    admin.activeAssignment = "coordinator-assignment";
    expect(execute(w.ctxFor(admin), edit({})).ok).toBe(false);
  });

  it("edits unit and University-wide Administrator permissions independently and keeps role management available", () => {
    const w = world();
    const admin = w.person("Office administrator", "office@ust.edu.ph", ROLE.admin, HUB_OFFICE);
    const unitAdmin = w.person("Faculty administrator", "faculty@ust.edu.ph", ROLE.admin, w.eng.id);
    const previous = roleOf(ROLE.admin)!;
    expect(execute(w.ctxFor(admin), { ...edit({ reports: ["view"] }), id: ROLE.admin, previous: previous.permissions }).ok).toBe(true);
    expect(canWith(w.ctxFor(unitAdmin).actor.grants, "evidence", "view")).toBe(false);
    expect(canWith(w.ctxFor(admin).actor.grants, "evidence", "view")).toBe(true);
    expect(execute(w.ctxFor(admin), { ...edit({}), id: ROLE.admin, scope: "university", previous: previous.universityPermissions! }).ok).toBe(true);
    expect(canWith(w.ctxFor(admin).actor.grants, "evidence", "view")).toBe(false);
    for (const action of MODULES.find((m) => m.key === "roles")!.actions)
      expect(canWith(w.ctxFor(admin).actor.grants, "roles", action)).toBe(true);
    expect(execute(w.ctxFor(admin), edit({})).ok).toBe(true);
  });

  it("refuses stale edits without overwriting newer permissions", () => {
    const w = world();
    const admin = w.person("Office administrator", "office@ust.edu.ph", ROLE.admin, HUB_OFFICE);
    expect(execute(w.ctxFor(admin), edit({ knowledge: ["view", "edit"] })).ok).toBe(true);
    expect(execute(w.ctxFor(admin), edit({}))).toMatchObject({ ok: false, message: expect.stringMatching(/changed while/) });
    expect(w.state.config.rolePermissions?.student?.permissions).toEqual({ knowledge: ["view", "edit"] });
  });

  it("rejects unknown roles, scopes, modules and actions without changing the configuration", () => {
    const w = world();
    const admin = w.person("Office administrator", "office@ust.edu.ph", ROLE.admin, HUB_OFFICE);
    for (const patch of [
      { id: "unknown" }, { scope: "unknown" }, { scope: "university" },
      { permissions: { unknown: ["view"] } }, { permissions: { knowledge: ["delete"] } },
      { permissions: null }, { previous: { knowledge: "view" } },
    ]) {
      expect(execute(w.ctxFor(admin), { ...edit({}), ...patch } as Command).ok).toBe(false);
      expect(w.state.config.rolePermissions).toBeUndefined();
    }
  });

  it("persists overrides through the relational store without changing catalog defaults", () => {
    const w = world();
    const admin = w.person("Office administrator", "office@ust.edu.ph", ROLE.admin, HUB_OFFICE);
    const defaults = structuredClone(roleOf(ROLE.student));
    expect(execute(w.ctxFor(admin), edit({ knowledge: ["view", "edit"] })).ok).toBe(true);
    const { auditHead: _head, recentAudit: _audit, ...stored } = w.state;
    const restored = fromRows(toRows(stored));
    expect(restored.config.rolePermissions).toEqual(w.state.config.rolePermissions);
    expect(roleOf(ROLE.student)).toEqual(defaults);
  });
});
