import { describe, expect, it } from "vitest";
import { execute, housekeeping, makeCtx, SYSTEM } from "@/lib/governance/engine";
import { UNIVERSITY } from "@/lib/governance/rbac";
import { ROLE } from "@/lib/governance/catalog";
import type { EvidenceRecord } from "@/lib/governance/types";
import { ref, world } from "./helpers";

describe("assistance requests", () => {
  it("are refused for someone who doesn't contribute for the unit", () => {
    const w = world();
    const guest = w.person("Guest", "guest@partner.org", ROLE.external, w.eng.id, true);
    const r = execute(w.ctxFor(guest), { type: "assistance.request", unitSlug: w.eng.id, topic: "Help", urgent: true, message: "Please help with the submission." });
    expect(r.ok).toBe(false);
    expect(w.state.records.assistance).toHaveLength(0);
  });

  it("are refused for another unit's coordinator", () => {
    const w = world();
    const other = w.person("Other", "other@ust.edu.ph", ROLE.coordinator, w.sci.id);
    expect(execute(w.ctxFor(other), { type: "assistance.request", unitSlug: w.eng.id, topic: "Help", urgent: false, message: "Please help with the submission." }).ok).toBe(false);
  });

  it("go through for the unit's own coordinator", () => {
    const w = world();
    const own = w.person("Own", "own@ust.edu.ph", ROLE.coordinator, w.eng.id);
    expect(execute(w.ctxFor(own), { type: "assistance.request", unitSlug: w.eng.id, topic: "Help", urgent: false, message: "Please help with the submission." }).ok).toBe(true);
  });
});

describe("reporting-period values", () => {
  it("are refused for requirements that aren't the unit's", () => {
    const w = world();
    const own = w.person("Own", "own@ust.edu.ph", ROLE.coordinator, w.eng.id);
    const r = execute(w.ctxFor(own), { type: "data.submit", unitSlug: w.eng.id, values: [{ id: "someone-elses", label: "X", value: "12", source: "Report" }] });
    expect(r.ok).toBe(false);
    expect(w.state.records.values).not.toHaveProperty("someone-elses");
  });
});

describe("evidence review", () => {
  const record = (by: { id: string; name: string }, unitSlug: string): EvidenceRecord => ({
    id: "EV-9001",
    title: "Flood sensors",
    unitSlug,
    type: "Programme",
    period: "Calendar year 2025",
    submitted: "2026-10-01",
    submittedBy: by.name,
    submittedById: by.id,
    status: "For review",
    stage: 0,
    level: 3,
    mappedTo: ["THE Impact · SDG 11"],
    sdgs: [11],
    summary: "",
    result: "12 sensors",
    beneficiaries: "Residents",
    files: [],
    comments: [],
  });

  it("is refused to the account that submitted it", () => {
    const w = world();
    const a = w.person("Maria Santos", "a@ust.edu.ph", ROLE.admin, w.university.id, false, UNIVERSITY);
    w.state.records.evidence["EV-9001"] = record(a, w.eng.id);
    const r = execute(w.ctxFor(a), { type: "evidence.review", id: "EV-9001", decision: "accept", note: "" });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/another reviewer/);
  });

  it("is not refused to a different account that shares the submitter's name", () => {
    const w = world();
    const a = w.person("Maria Santos", "a@ust.edu.ph", ROLE.admin, w.university.id, false, UNIVERSITY);
    const b = w.person("Maria Santos", "b@ust.edu.ph", ROLE.admin, w.university.id, false, UNIVERSITY);
    w.state.records.evidence["EV-9001"] = record(a, w.eng.id);
    const r = execute(w.ctxFor(b), { type: "evidence.review", id: "EV-9001", decision: "accept", note: "" });
    expect(r.message).not.toMatch(/another reviewer/);
  });

  it("refuses attachments that weren't uploaded through the Hub", () => {
    const w = world();
    const own = w.person("Own", "own@ust.edu.ph", ROLE.coordinator, w.eng.id);
    const r = execute(w.ctxFor(own), {
      type: "evidence.submit",
      unitSlug: w.eng.id,
      input: {
        title: "Flood sensors",
        type: "Programme",
        period: "Calendar year 2025",
        summary: "",
        result: "12",
        beneficiaries: "Residents",
        level: 3,
        sdgs: [11],
        files: [{ name: "report.pdf", sizeMB: 1, src: "https://evil.example/report.pdf" }],
        url: "",
        mappedTo: ["THE Impact · SDG 11"],
      },
    });
    expect(r.ok).toBe(false);
  });
});

describe("audit verification", () => {
  it("is refused to a role without audit access", () => {
    const w = world();
    const own = w.person("Own", "own@ust.edu.ph", ROLE.coordinator, w.eng.id);
    const ctx = w.ctxFor(own);
    expect(execute(ctx, { type: "audit.verify" }).ok).toBe(false);
    expect(ctx.effects).toHaveLength(0);
  });
});

describe("housekeeping", () => {
  it("removes an applicant's birthday a month after the request closed", () => {
    const w = world();
    const closed = new Date(Date.now() - 40 * 86_400_000).toISOString();
    w.state.requests.push({
      id: "RQ-0001",
      workflowId: "account-access",
      title: "Account",
      requesterId: "guest",
      requestedAt: closed,
      justification: "",
      payload: { kind: "account-access", name: "A", email: "a@x.org", unitId: "", roleId: ROLE.external, title: "", applicant: { lastName: "A", firstName: "B", birthday: "1990-01-01", affiliation: "X", listed: false, website: "https://x.org" } },
      status: "Rejected",
      step: 0,
      decisions: [],
      due: closed.slice(0, 10),
      completedAt: closed,
    });
    housekeeping(makeCtx(w.state, SYSTEM, ref));
    const p = w.state.requests[0].payload;
    expect(p.kind === "account-access" && p.applicant?.birthday).toBe("");
    expect(p.kind === "account-access" && p.applicant?.website).toBeUndefined();
  });
});
