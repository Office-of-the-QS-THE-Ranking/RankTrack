import { describe, expect, it } from "vitest";
import { ROLE } from "@/lib/governance/catalog";
import { actorFor } from "@/lib/governance/engine";
import { removeRole } from "@/lib/governance/engine/accounts";
import { addAssignment } from "@/lib/governance/engine/mutations";
import { switchRole } from "@/lib/governance/engine/profile";
import { workspacesOf } from "@/lib/governance/derive";
import { actingGrants, canWith, UNIVERSITY } from "@/lib/governance/rbac";
import { makeCtx, SYSTEM } from "@/lib/governance/engine";
import { ref, world } from "./helpers";

const day = () => new Date().toISOString().slice(0, 10);

/** An Administrator of the Hub who also coordinates a faculty, and a second Administrator to approve things. */
function twoRoles() {
  const w = world();
  const person = w.person("Both", "both@ust.edu.ph", ROLE.admin, w.university.id, false, UNIVERSITY);
  w.person("Other", "other@ust.edu.ph", ROLE.admin, w.university.id, false, UNIVERSITY);
  const coord = addAssignment(makeCtx(w.state, SYSTEM, ref), person, ROLE.coordinator, { units: [w.eng.id], rankingBodies: "all", years: "all", datasets: "all" });
  const admin = person.assignments[0];
  return { w, person, admin, coord };
}

describe("one active role at a time", () => {
  it("acts in the highest role until another is chosen, and only that role counts", () => {
    const { w, person, admin } = twoRoles();
    const grants = actingGrants(person, w.state.units, day());
    expect(grants.map((g) => g.assignmentId)).toEqual([admin.id]);
    expect(workspacesOf(grants)).toEqual(["office"]);
    expect(canWith(grants, "evidence", "submit", { unitId: w.eng.id })).toBe(false);
  });

  it("switches to another held role, drops the first one's permissions, and audits it", () => {
    const { w, person, coord } = twoRoles();
    const ctx = w.ctxFor(person);
    const r = switchRole(ctx, coord.id);
    expect(r.ok).toBe(true);
    expect(person.activeAssignment).toBe(coord.id);
    expect(ctx.drafts.at(-1)).toMatchObject({ action: "role.switch", outcome: "Success", resource: { id: person.id } });
    const actor = actorFor(w.state, person);
    expect(actor.role).toBe("Coordinator");
    expect(workspacesOf(actor.grants)).toEqual(["portal"]);
    expect(canWith(actor.grants, "evidence", "submit", { unitId: w.eng.id })).toBe(true);
    expect(canWith(actor.grants, "config", "edit")).toBe(false);
    expect(canWith(actor.grants, "evidence", "view", { unitId: w.sci.id })).toBe(false);
  });

  it("refuses a role the person doesn't hold, including another account's", () => {
    const { w, person } = twoRoles();
    const stranger = w.person("Stranger", "stranger@ust.edu.ph", ROLE.coordinator, w.sci.id);
    for (const id of [stranger.assignments[0].id, "AS-999", null, { id: "x" }]) expect(switchRole(w.ctxFor(person), id).ok).toBe(false);
    expect(person.activeAssignment).toBeUndefined();
  });

  it("falls back to the highest role when the active one ends or is removed", () => {
    const { w, person, admin, coord } = twoRoles();
    switchRole(w.ctxFor(person), coord.id);
    coord.expires = day();
    expect(actingGrants(person, w.state.units, day()).map((g) => g.assignmentId)).toEqual([admin.id]);
    coord.expires = undefined;
    const other = w.state.accounts.find((a) => a.email === "other@ust.edu.ph")!;
    expect(removeRole(w.ctxFor(other), person.id, coord.id).ok).toBe(true);
    expect(person.activeAssignment).toBeUndefined();
    expect(actingGrants(person, w.state.units, day()).map((g) => g.assignmentId)).toEqual([admin.id]);
  });
});
