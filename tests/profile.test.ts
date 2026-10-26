import { describe, expect, it } from "vitest";
import { ROLE } from "@/lib/governance/catalog";
import { GUEST, makeCtx } from "@/lib/governance/engine";
import { updateProfile } from "@/lib/governance/engine/profile";
import { ref, world } from "./helpers";

describe("self-service profile settings", () => {
  it("lets a contributor edit only their own name and title, ignoring access fields", () => {
    const w = world();
    const own = w.person("Own User", "own@ust.edu.ph", ROLE.coordinator, w.eng.id);
    const other = w.person("Other User", "other@ust.edu.ph", ROLE.coordinator, w.sci.id);
    const assignments = structuredClone(own.assignments);
    const ctx = w.ctxFor(own);
    const result = updateProfile(ctx, { name: "  New   Name  ", title: "Coordinator", id: other.id, unitId: w.sci.id, email: "changed@ust.edu.ph", assignments: [] });
    expect(result.ok).toBe(true);
    expect(own.name).toBe("New Name");
    expect(own.title).toBe("Coordinator");
    expect(own.email).toBe("own@ust.edu.ph");
    expect(own.unitId).toBe(w.eng.id);
    expect(own.assignments).toEqual(assignments);
    expect(other.name).toBe("Other User");
    expect(ctx.drafts[0]).toMatchObject({ action: "profile.update", resource: { id: own.id } });
  });

  it("refuses missing and inactive accounts", () => {
    const w = world();
    expect(updateProfile(makeCtx(w.state, GUEST, ref), { name: "New Name", title: "" }).ok).toBe(false);
    const own = w.person("Own User", "own@ust.edu.ph", ROLE.coordinator, w.eng.id);
    own.status = "Suspended";
    expect(updateProfile(w.ctxFor(own), { name: "New Name", title: "" }).ok).toBe(false);
    expect(own.name).toBe("Own User");
  });

  it.each([null, {}, { name: "   ", title: "" }, { name: "A".repeat(161), title: "" }, { name: "New Name", title: "A".repeat(161) }, { name: 123, title: "" }])("rejects malformed details without changing the account: %j", (input) => {
    const w = world();
    const own = w.person("Own User", "own@ust.edu.ph", ROLE.coordinator, w.eng.id);
    const before = structuredClone(own);
    expect(updateProfile(w.ctxFor(own), input).ok).toBe(false);
    expect(own).toEqual(before);
  });
});
