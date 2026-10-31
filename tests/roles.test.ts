import { describe, expect, it } from "vitest";
import { HUB_OFFICE, ROLE } from "@/lib/governance/catalog";
import { invitationUnitMatchesRole } from "@/lib/governance/invitation";
import { canWith, grantsFor, roleScope, runsHub, UNIVERSITY } from "@/lib/governance/rbac";
import { world } from "./helpers";

describe("four roles", () => {
  it("lets Administrators and Coordinators work in an office or a college, and keeps Students with the Office in neither", () => {
    for (const role of [ROLE.admin, ROLE.coordinator]) {
      expect(invitationUnitMatchesRole({ id: "x", kind: "Office" }, role)).toBe(true);
      expect(invitationUnitMatchesRole({ id: "x", kind: "Faculty" }, role)).toBe(true);
    }
    expect(invitationUnitMatchesRole({ id: "x", kind: "College" }, ROLE.student)).toBe(false);
    expect(invitationUnitMatchesRole({ id: "x", kind: "Office" }, ROLE.student)).toBe(false);
    expect(invitationUnitMatchesRole({ id: HUB_OFFICE, kind: "Office" }, ROLE.student)).toBe(true);
    expect(invitationUnitMatchesRole({ id: "x", kind: "Research Centre" }, ROLE.coordinator)).toBe(false);
    expect(roleScope(ROLE.student, "faculty-of-engineering").units).toEqual([HUB_OFFICE]);
  });

  it("gives an Administrator the whole University only in the Rankings Office", () => {
    expect(roleScope(ROLE.admin, HUB_OFFICE)).toEqual(UNIVERSITY);
    expect(roleScope(ROLE.admin, "faculty-of-engineering").units).toEqual(["faculty-of-engineering"]);
    expect(roleScope(ROLE.coordinator, HUB_OFFICE).units).toEqual([HUB_OFFICE]);
  });

  it("keeps the Hub's own settings from an Administrator of a college", () => {
    const w = world();
    const dean = w.person("Dean", "dean@ust.edu.ph", ROLE.admin, w.eng.id);
    const hub = w.person("Hub", "hub@ust.edu.ph", ROLE.admin, w.university.id, false, UNIVERSITY);
    const deanGrants = grantsFor(dean, w.state.units, new Date().toISOString().slice(0, 10));
    const hubGrants = grantsFor(hub, w.state.units, new Date().toISOString().slice(0, 10));
    expect(dean.assignments.some(runsHub)).toBe(false);
    expect(hub.assignments.some(runsHub)).toBe(true);
    expect(canWith(deanGrants, "config", "edit")).toBe(false);
    expect(canWith(deanGrants, "evidence", "view", { unitId: w.eng.id })).toBe(true);
    expect(canWith(deanGrants, "evidence", "view", { unitId: w.sci.id })).toBe(false);
    expect(canWith(deanGrants, "evidence", "submit", { unitId: w.eng.id })).toBe(false);
    expect(canWith(hubGrants, "config", "edit")).toBe(true);
  });

  it("gives Students (organization secretaries) the Student Portal's forms and nothing of the unit's", () => {
    const w = world();
    const student = w.person("Student", "student@ust.edu.ph", ROLE.student, w.eng.id);
    const grants = grantsFor(student, w.state.units, new Date().toISOString().slice(0, 10));
    expect(canWith(grants, "forms", "submit")).toBe(true);
    expect(canWith(grants, "forms", "create")).toBe(true);
    expect(canWith(grants, "knowledge", "view")).toBe(false);
    expect(canWith(grants, "reports", "view")).toBe(false);
    expect(canWith(grants, "evidence", "view", { unitId: w.eng.id })).toBe(false);
    expect(canWith(grants, "evidence", "submit", { unitId: w.eng.id })).toBe(false);
    expect(canWith(grants, "stories", "create", { unitId: w.eng.id })).toBe(false);
  });
});
