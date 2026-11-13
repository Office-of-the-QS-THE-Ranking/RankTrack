import { describe, expect, it } from "vitest";
import { ROLE } from "@/lib/governance/catalog";
import { execute, makeCtx, SYSTEM } from "@/lib/governance/engine";
import { createUnit } from "@/lib/governance/engine/mutations";
import { readPerson, type PersonInput } from "@/lib/governance/person-details";
import { UNIVERSITY, unitScope } from "@/lib/governance/rbac";
import type { InviteInput } from "@/lib/governance/commands";
import { ref, world } from "./helpers";

/** A world with the Office that sponsors guests, and its Director to invite from. */
function office() {
  const w = world();
  const hub = createUnit(makeCtx(w.state, SYSTEM, ref), { name: "Office of QS/THE Rankings", code: "RANKINGS-OFFICE", kind: "Office", parentId: w.university.id });
  const admin = w.person("Maria Santos", "admin@ust.edu.ph", ROLE.superAdmin, hub.id, false, UNIVERSITY);
  const invite = (input: Partial<InviteInput>) => execute(w.ctxFor(admin), { type: "account.invite", input: { ...THOMASIAN, ...input } });
  return { ...w, hub, invite };
}

const THOMASIAN: PersonInput = {
  lastName: "Dela Cruz",
  firstName: "Juan",
  middleName: "",
  salutation: "Dr.",
  email: "juan@ust.edu.ph",
  affiliation: "University of Santo Tomas",
  // A Student is the Secretary of the organization named here.
  organization: "Thomasian Engineering Society",
  roleId: ROLE.student,
  section: "academic",
};

const PARTNER: Partial<InviteInput> = {
  email: "reviewer@qs.com",
  affiliation: "QS Quacquarelli Symonds (QS)",
  organization: "",
  roleId: "",
  section: "",
  unitId: "",
};

describe("inviting someone", () => {
  it("adds a Thomasian with the role chosen and the profile given; a Student goes to the Office, in no college", () => {
    const w = office();
    const r = w.invite({ unitId: w.eng.id });
    expect(r.message).toBe("Invitation sent to juan@ust.edu.ph.");
    const a = w.state.accounts.find((x) => x.email === "juan@ust.edu.ph")!;
    expect(a).toMatchObject({ name: "JUAN DELA CRUZ", unitId: w.hub.id, title: "Secretary, THOMASIAN ENGINEERING SOCIETY", status: "Pending Invitation" });
    expect(a.external).toBeUndefined();
    expect(a.assignments.map((x) => x.roleId)).toEqual([ROLE.student]);
    expect(a.profile).toEqual({ lastName: "DELA CRUZ", firstName: "JUAN", salutation: "Dr.", affiliation: "UNIVERSITY OF SANTO TOMAS", listed: true, organization: "THOMASIAN ENGINEERING SOCIETY" });
  });

  it("asks a Student for the organization they're the Secretary of, and no one else", () => {
    const w = office();
    expect(w.invite({ unitId: w.eng.id, organization: "" }).message).toMatch(/organization, commission or council they are the Secretary of/);
    expect(w.invite({ roleId: ROLE.coordinator, unitId: w.eng.id }).ok).toBe(true);
    expect(w.state.accounts.find((x) => x.email === "juan@ust.edu.ph")!.profile?.organization).toBeUndefined();
  });

  it("lets an Administrator make Coordinators, by invitation or by adding the role", () => {
    const w = office();
    expect(w.invite({ roleId: ROLE.coordinator, unitId: w.eng.id }).message).toBe("Invitation sent to juan@ust.edu.ph.");
    expect(w.state.accounts.find((x) => x.email === "juan@ust.edu.ph")!.assignments.map((x) => x.roleId)).toEqual([ROLE.coordinator]);
    const admin = w.state.accounts.find((x) => x.email === "admin@ust.edu.ph")!;
    const student = w.person("Ana Reyes", "ana@ust.edu.ph", ROLE.student, w.sci.id);
    const r = execute(w.ctxFor(admin), { type: "assignment.add", accountId: student.id, roleId: ROLE.coordinator, scope: unitScope(w.sci.id) });
    expect(r.ok).toBe(true);
    expect(student.assignments.map((x) => x.roleId)).toEqual([ROLE.student, ROLE.coordinator]);
  });

  it("asks a Thomasian for a UST email, and an External partner for any other", () => {
    const w = office();
    expect(w.invite({ unitId: w.eng.id, email: "juan@gmail.com" }).message).toBe("Use their UST email (@ust.edu.ph).");
    expect(w.invite({ ...PARTNER, email: "juan@ust.edu.ph", expires: "2999-01-01" }).message).toBe("That is a UST email. Choose University of Santo Tomas as their affiliation.");
  });

  it("gives a Student no College/Faculty or Office, and needs a unit from the section chosen for other roles", () => {
    const w = office();
    expect(w.invite({ email: "ana@ust.edu.ph", roleId: ROLE.student, section: "", unitId: "", organization: "UST CENTRAL STUDENT COUNCIL" }).ok).toBe(true);
    const student = w.state.accounts.find((x) => x.email === "ana@ust.edu.ph")!;
    expect(student.unitId).toBe(w.hub.id);
    expect(student.assignments[0].scope.units).toEqual([w.hub.id]);
    expect(w.invite({ roleId: ROLE.admin, section: "offices", unitId: w.eng.id }).message).toBe("Choose their office.");
    expect(w.invite({ roleId: ROLE.admin, section: "offices", unitId: w.hub.id }).message).toMatch(/Super Administrators/);
  });

  it("invites the Office's own people as Super Administrators in a position, into the Rankings Office", () => {
    const w = office();
    expect(w.invite({ email: "sam@ust.edu.ph", roleId: ROLE.superAdmin, section: "", unitId: "" }).message).toBe("Choose their position in the Office.");
    expect(w.invite({ email: "sam@ust.edu.ph", roleId: ROLE.superAdmin, section: "", unitId: "", position: "specialist" }).ok).toBe(true);
    const sam = w.state.accounts.find((x) => x.email === "sam@ust.edu.ph")!;
    expect([sam.unitId, sam.title, sam.assignments[0].position, sam.assignments[0].scope]).toEqual([w.hub.id, "Ranking Specialist", "specialist", UNIVERSITY]);
    // nobody asks for the Office's role on the Request access form
    expect(readPerson({ ...THOMASIAN, roleId: ROLE.superAdmin }, "self")).toMatch(/Choose your role/);
  });

  it("makes an External partner a guest of the Office, with an end date, while guest sign-in is on", () => {
    const w = office();
    expect(w.invite({ ...PARTNER, expires: "2999-01-01" }).message).toBe("Guest accounts are switched off in Privacy and Security.");
    w.state.security.sso.allowGuests = true;
    expect(w.invite(PARTNER).message).toBe("External access needs an end date.");
    expect(w.invite({ ...PARTNER, expires: "2999-01-01" }).ok).toBe(true);
    const a = w.state.accounts.find((x) => x.email === "reviewer@qs.com")!;
    expect(a).toMatchObject({ unitId: w.hub.id, external: true, identity: "Sponsored guest", title: "QS QUACQUARELLI SYMONDS (QS)" });
    expect(a.assignments[0]).toMatchObject({ roleId: ROLE.external, expires: "2999-01-01" });
  });

  it("asks for the accreditation organization, and keeps an unlisted one's website as typed", () => {
    const w = office();
    w.state.security.sso.allowGuests = true;
    const specify = { ...PARTNER, email: "a@abet.org", affiliation: "International Accreditation Organization (Specify)", expires: "2999-01-01" };
    expect(w.invite(specify).message).toBe("Name their accreditation organization.");
    expect(w.invite({ ...specify, organization: "ABET" }).ok).toBe(true);
    expect(w.state.accounts.find((x) => x.email === "a@abet.org")!.profile).toMatchObject({ affiliation: "INTERNATIONAL ACCREDITATION ORGANIZATION", organization: "ABET" });
    const others = { ...PARTNER, email: "b@review.org", affiliation: "Review Board", expires: "2999-01-01" };
    expect(w.invite({ ...others, website: "http://review.org" }).message).toBe("Enter the website as a full address starting with https://.");
    expect(w.invite({ ...others, website: "https://review.org/" }).ok).toBe(true);
    expect(w.state.accounts.find((x) => x.email === "b@review.org")!.profile).toMatchObject({ affiliation: "REVIEW BOARD", listed: false, website: "https://review.org" });
  });

  it("refuses names with digits and a salutation of no letters", () => {
    const w = office();
    expect(w.invite({ unitId: w.eng.id, lastName: "MAR12" }).message).toBe("Enter their last name.");
    expect(w.invite({ unitId: w.eng.id, salutation: "Other", otherSalutation: "..." }).message).toBe("Choose a salutation, or Prefer not to specify.");
    expect(w.invite({ unitId: w.eng.id, salutation: "Other", otherSalutation: "Arch." }).ok).toBe(true);
  });

  it("refuses an email that already has an account", () => {
    const w = office();
    expect(w.invite({ unitId: w.eng.id, email: "admin@ust.edu.ph" }).message).toBe("admin@ust.edu.ph already has an account.");
  });
});

describe("the request form's own checks", () => {
  it("speak to the requester", () => {
    expect(readPerson({ ...THOMASIAN, lastName: "" }, "self")).toBe("Enter your last name.");
    expect(readPerson({ ...THOMASIAN, roleId: "" }, "self")).toBe("Choose your role: Administrator, Coordinator or Student Organizer.");
  });
});
