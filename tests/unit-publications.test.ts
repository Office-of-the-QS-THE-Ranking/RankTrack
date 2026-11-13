import { describe, expect, it } from "vitest";
import { ROLE } from "@/lib/governance/catalog";
import type { DocumentInput, PostInput } from "@/lib/governance/commands";
import { actorFor, execute, makeCtx } from "@/lib/governance/engine";
import { UNIVERSITY } from "@/lib/governance/rbac";
import type { Reference } from "@/lib/reference";
import { ref, world } from "./helpers";

const REF = { ...ref, storyThemes: [], articleTypes: ["Journal article"], insightTypes: ["Annual report"] } as unknown as Reference;

const post = (extra: Partial<PostInput> = {}): PostInput => ({
  title: "Flood sensors for six barangays",
  subtitle: "",
  body: "Twelve sensors raised the warning lead time from 20 to 95 minutes.",
  sdgs: [11, 13],
  themes: [],
  hashtags: [],
  layout: "cover",
  thumbnail: null,
  photos: [],
  ...extra,
});

const doc = (extra: Partial<DocumentInput> = {}): DocumentInput => ({
  title: "Low-cost river sensing",
  authors: ["Maria Santos"],
  venue: "Journal of Hydrology",
  type: "Journal article",
  abstract: "Twelve sensors across six barangays raised flood warning lead time from 20 to 95 minutes.",
  issued: "2026-09-02",
  doi: "10.5555/ust.2026.0142",
  url: "",
  file: null,
  sdgs: [13],
  keywords: [],
  unitSlug: "",
  featured: false,
  ...extra,
});

/** One Office administrator (alone, so approving posts at once), and a Coordinator in each of two units. */
function setup() {
  const w = world();
  const admin = w.person("Maria Santos", "a@ust.edu.ph", ROLE.superAdmin, w.university.id, false, UNIVERSITY, "specialist");
  const eng = w.person("Jose Cruz", "j@ust.edu.ph", ROLE.coordinator, w.eng.id);
  const sci = w.person("Ana Reyes", "r@ust.edu.ph", ROLE.coordinator, w.sci.id);
  const as = (a: typeof admin) => makeCtx(w.state, actorFor(w.state, a), REF);
  return { ...w, office: () => as(admin), coordinator: () => as(eng), other: () => as(sci) };
}

describe("a Coordinator's publications", () => {
  it("go to the Rankings Office for review instead of the public website", () => {
    const w = setup();
    const r = execute(w.coordinator(), { type: "post.save", input: post(), publish: true });
    expect(r.ok).toBe(true);
    const p = w.state.records.posts[0];
    expect(p).toMatchObject({ status: "In review", unitSlug: w.eng.id });
    expect(p.publishedAt).toBeUndefined();
    expect(w.state.requests.filter((q) => q.payload.kind === "publication")).toHaveLength(0);
    expect(w.state.notices.some((n) => n.to === "office" && n.templateId === "tpl-submitted")).toBe(true);
  });

  it("never publish or unpublish one themselves", () => {
    const w = setup();
    execute(w.coordinator(), { type: "post.save", input: post(), publish: false });
    const p = w.state.records.posts[0];
    expect(execute(w.coordinator(), { type: "post.status", id: p.id, status: "Published" }).ok).toBe(true);
    expect(p.status).toBe("In review");
    execute(w.office(), { type: "post.status", id: p.id, status: "Published" });
    expect(p.status).toBe("Published");
    expect(execute(w.coordinator(), { type: "post.status", id: p.id, status: "Unpublished" }).ok).toBe(false);
    expect(execute(w.coordinator(), { type: "post.save", id: p.id, input: post({ title: "Changed while live" }), publish: true }).ok).toBe(false);
    expect(execute(w.coordinator(), { type: "post.delete", id: p.id }).ok).toBe(false);
    expect(p).toMatchObject({ status: "Published", title: "Flood sensors for six barangays" });
  });

  it("stay as sent while the Office reviews, unless moved back to drafts", () => {
    const w = setup();
    execute(w.coordinator(), { type: "post.save", input: post(), publish: true });
    const p = w.state.records.posts[0];
    expect(execute(w.coordinator(), { type: "post.save", id: p.id, input: post({ title: "Edited in review" }), publish: false }).ok).toBe(false);
    expect(execute(w.coordinator(), { type: "post.status", id: p.id, status: "Draft" }).ok).toBe(true);
    expect(p.status).toBe("Draft");
    expect(execute(w.coordinator(), { type: "post.save", id: p.id, input: post({ title: "Edited as a draft" }), publish: false }).ok).toBe(true);
    expect(p.title).toBe("Edited as a draft");
  });

  it("are out of reach of another unit's Coordinator", () => {
    const w = setup();
    execute(w.coordinator(), { type: "post.save", input: post(), publish: false });
    const p = w.state.records.posts[0];
    expect(execute(w.other(), { type: "post.save", id: p.id, input: post({ title: "Not mine" }), publish: false }).ok).toBe(false);
    expect(execute(w.other(), { type: "post.status", id: p.id, status: "Published" }).ok).toBe(false);
    expect(execute(w.other(), { type: "post.delete", id: p.id }).ok).toBe(false);
    expect(p).toMatchObject({ status: "Draft", title: "Flood sensors for six barangays" });
  });

  it("come back from the Office with a note the unit sees", () => {
    const w = setup();
    execute(w.coordinator(), { type: "post.save", input: post(), publish: true });
    const p = w.state.records.posts[0];
    expect(execute(w.office(), { type: "post.status", id: p.id, status: "Draft" }).ok).toBe(false);
    expect(p.status).toBe("In review");
    expect(execute(w.office(), { type: "post.status", id: p.id, status: "Draft", note: "Add the barangay names." }).ok).toBe(true);
    expect(p.status).toBe("Draft");
    const notice = w.state.notices.find((n) => n.to === `unit:${w.eng.id}` && n.templateId === "tpl-revision");
    expect(notice?.text).toContain("Add the barangay names.");
    expect(notice?.href).toBe(`/portal/publications/stories#${p.slug}`);
  });

  it("go through the publication workflow once the Office approves, when other administrators can sign off", () => {
    const w = setup();
    w.person("Second Admin", "b@ust.edu.ph", ROLE.superAdmin, w.university.id, false, UNIVERSITY, "specialist");
    w.person("Third Admin", "c@ust.edu.ph", ROLE.superAdmin, w.university.id, false, UNIVERSITY, "specialist");
    execute(w.coordinator(), { type: "post.save", input: post(), publish: true });
    const p = w.state.records.posts[0];
    const r = execute(w.office(), { type: "post.status", id: p.id, status: "Published" });
    expect(r.ok).toBe(true);
    expect(p.status).toBe("In review");
    expect(w.state.requests.find((q) => q.payload.kind === "publication" && q.status === "Pending")).toBeTruthy();
  });

  it("documents are filed under the Coordinator's unit, never lead the page, and wait for review", () => {
    const w = setup();
    const r = execute(w.coordinator(), { type: "document.save", kind: "article", input: doc({ unitSlug: w.sci.id, featured: true }), publish: true });
    expect(r.ok).toBe(true);
    const d = w.state.records.documents[0];
    expect(d).toMatchObject({ status: "In review", unitSlug: w.eng.id });
    expect(d.featured).toBeUndefined();
    expect(execute(w.coordinator(), { type: "document.status", id: d.id, status: "Unpublished" }).ok).toBe(false);
    expect(execute(w.office(), { type: "document.status", id: d.id, status: "Draft", note: "Attach the PDF." }).ok).toBe(true);
    expect(d.status).toBe("Draft");
    expect(execute(w.coordinator(), { type: "document.status", id: d.id, status: "Published" }).ok).toBe(true);
    expect(d.status).toBe("In review");
    expect(execute(w.office(), { type: "document.status", id: d.id, status: "Published" }).ok).toBe(true);
    expect(d.status).toBe("Published");
  });
});
