import { describe, expect, it } from "vitest";
import { execute } from "@/lib/governance/engine";
import { needsApproval } from "@/lib/governance/engine/requests";
import { makeCtx } from "@/lib/governance/engine";
import { HUB_OFFICE, ROLE } from "@/lib/governance/catalog";
import { UNIVERSITY } from "@/lib/governance/rbac";
import { addDays } from "@/lib/governance/derive";
import { ref, world } from "./helpers";

/* Process Pipelines' nodes: steps switched off are passed, a step given to one position waits for it. */
function office() {
  const w = world();
  const director = w.person("Director", "director@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE, false, UNIVERSITY, "director");
  const specialist = w.person("Specialist", "specialist@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE, false, UNIVERSITY, "specialist");
  const second = w.person("Second specialist", "second@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE, false, UNIVERSITY, "specialist");
  const asker = w.person("Coordinator", "coordinator@ust.edu.ph", ROLE.coordinator, w.eng.id);
  const ask = () => {
    const ctx = w.ctxFor(asker);
    const r = execute(ctx, {
      type: "request.create",
      workflowId: "data-access",
      payload: { kind: "data-access", accountId: asker.id, datasetId: w.state.datasets[0].id, access: "View", until: addDays(ctx.day, 30) },
      justification: "For the faculty's ranking submission.",
    });
    expect(r.ok).toBe(true);
    return w.state.requests.find((x) => x.id === r.requestId)!;
  };
  return { w, director, specialist, second, asker, ask };
}

describe("workflow steps", () => {
  it("pass a step that is switched off", () => {
    const { w, director, specialist, ask } = office();
    const set = execute(w.ctxFor(director), {
      type: "workflow.update",
      id: "data-access",
      steps: [
        { name: "Skipped", enabled: false, approver: "office" },
        { name: "First", enabled: true, approver: "office" },
        { name: "Second", enabled: true, approver: "office" },
      ],
    });
    expect(set.ok).toBe(true);
    const req = ask();
    expect(req.step).toBe(1);
    expect(execute(w.ctxFor(specialist), { type: "request.decide", id: req.id, decision: "Approved" }).ok).toBe(true);
    expect(req.step).toBe(2);
    expect(execute(w.ctxFor(director), { type: "request.decide", id: req.id, decision: "Approved" }).ok).toBe(true);
    expect(req.status).toBe("Approved");
  });

  it("wait for the position a step is given to", () => {
    const { w, director, specialist, ask } = office();
    execute(w.ctxFor(director), { type: "workflow.update", id: "data-access", steps: [{ name: "Director's sign-off", enabled: true, approver: "director" }] });
    const req = ask();
    const refused = execute(w.ctxFor(specialist), { type: "request.decide", id: req.id, decision: "Approved" });
    expect(refused.ok).toBe(false);
    expect(req.status).toBe("Pending");
    expect(execute(w.ctxFor(director), { type: "request.decide", id: req.id, decision: "Approved" }).ok).toBe(true);
    expect(req.status).toBe("Approved");
  });

  it("keep at least one step on", () => {
    const { w, director } = office();
    const r = execute(w.ctxFor(director), { type: "workflow.update", id: "data-access", steps: [{ name: "Only", enabled: false, approver: "office" }] });
    expect(r.ok).toBe(false);
    expect(w.state.workflows.find((x) => x.id === "data-access")!.steps[0].enabled).toBe(true);
  });

  it("apply directly when nobody holds the position a step needs", () => {
    const { w, director, specialist } = office();
    execute(w.ctxFor(director), { type: "workflow.update", id: "data-access", steps: [{ name: "Director's sign-off", enabled: true, approver: "director" }] });
    // the Director can't decide their own change, and no one else is Director
    expect(needsApproval(makeCtx(w.state, w.ctxFor(director).actor, ref), "data-access")).toBe(false);
    expect(needsApproval(makeCtx(w.state, w.ctxFor(specialist).actor, ref), "data-access")).toBe(true);
  });

  it("tell the requester only when the workflow says so", () => {
    const { w, director, asker, ask } = office();
    const told = () => w.state.notices.filter((n) => n.to === asker.id).length;
    execute(w.ctxFor(director), { type: "request.decide", id: ask().id, decision: "Approved" });
    expect(told()).toBe(1);
    execute(w.ctxFor(director), { type: "workflow.update", id: "data-access", notify: false });
    const quiet = ask();
    execute(w.ctxFor(director), { type: "request.decide", id: quiet.id, decision: "Approved" });
    expect(quiet.status).toBe("Approved");
    expect(told()).toBe(1);
  });
});
