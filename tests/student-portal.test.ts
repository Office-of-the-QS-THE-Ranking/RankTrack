import { describe, expect, it } from "vitest";
import { navPages } from "@/components/shell/nav";
import { ROLE } from "@/lib/governance/catalog";
import { workspacesOf } from "@/lib/governance/derive";
import { execute } from "@/lib/governance/engine";
import { UNIVERSITY, canWith } from "@/lib/governance/rbac";
import { fromRows, toRows } from "@/lib/governance/server/db/rows";
import { creatable, filesForms, formRights, reaches } from "@/lib/forms/access";
import { privacyUsers, statementText, PRIVACY_STATEMENTS } from "@/lib/forms/privacy";
import type { FormSchema } from "@/lib/forms/types";
import type { Account } from "@/lib/governance/types";
import { world } from "./helpers";

const schema: FormSchema = { sections: [{ id: "s", title: "Event", fields: [{ id: "q", type: "yesno", label: "Was it useful?" }] }] };
const reviewed: FormSchema = { ...schema, review: { stages: [{ id: "ok", role: "Adviser", verb: "Noted" }], fields: [] } };

/** The Office's Administrator, a Coordinator and an Administrator of Engineering, two Students of Engineering and one of Science. */
function people() {
  const w = world();
  const admin = w.person("Maria Santos", "a@ust.edu.ph", ROLE.admin, w.university.id, false, UNIVERSITY);
  const coord = w.person("Ana Reyes", "ana@ust.edu.ph", ROLE.coordinator, w.eng.id);
  const dean = w.person("Dean Cruz", "dean@ust.edu.ph", ROLE.admin, w.eng.id);
  const sec = w.person("Juan Dela Cruz", "juan@ust.edu.ph", ROLE.student, w.eng.id);
  const other = w.person("Lea Ramos", "lea@ust.edu.ph", ROLE.student, w.eng.id);
  const far = w.person("Rina Lopez", "rina@ust.edu.ph", ROLE.student, w.sci.id);
  const grants = (a: Account) => w.ctxFor(a).actor.grants;
  const run = (a: Account, cmd: Parameters<typeof execute>[1]) => execute(w.ctxFor(a), cmd);
  return { w, admin, coord, dean, sec, other, far, grants, run };
}

describe("the Student role", () => {
  it("opens the portal on the Student Portal's pages, and those pages only on it", () => {
    const { coord, sec, dean, grants } = people();
    expect(workspacesOf(grants(sec))).toEqual(["portal"]);
    expect(filesForms(grants(sec))).toBe(true);
    expect(filesForms(grants(coord))).toBe(false);
    expect(filesForms(grants(dean))).toBe(false);
    const studentPages = navPages("unit").filter((p) => p.need?.[0] === "forms").map((p) => p.href);
    expect(studentPages).toEqual(["/portal/assignments", "/portal/proposals", "/portal/evaluations", "/portal/registrations", "/portal/terminal-reports"]);
    // A Student sees no unit page: they hold nothing of evidence, data, stories or the Knowledge Center.
    for (const page of navPages("unit").filter((p) => p.need && p.need[0] !== "forms")) expect(canWith(grants(sec), page.need![0], page.need![1])).toBe(false);
  });

  it("lets each role make only its own kinds of form", () => {
    const { w, admin, coord, dean, sec, grants } = people();
    expect(creatable(grants(admin), "office")).toContain("proposal");
    expect(creatable(grants(coord), "unit", w.eng.id)).toEqual(["survey", "registration", "application", "evaluation"]);
    expect(creatable(grants(coord), "unit", w.sci.id)).toEqual([]);
    expect(creatable(grants(coord), "office")).toEqual([]);
    expect(creatable(grants(dean), "unit", w.eng.id)).toEqual([]);
    expect(creatable(grants(sec), "student")).toEqual(["evaluation", "registration"]);
    expect(creatable(grants(sec), "unit", w.eng.id)).toEqual([]);
  });
});

describe("a Student's own forms", () => {
  it("are theirs to build until published, then fixed for good; their responses reach the Office", () => {
    const { w, admin, coord, sec, other, run, grants } = people();
    expect(run(sec, { type: "form.save", own: true, title: "Outreach day registration", kind: "survey", schema }).message).toMatch(/Evaluation Forms and Registration Forms/);
    expect(run(sec, { type: "form.save", own: true, title: "Outreach day registration", kind: "registration", schema: reviewed }).ok).toBe(true);
    const [form] = w.state.records.forms;
    // Held by the Student's account, kept under their unit, with no sign-offs.
    expect([form.ownerId, form.unitId, form.schema.review, form.copies]).toEqual([sec.id, w.eng.id, undefined, undefined]);
    expect(run(sec, { type: "form.save", id: form.id, title: "Outreach day sign-up", kind: "registration", schema }).ok).toBe(true);
    // Not anyone else's: another Student, the unit's Coordinator, nor the Office while it's a draft.
    expect(formRights(grants(other), other.id, form)).toMatchObject({ edit: false, read: false });
    expect(formRights(grants(coord), coord.id, form)).toMatchObject({ edit: false, read: false });
    expect(formRights(grants(admin), admin.id, form)).toMatchObject({ edit: false, read: false });
    expect(run(coord, { type: "form.save", id: form.id, title: "Mine now", kind: "registration" }).ok).toBe(false);

    // Publishing fixes it.
    const ctx = w.ctxFor(sec);
    const published = execute(ctx, { type: "form.status", id: form.id, status: "open" });
    expect([published.ok, published.message]).toEqual([true, "Published. Its responses now reach the Office."]);
    expect(ctx.drafts.at(-1)?.detail).toMatch(/published, fixed/);
    expect(run(sec, { type: "form.save", id: form.id, title: "Renamed", kind: "registration" }).message).toMatch(/published, so it can’t change/);
    expect(run(sec, { type: "form.delete", id: form.id }).message).toMatch(/published, so it can’t change/);
    expect(formRights(grants(sec), sec.id, form)).toMatchObject({ edit: false, remove: false, status: true, read: true, export: true, clear: false, portal: false });
    // The Office reads it now, and may close it; it can't change it.
    expect(formRights(grants(admin), admin.id, form)).toMatchObject({ read: true, export: true, status: true, clear: true, edit: false, duplicate: false });
    expect(run(admin, { type: "form.status", id: form.id, status: "closed" }).ok).toBe(true);
    expect(run(sec, { type: "form.status", id: form.id, status: "open" }).ok).toBe(true);
    // Duplicating starts a new draft of their own.
    expect(run(sec, { type: "form.duplicate", id: form.id }).ok).toBe(true);
    expect([w.state.records.forms[0].ownerId, w.state.records.forms[0].status]).toEqual([sec.id, "draft"]);
    expect(fromRows(toRows(w.state)).records.forms).toEqual(w.state.records.forms);
  });

  it("names only the Student's own unit as the issuer", () => {
    const { w, sec, run } = people();
    expect(run(sec, { type: "form.save", own: true, title: "Seminar evaluation", kind: "evaluation", issuerId: w.sci.id, schema }).message).toMatch(/your own unit/);
    expect(run(sec, { type: "form.save", own: true, title: "Seminar evaluation", kind: "evaluation", issuerId: w.eng.id, schema }).ok).toBe(true);
  });
});

describe("a unit's forms", () => {
  it("are its Coordinators' (never the Office's proposals), read by its Administrators and, once published, the Office", () => {
    const { w, admin, coord, dean, sec, run, grants } = people();
    expect(run(coord, { type: "form.save", unitId: w.eng.id, title: "Project proposal", kind: "proposal", schema }).message).toMatch(/come from the Office/);
    expect(run(coord, { type: "form.save", unitId: w.eng.id, title: "Alumni survey", kind: "survey", schema }).ok).toBe(true);
    const [survey] = w.state.records.forms;
    expect(formRights(grants(coord), coord.id, survey)).toMatchObject({ edit: true, remove: true, portal: true, read: true, review: true, export: true, clear: true });
    expect(formRights(grants(dean), dean.id, survey)).toMatchObject({ edit: false, read: true, export: true, review: false, clear: false, portal: false });
    // A Student of the same unit has no hand in it.
    expect(formRights(grants(sec), sec.id, survey)).toMatchObject({ edit: false, read: false, export: false });
    // The Office never acts for a unit: it only reads a published one.
    expect(formRights(grants(admin), admin.id, survey)).toMatchObject({ edit: false, read: false });
    expect(run(coord, { type: "form.status", id: survey.id, status: "open" }).ok).toBe(true);
    expect(formRights(grants(admin), admin.id, survey)).toMatchObject({ edit: false, read: true, portal: false });
    // A unit's evaluation is fixed once published, and only the Office removes its responses.
    expect(run(coord, { type: "form.save", unitId: w.eng.id, title: "Seminar evaluation", kind: "evaluation", schema }).ok).toBe(true);
    const evaluation = w.state.records.forms[0];
    expect(run(coord, { type: "form.status", id: evaluation.id, status: "open" }).ok).toBe(true);
    expect(formRights(grants(coord), coord.id, evaluation)).toMatchObject({ edit: false, clear: false, status: true });
    expect(formRights(grants(admin), admin.id, evaluation)).toMatchObject({ clear: true });
  });

  it("goes to the unit's own Students when a survey is published to the Student Portal", () => {
    const { w, coord, sec, far, run } = people();
    expect(run(coord, { type: "form.save", unitId: w.eng.id, title: "Org survey", kind: "survey", schema }).ok).toBe(true);
    const [survey] = w.state.records.forms;
    expect(run(sec, { type: "form.portal", id: survey.id, on: true }).ok).toBe(false);
    expect(run(coord, { type: "form.portal", id: survey.id, on: true }).ok).toBe(true);
    expect(survey.students).toBe(true);
    expect(reaches(w.state.units, survey, [sec.unitId])).toBe(true);
    expect(reaches(w.state.units, survey, [far.unitId])).toBe(false);
    expect(fromRows(toRows(w.state)).records.forms).toEqual(w.state.records.forms);
  });
});

describe("the Office's forms on the Student Portal", () => {
  it("publish proposals, terminal reports and surveys, audited; Students only copy or answer them", () => {
    const { w, admin, coord, sec, far, run, grants } = people();
    expect(run(admin, { type: "form.save", title: "Community Development Project Proposal", kind: "proposal", schema }).ok).toBe(true);
    const [proposal] = w.state.records.forms;
    expect(proposal.copies).toBe(true);
    expect(run(coord, { type: "form.portal", id: proposal.id, on: true }).ok).toBe(false);
    const ctx = w.ctxFor(admin);
    const r = execute(ctx, { type: "form.portal", id: proposal.id, on: true });
    expect([r.ok, r.message]).toEqual([true, "Published to the Student Portal. Students see it once it takes responses."]);
    expect(ctx.drafts.at(-1)).toMatchObject({ action: "form.portal", outcome: "Success" });
    expect(reaches(w.state.units, proposal, [far.unitId])).toBe(true);
    // A Student never changes the Office's form, nor reads its responses.
    expect(formRights(grants(sec), sec.id, proposal)).toEqual({ edit: false, remove: false, status: false, portal: false, duplicate: false, read: false, review: false, export: false, clear: false });
    expect(run(sec, { type: "form.save", id: proposal.id, title: "Mine", kind: "proposal" }).ok).toBe(false);
    // Only some kinds go to the Student Portal; a kind that leaves it takes the form off.
    expect(run(admin, { type: "form.save", title: "Registration", kind: "registration", schema }).ok).toBe(true);
    expect(run(admin, { type: "form.portal", id: w.state.records.forms[0].id, on: true }).message).toMatch(/Only proposals, terminal reports and surveys/);
    expect(run(admin, { type: "form.save", id: proposal.id, title: proposal.title, kind: "application" }).ok).toBe(true);
    expect([proposal.students, proposal.copies]).toEqual([undefined, undefined]);
  });
});

describe("the privacy notice", () => {
  it("names who made a unit's or a Student's form among those who use the answers", () => {
    const maker = { kind: "student" as const, name: "CICS STUDENT COUNCIL" };
    expect(privacyUsers().map((u) => u.id)).toEqual(["rankings", "simbahayan"]);
    expect(privacyUsers(maker).map((u) => u.id)).toEqual(["rankings", "simbahayan", "maker"]);
    expect(statementText(PRIVACY_STATEMENTS[0], maker)).toContain("CICS STUDENT COUNCIL");
    expect(statementText(PRIVACY_STATEMENTS[0])).toBe(PRIVACY_STATEMENTS[0].text);
  });
});
