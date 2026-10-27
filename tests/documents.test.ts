import { describe, expect, it } from "vitest";
import { ROLE } from "@/lib/governance/catalog";
import { UNIVERSITY } from "@/lib/governance/rbac";
import type { DocumentInput } from "@/lib/governance/commands";
import { citedAuthors, cleanDoi } from "@/lib/governance/documents";
import { actorFor, execute, makeCtx } from "@/lib/governance/engine";
import type { Reference } from "@/lib/reference";
import { ref, world } from "./helpers";

const REF = { ...ref, articleTypes: ["Journal article"], insightTypes: ["Annual report"] } as Reference;
const PDF = { src: "/media/documents/0b8e4f3a-1c2d-4e5f-8a9b-0c1d2e3f4a5b.pdf", name: "paper.pdf", sizeMB: 1.2 };

const input = (extra: Partial<DocumentInput> = {}): DocumentInput => ({
  title: "Low-cost river sensing",
  authors: ["Maria Santos", "Jose Dela Cruz"],
  venue: "Journal of Hydrology",
  type: "Journal article",
  abstract: "Twelve sensors across six barangays raised flood warning lead time from 20 to 95 minutes.",
  issued: "2026-09-02",
  doi: "https://doi.org/10.5555/ust.2026.0142",
  url: "",
  file: null,
  sdgs: [13, 11],
  keywords: ["flood", "Flood", "IoT"],
  unitSlug: "",
  featured: false,
  ...extra,
});

/** One Hub administrator, alone, so publishing needs no second approver. */
function office() {
  const w = world();
  const admin = w.person("Maria Santos", "a@ust.edu.ph", ROLE.admin, w.university.id, false, UNIVERSITY);
  return { ...w, ctx: () => makeCtx(w.state, actorFor(w.state, admin), REF) };
}

describe("research articles and reports", () => {
  it("save a draft, cleaned", () => {
    const w = office();
    const r = execute(w.ctx(), { type: "document.save", kind: "article", input: input(), publish: false });
    expect(r.ok).toBe(true);
    const doc = w.state.records.documents[0];
    expect(doc).toMatchObject({ kind: "article", status: "Draft", doi: "10.5555/ust.2026.0142", sdgs: [11, 13], keywords: ["flood", "IoT"], slug: "low-cost-river-sensing" });
  });

  it("publish at once when no one else can approve, and keep one featured per kind", () => {
    const w = office();
    execute(w.ctx(), { type: "document.save", kind: "article", input: input({ featured: true }), publish: true });
    const r = execute(w.ctx(), { type: "document.save", kind: "article", input: input({ title: "A second article", featured: true }), publish: true });
    expect(r.ok).toBe(true);
    const [second, first] = w.state.records.documents;
    expect(second.status).toBe("Published");
    expect(second.publishedAt).toBeTruthy();
    expect(second.featured).toBe(true);
    expect(first.featured).toBeUndefined();
  });

  it("refuse to publish without a way to read it, or with a bad DOI", () => {
    const w = office();
    expect(execute(w.ctx(), { type: "document.save", kind: "article", input: input({ doi: "" }), publish: true }).ok).toBe(false);
    expect(execute(w.ctx(), { type: "document.save", kind: "article", input: input({ doi: "10.12/x" }), publish: false }).ok).toBe(false);
    expect(execute(w.ctx(), { type: "document.save", kind: "report", input: input({ type: "Annual report", doi: "", file: PDF }), publish: true }).ok).toBe(true);
  });

  it("only take types from the reference list and PDFs from the Hub's uploads", () => {
    const w = office();
    expect(execute(w.ctx(), { type: "document.save", kind: "report", input: input({ type: "Journal article" }), publish: false }).ok).toBe(false);
    expect(execute(w.ctx(), { type: "document.save", kind: "article", input: input({ file: { ...PDF, src: "https://example.org/a.pdf" } }), publish: false }).ok).toBe(false);
  });

  it("are refused to a coordinator", () => {
    const w = office();
    const coordinator = w.person("Own", "own@ust.edu.ph", ROLE.coordinator, w.eng.id);
    const r = execute(makeCtx(w.state, actorFor(w.state, coordinator), REF), { type: "document.save", kind: "article", input: input(), publish: false });
    expect(r.ok).toBe(false);
    expect(w.state.records.documents).toHaveLength(0);
  });

  it("unpublish and delete, releasing the PDF", () => {
    const w = office();
    execute(w.ctx(), { type: "document.save", kind: "report", input: input({ type: "Annual report", file: PDF }), publish: true });
    const id = w.state.records.documents[0].id;
    expect(execute(w.ctx(), { type: "document.status", id, status: "Unpublished" }).ok).toBe(true);
    const ctx = w.ctx();
    expect(execute(ctx, { type: "document.delete", id }).ok).toBe(true);
    expect(w.state.records.documents).toHaveLength(0);
    expect(ctx.effects).toContainEqual({ kind: "delete-media", srcs: [PDF.src] });
  });
});

describe("citations", () => {
  it("keep surname particles and offices whole", () => {
    expect(citedAuthors(["Maria Santos", "Jose Dela Cruz"])).toBe("Santos, M., & Dela Cruz, J.");
    expect(citedAuthors(["Office of QS/THE Rankings"])).toBe("Office of QS/THE Rankings");
    expect(cleanDoi("doi: 10.5555/abc")).toBe("10.5555/abc");
  });
});
