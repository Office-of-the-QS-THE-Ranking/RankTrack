import { describe, expect, it } from "vitest";
import { execute } from "@/lib/governance/engine";
import { HUB_OFFICE, ROLE } from "@/lib/governance/catalog";
import { addDays } from "@/lib/governance/derive";
import { checkInformation } from "@/lib/governance/information-check";
import { assign, checkPipeline, type PipelineDraft } from "@/lib/governance/pipeline-check";
import type { InformationFlow } from "@/lib/governance/pipeline-flow";
import { UNIVERSITY } from "@/lib/governance/rbac";
import type { Workflow } from "@/lib/governance/types";
import { ref, world } from "./helpers";

/* Process Pipelines › Integrity check: a dry run through the real engine that leaves the Hub untouched. */
function office() {
  const w = world();
  const director = w.person("Director", "director@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE, false, UNIVERSITY, "director");
  const specialist = w.person("Specialist", "specialist@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE, false, UNIVERSITY, "specialist");
  const coordinator = w.person("Coordinator", "coordinator@ust.edu.ph", ROLE.coordinator, w.eng.id);
  const draftOf = (id: string, p: Partial<PipelineDraft> = {}): PipelineDraft => {
    const wf = w.state.workflows.find((x) => x.id === id) as Workflow;
    return { enabled: wf.enabled, slaDays: wf.slaDays, separation: wf.separation, notify: wf.notify, steps: wf.steps.map((s) => ({ ...s })), ...p };
  };
  return { w, director, specialist, coordinator, draftOf };
}

describe("pipeline integrity check", () => {
  it("approves, applies and rejects a test request, and leaves the Hub as it was", () => {
    const { w, director, draftOf } = office();
    const before = JSON.stringify(w.state);
    const r = checkPipeline(w.state, ref, "data-access", draftOf("data-access"), director.id);
    expect(JSON.stringify(w.state)).toBe(before);
    expect(r.status).toBe("pass");
    expect(r.checks.find((c) => c.group === "test")?.label).toBe("Approved and applied");
    expect(r.marks.find((m) => m.node === "applied")?.status).toBe("pass");
    expect(r.marks.find((m) => m.node === "rej")?.status).toBe("pass");
    expect(r.logged.some((l) => l.startsWith("access.grant"))).toBe(true);
  });

  it("fails a chain whose second step only the first step's approver could take", () => {
    const { w, director, draftOf } = office();
    w.person("Second specialist", "specialist2@ust.edu.ph", ROLE.superAdmin, HUB_OFFICE, false, UNIVERSITY, "specialist");
    // two Director-only steps and a single Director: requests open (two approvers exist) but stall at step 2
    const draft = draftOf("data-access", {
      steps: [
        { name: "Director check", enabled: true, approver: "director" },
        { name: "Director sign-off", enabled: true, approver: "director" },
      ],
    });
    const r = checkPipeline(w.state, ref, "data-access", draft, director.id);
    expect(r.status).toBe("fail");
    expect(r.marks.some((m) => m.node.startsWith("step:") && m.status === "fail")).toBe(true);
  });

  it("reports what Save would refuse", () => {
    const { w, director, draftOf } = office();
    const r = checkPipeline(w.state, ref, "data-access", draftOf("data-access", { steps: [{ name: "Only", enabled: false, approver: "office" }] }), director.id);
    expect(r.status).toBe("fail");
    expect(r.checks[0]).toMatchObject({ group: "settings", status: "fail" });
  });

  it("finds a waiting request that would fail when applied", () => {
    const { w, director, coordinator, draftOf } = office();
    const ctx = w.ctxFor(coordinator);
    const made = execute(ctx, {
      type: "request.create",
      workflowId: "data-access",
      payload: { kind: "data-access", accountId: coordinator.id, datasetId: w.state.datasets[0].id, access: "View", until: addDays(ctx.day, 30) },
      justification: "For the faculty's ranking submission.",
    });
    expect(made.ok).toBe(true);
    const ok = checkPipeline(w.state, ref, "data-access", draftOf("data-access"), director.id);
    expect(ok.checks.some((c) => c.group === "live" && c.status === "pass" && c.label.includes("can be decided"))).toBe(true);
    // the dataset goes away while the request waits
    const asked = w.state.requests.find((x) => x.id === made.requestId)!.payload;
    w.state.datasets = w.state.datasets.filter((d) => asked.kind !== "data-access" || d.id !== asked.datasetId);
    const broken = checkPipeline(w.state, ref, "data-access", draftOf("data-access"), director.id);
    expect(broken.checks.some((c) => c.group === "live" && c.status === "fail" && c.label.includes("would fail when applied"))).toBe(true);
  });

  it("accepts and sends back a test submission through the Unit submissions steps", () => {
    const { w, director, draftOf } = office();
    const r = checkPipeline(
      w.state,
      ref,
      "unit-submissions",
      draftOf("unit-submissions", {
        steps: [
          { name: "Evidence check", enabled: true, approver: "specialist" },
          { name: "Director sign-off", enabled: true, approver: "director" },
        ],
      }),
      director.id,
    );
    expect(r.checks.filter((c) => c.status === "fail")).toEqual([]);
    expect(r.marks.find((m) => m.node === "step:0")?.note).toBe("Approved by Specialist");
    expect(r.marks.find((m) => m.node === "step:1")?.note).toBe("Approved by Director");
    expect(r.marks.find((m) => m.node === "rej")?.status).toBe("pass");
  });

  it("gives each slot a different person when one exists", () => {
    const a = { account: { id: "a" }, can: ["x", "y"] };
    const b = { account: { id: "b" }, can: ["x"] };
    const got = assign([(p: typeof a) => p.can.includes("x"), (p: typeof a) => p.can.includes("y")], [a, b]);
    expect(got.map((p) => p?.account.id)).toEqual(["b", "a"]);
  });
});

describe("assessment report", () => {
  it("names the pipeline, times the run and counts what it did", () => {
    const { w, director, draftOf } = office();
    const r = checkPipeline(w.state, ref, "data-access", draftOf("data-access"), director.id);
    expect(r.subject).toBe(w.state.workflows.find((x) => x.id === "data-access")!.name);
    expect(r.ms).toBeGreaterThanOrEqual(0);
    const stat = (label: string) => r.stats.find((s) => s.label === label)?.value;
    expect(stat("Copies of the Hub")).toBeGreaterThanOrEqual(3);
    expect(stat("Engine actions run")).toBeGreaterThanOrEqual(3);
    expect(stat("Entries it would log")).toBe(r.logged.length);
  });
});

describe("information pipeline check", () => {
  const flow: InformationFlow = {
    at: new Date().toISOString(),
    values: { review: 0, revise: 0, validated: 3 },
    campaigns: { open: 1 },
    forms: { open: 0 },
    deadlines: { sources: 0, waiting: 0, failed: 0 },
    site: { rankings: 2, stories: 1, documents: 0 },
  };

  it("fails a source that could not be read", () => {
    const { w, director } = office();
    const r = checkInformation("evidence", flow, undefined, 12, w.state, ref, director.id);
    expect(r.checks.find((c) => c.group === "sources" && c.label.startsWith("Files read"))?.status).toBe("fail");
    expect(r.status).toBe("fail");
  });

  it("dry-runs the workflow that governs a stage", () => {
    const { w, director } = office();
    const r = checkInformation("public-site", flow, undefined, 12, w.state, ref, director.id);
    const governed = r.checks.filter((c) => c.group === "governed");
    expect(governed).toHaveLength(1);
    expect(governed[0].detail).toMatch(/tests passed/);
    expect(r.marks.some((m) => m.node === "workflow:publication")).toBe(true);
  });

  it("fails when nothing could be read at all", () => {
    const { w, director } = office();
    const r = checkInformation("forms", null, "Could not read the pipelines' figures.", 5, w.state, ref, director.id);
    expect(r.status).toBe("fail");
    expect(r.marks.find((m) => m.node === "src")?.status).toBe("fail");
  });
});
