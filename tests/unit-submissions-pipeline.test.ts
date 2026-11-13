import { describe, expect, it } from "vitest";
import { execute } from "@/lib/governance/engine";
import { HUB_OFFICE, ROLE } from "@/lib/governance/catalog";
import { UNIVERSITY } from "@/lib/governance/rbac";
import { evidenceById } from "@/lib/governance/records";
import { submissionSteps } from "@/lib/governance/submission-review";
import { world } from "./helpers";

/* Process Pipelines › Unit submissions: the review steps evidence from the units goes through. */
function office() {
  const w = world();
  const director = w.person("Director", "director@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE, false, UNIVERSITY, "director");
  const specialist = w.person("Specialist", "specialist@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE, false, UNIVERSITY, "specialist");
  const second = w.person("Second specialist", "second@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE, false, UNIVERSITY, "specialist");
  const unit = w.person("Coordinator", "coordinator@ust.edu.ph", ROLE.coordinator, w.eng.id);
  const submit = () => {
    const r = execute(w.ctxFor(unit), {
      type: "evidence.submit",
      unitSlug: w.eng.id,
      input: {
        title: "Rainwater reuse",
        type: "Operational data",
        academicYear: "2025–2026",
        term: "First term",
        summary: "Gutters retrofitted on three buildings.",
        result: "4,820 cubic metres reused",
        beneficiaries: "Residents of Barangay 455",
        level: 3,
        sdgs: [6],
        files: [],
        url: "https://www.ust.edu.ph/sustainability",
        mappedTo: ["THE Impact · SDG 6"],
      },
    });
    expect(r.ok).toBe(true);
    return r.data as string;
  };
  const steps = (s: { name: string; enabled?: boolean; approver: "office" | "director" | "specialist" }[]) =>
    expect(execute(w.ctxFor(director), { type: "workflow.update", id: "unit-submissions", steps: s.map((x) => ({ ...x, enabled: x.enabled !== false })) }).ok).toBe(true);
  const ev = (id: string) => evidenceById(w.state, id)!;
  const accept = (who: typeof director, id: string) => execute(w.ctxFor(who), { type: "evidence.review", id, decision: "accept", note: "" });
  return { w, director, specialist, second, unit, submit, steps, ev, accept };
}

describe("unit submissions pipeline", () => {
  it("starts as one review by either approver, as before", () => {
    const { submit, ev, accept, specialist } = office();
    const id = submit();
    expect(accept(specialist, id).ok).toBe(true);
    expect(ev(id).status).toBe("Validated");
  });

  it("validates only after the last step, each by its own position and a different person", () => {
    const { submit, ev, accept, steps, director, specialist, second } = office();
    steps([
      { name: "Evidence check", approver: "specialist" },
      { name: "Director sign-off", approver: "director" },
    ]);
    const id = submit();
    expect(accept(director, id).ok).toBe(false); // the first step is the Specialist's
    expect(accept(specialist, id).ok).toBe(true);
    expect(ev(id).status).toBe("For review");
    expect(ev(id).review?.step).toBe(1);
    expect(accept(second, id).ok).toBe(false); // the second is the Director's
    expect(accept(director, id).ok).toBe(true);
    expect(ev(id).status).toBe("Validated");
    expect(ev(id).review).toBeUndefined();
  });

  it("never lets one person approve two steps", () => {
    const { submit, accept, steps, specialist } = office();
    steps([
      { name: "First look", approver: "office" },
      { name: "Second look", approver: "office" },
    ]);
    const id = submit();
    expect(accept(specialist, id).ok).toBe(true);
    expect(accept(specialist, id).ok).toBe(false);
  });

  it("starts again from the first step after a revision", () => {
    const { w, submit, ev, accept, steps, unit, director, specialist } = office();
    steps([
      { name: "Evidence check", approver: "specialist" },
      { name: "Director sign-off", approver: "director" },
    ]);
    const id = submit();
    expect(accept(specialist, id).ok).toBe(true);
    expect(execute(w.ctxFor(director), { type: "evidence.review", id, decision: "revise", note: "Add the meter readings." }).ok).toBe(true);
    expect(ev(id).status).toBe("Needs revision");
    expect(accept(director, id).ok).toBe(false); // waiting on the unit
    expect(execute(w.ctxFor(unit), { type: "evidence.respond", id, text: "Readings attached." }).ok).toBe(true);
    expect(ev(id).status).toBe("For review");
    expect(ev(id).review).toBeUndefined();
    expect(accept(director, id).ok).toBe(false); // back at the Specialist's step
  });

  it("lets either approver take a step given to a position nobody holds", () => {
    const w = world();
    const specialist = w.person("Specialist", "specialist@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE, false, UNIVERSITY, "specialist");
    w.state.workflows.find((x) => x.id === "unit-submissions")!.steps = [{ name: "Director sign-off", enabled: true, approver: "director" }];
    expect(submissionSteps(w.state, "2026-11-13")[0].open).toBe(true);
    void specialist;
  });

  it("can't be switched off or let the sender decide", () => {
    const { w, director } = office();
    expect(execute(w.ctxFor(director), { type: "workflow.update", id: "unit-submissions", enabled: false }).ok).toBe(false);
    expect(execute(w.ctxFor(director), { type: "workflow.update", id: "unit-submissions", separation: false }).ok).toBe(false);
  });

  it("tells the unit of an acceptance only when the pipeline says so, but always of a revision", () => {
    const { w, submit, accept, director, specialist } = office();
    const told = (tpl: string) => w.state.notices.filter((n) => n.to === `unit:${w.eng.id}` && n.templateId === tpl).length;
    const z = submit();
    expect(accept(specialist, z).ok).toBe(true);
    expect(told("tpl-accepted")).toBe(1);
    expect(execute(w.ctxFor(director), { type: "workflow.update", id: "unit-submissions", notify: false }).ok).toBe(true);
    const a = submit();
    expect(accept(specialist, a).ok).toBe(true);
    expect(told("tpl-accepted")).toBe(1);
    const b = submit();
    expect(execute(w.ctxFor(specialist), { type: "evidence.review", id: b, decision: "revise", note: "Add the meter readings." }).ok).toBe(true);
    expect(told("tpl-revision")).toBe(1);
  });

  it("is not a request anyone can open", () => {
    const { w, unit } = office();
    const r = execute(w.ctxFor(unit), { type: "request.create", workflowId: "unit-submissions", payload: { kind: "publication", target: "story", id: "x", title: "x" }, justification: "Trying to open one directly." });
    expect(r.ok).toBe(false);
  });
});
