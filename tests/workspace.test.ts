import { describe, expect, it } from "vitest";
import { ROLE } from "@/lib/governance/catalog";
import { execute } from "@/lib/governance/engine";
import { UNIVERSITY } from "@/lib/governance/rbac";
import { linkKind, linksIn, renamed } from "@/lib/governance/workspace";
import { world } from "./helpers";
import { fromRows, toRows } from "@/lib/governance/server/db/rows";

const src = (n: number, ext = "pdf") => `/media/workspace/0b8e4f3a-1c2d-4e5f-8a9b-${String(n).padStart(12, "0")}.${ext}`;
const file = (n: number, name = `file-${n}.pdf`) => ({ name, src: src(n, name.split(".").pop()), bytes: 2048 });

function setup() {
  const w = world();
  const coord = w.person("Ana Reyes", "ana@ust.edu.ph", ROLE.coordinator, w.eng.id);
  const other = w.person("Ben Cruz", "ben@ust.edu.ph", ROLE.coordinator, w.sci.id);
  const admin = w.person("Maria Santos", "a@ust.edu.ph", ROLE.admin, w.university.id, false, UNIVERSITY);
  const ctx = { coord: () => w.ctxFor(coord), other: () => w.ctxFor(other), admin: () => w.ctxFor(admin) };
  /** A new folder of the engineering unit's (or, with `shared`, the Office's) on a shelf, by id. */
  const folder = (shelf: "working" | "library", name = `Folder ${shelf}`, shared = false) => {
    execute(shared ? ctx.admin() : ctx.coord(), { type: "workspace.folder", ...(!shared && { unitId: w.eng.id }), shelf, name });
    return w.state.records.workspaceFolders.at(-1)!.id;
  };
  return { ...w, ...ctx, folder };
}

describe("workspace", () => {
  it("saves and reloads remarks, preserves them on updates, and allows clearing them", () => {
    const w = setup();
    const fields = { unitId: w.eng.id, title: "Report", date: "2026-10-20", rankings: [], status: "Draft" as const, links: ["https://example.org/report"] };
    expect(execute(w.coord(), { type: "workdoc.save", ...fields, remarks: "  Confirm totals.\nAsk the dean to review.  " }).ok).toBe(true);
    const doc = w.state.records.workingDocs[0];
    expect(doc.remarks).toBe("Confirm totals.\nAsk the dean to review.");
    expect(fromRows(toRows(w.state)).records.workingDocs[0].remarks).toBe(doc.remarks);
    expect(execute(w.coord(), { type: "workdoc.save", ...fields, id: doc.id, title: "Updated report" }).ok).toBe(true);
    expect(doc.remarks).toContain("Confirm totals.");
    expect(execute(w.coord(), { type: "workdoc.save", ...fields, id: doc.id, remarks: "x".repeat(5001) }).ok).toBe(false);
    expect(execute(w.coord(), { type: "workdoc.save", ...fields, id: doc.id, remarks: "" }).ok).toBe(true);
    expect(doc.remarks).toBe("");
  });

  it("files every upload in a folder, Templates & Forms being gone", () => {
    const w = setup();
    expect(execute(w.coord(), { type: "workspace.add", unitId: w.eng.id, shelf: "library", folderId: "", files: [file(92)] }).ok).toBe(false);
    // @ts-expect-error the shelf Digital Forms replaced
    expect(execute(w.coord(), { type: "workspace.add", unitId: w.eng.id, shelf: "templates", folderId: w.folder("library"), files: [file(93)] }).ok).toBe(false);
    // @ts-expect-error nor can a folder be made on it
    expect(execute(w.coord(), { type: "workspace.folder", unitId: w.eng.id, shelf: "templates", name: "Forms" }).ok).toBe(false);
    expect(w.state.records.workspace).toHaveLength(0);
  });

  it("makes nested folders and files uploads into them", () => {
    const w = setup();
    expect(execute(w.coord(), { type: "workspace.folder", unitId: w.eng.id, shelf: "library", name: " Portfolio " }).ok).toBe(true);
    const [top] = w.state.records.workspaceFolders;
    expect(execute(w.coord(), { type: "workspace.folder", unitId: w.eng.id, shelf: "library", parentId: top.id, name: "Résumés" }).ok).toBe(true);
    const inner = w.state.records.workspaceFolders[1];
    expect([top.name, inner.parentId, inner.unitId]).toEqual(["Portfolio", top.id, w.eng.id]);
    // One name per place, whatever the case.
    expect(execute(w.coord(), { type: "workspace.folder", unitId: w.eng.id, shelf: "library", name: "portfolio" }).ok).toBe(false);
    expect(execute(w.coord(), { type: "workspace.add", unitId: w.eng.id, shelf: "library", folderId: inner.id, files: [file(1)] }).ok).toBe(true);
    // Files go only inside folders.
    expect(execute(w.coord(), { type: "workspace.add", unitId: w.eng.id, shelf: "library", folderId: "", files: [file(2)] }).ok).toBe(false);
    expect(execute(w.coord(), { type: "workspace.add", unitId: w.eng.id, shelf: "library", folderId: top.id, files: [file(2)] }).ok).toBe(true);
    const files = w.state.records.workspace;
    expect(files.map((f) => f.folderId)).toEqual([top.id, inner.id]);
    expect(files.every((f) => f.unitId === w.eng.id && f.bytes === 2048)).toBe(true);
    // A folder on another shelf, or another unit's, can't take them.
    expect(execute(w.coord(), { type: "workspace.add", unitId: w.eng.id, shelf: "working", folderId: inner.id, files: [file(3)] }).ok).toBe(false);
    expect(execute(w.other(), { type: "workspace.folder", unitId: w.sci.id, shelf: "library", parentId: top.id, name: "Mine" }).ok).toBe(false);
  });

  it("renames and moves folders, never into themselves or too deep", () => {
    const w = setup();
    const make = (name: string, parentId?: string) => {
      execute(w.coord(), { type: "workspace.folder", unitId: w.eng.id, shelf: "library", parentId, name });
      return w.state.records.workspaceFolders.at(-1)!;
    };
    const a = make("A");
    const b = make("B", a.id);
    const c = make("C", b.id);
    expect(execute(w.coord(), { type: "workspace.folder", id: a.id, shelf: "library", name: "Alpha" }).ok).toBe(true);
    expect([a.name, a.parentId]).toEqual(["Alpha", undefined]);
    expect(execute(w.coord(), { type: "workspace.folder", id: a.id, shelf: "library", parentId: c.id, name: "Alpha" }).ok).toBe(false);
    expect(execute(w.coord(), { type: "workspace.folder", id: c.id, shelf: "library", parentId: "", name: "C" }).ok).toBe(true);
    expect(c.parentId).toBeUndefined();
    const d = make("D", make("E", make("F", b.id).id).id);
    expect(d.parentId).toBeDefined();
    expect(execute(w.coord(), { type: "workspace.folder", unitId: w.eng.id, shelf: "library", parentId: d.id, name: "Too deep" }).ok).toBe(false);
    // B holds four levels (B, F, E, D): under C it fits, one level lower it doesn't.
    expect(execute(w.coord(), { type: "workspace.folder", id: b.id, shelf: "library", parentId: make("G", c.id).id, name: "B" }).ok).toBe(false);
    expect(execute(w.coord(), { type: "workspace.folder", id: b.id, shelf: "library", parentId: c.id, name: "B" }).ok).toBe(true);
  });

  it("deletes only an empty folder, archived files included", () => {
    const w = setup();
    execute(w.coord(), { type: "workspace.folder", unitId: w.eng.id, shelf: "library", name: "Old" });
    const [old] = w.state.records.workspaceFolders;
    execute(w.coord(), { type: "workspace.add", unitId: w.eng.id, shelf: "library", folderId: old.id, files: [file(1)] });
    const [f] = w.state.records.workspace;
    expect(execute(w.coord(), { type: "workspace.folderDelete", id: old.id }).ok).toBe(false);
    execute(w.coord(), { type: "workspace.archive", ids: [f.id], archived: true });
    // An archived file still belongs to its folder, so it is restored there.
    expect(execute(w.coord(), { type: "workspace.folderDelete", id: old.id }).ok).toBe(false);
    execute(w.coord(), { type: "workspace.delete", ids: [f.id] });
    expect(execute(w.other(), { type: "workspace.folderDelete", id: old.id }).ok).toBe(false);
    expect(execute(w.coord(), { type: "workspace.folderDelete", id: old.id }).ok).toBe(true);
    expect(w.state.records.workspaceFolders).toHaveLength(0);
  });

  it("keeps other units and shared shelves to the people who write them", () => {
    const w = setup();
    expect(execute(w.other(), { type: "workspace.add", unitId: w.eng.id, shelf: "working", folderId: w.folder("working"), files: [file(1)] }).ok).toBe(false);
    expect(execute(w.coord(), { type: "workspace.add", shelf: "library", folderId: w.folder("library", "Office guides", true), files: [file(2)] }).ok).toBe(false);
    expect(w.state.records.workspace).toHaveLength(0);
  });

  it("lets the Office share library files with every unit", () => {
    const w = setup();
    expect(execute(w.admin(), { type: "workspace.folder", shelf: "library", name: "Guides" }).ok).toBe(true);
    const [guides] = w.state.records.workspaceFolders;
    expect(execute(w.admin(), { type: "workspace.add", shelf: "library", folderId: guides.id, files: [file(5)] }).ok).toBe(true);
    expect(execute(w.coord(), { type: "workspace.folder", id: guides.id, shelf: "library", name: "Mine now" }).ok).toBe(false);
    expect(w.state.records.workspace[0].unitId).toBeUndefined();
    expect(execute(w.coord(), { type: "workspace.archive", ids: [w.state.records.workspace[0].id], archived: true }).ok).toBe(false);
  });

  it("refuses files that aren't uploads or aren't accepted types", () => {
    const w = setup();
    const into = w.folder("working");
    expect(execute(w.coord(), { type: "workspace.add", unitId: w.eng.id, shelf: "working", folderId: into, files: [{ name: "a.pdf", src: "/media/evidence/x.pdf", bytes: 1 }] }).ok).toBe(false);
    expect(execute(w.coord(), { type: "workspace.add", unitId: w.eng.id, shelf: "working", folderId: into, files: [file(3, "run.exe")] }).ok).toBe(false);
  });

  it("renames keeping the extension and moves between shelves", () => {
    const w = setup();
    execute(w.coord(), { type: "workspace.folder", unitId: w.eng.id, shelf: "library", name: "Drafts" });
    execute(w.coord(), { type: "workspace.add", unitId: w.eng.id, shelf: "library", folderId: w.state.records.workspaceFolders[0].id, files: [file(1, "plan.docx")] });
    const f = w.state.records.workspace[0];
    expect(execute(w.coord(), { type: "workspace.edit", id: f.id, name: "Faculty plan" }).ok).toBe(true);
    expect(f.name).toBe("Faculty plan.docx");
    // Another shelf takes it only into one of its folders.
    expect(execute(w.coord(), { type: "workspace.edit", id: f.id, shelf: "working" }).ok).toBe(false);
    const working = w.folder("working");
    expect(execute(w.coord(), { type: "workspace.edit", id: f.id, shelf: "working", folderId: working }).ok).toBe(true);
    expect([f.shelf, f.folderId]).toEqual(["working", working]);
    expect(execute(w.coord(), { type: "workspace.edit", id: f.id, folderId: "" }).ok).toBe(false);
    expect(f.folderId).toBe(working);
  });

  it("deletes only from Archives, and restores to the same shelf", () => {
    const w = setup();
    execute(w.coord(), { type: "workspace.add", unitId: w.eng.id, shelf: "library", folderId: w.folder("library"), files: [file(1), file(2)] });
    const [a, b] = w.state.records.workspace;
    expect(execute(w.coord(), { type: "workspace.delete", ids: [a.id] }).ok).toBe(false);
    expect(execute(w.coord(), { type: "workspace.archive", ids: [a.id, b.id], archived: true }).ok).toBe(true);
    expect(execute(w.coord(), { type: "workspace.archive", ids: [b.id], archived: false }).ok).toBe(true);
    expect([b.archivedAt, b.shelf]).toEqual([undefined, "library"]);
    const ctx = w.coord();
    expect(execute(ctx, { type: "workspace.delete", ids: [a.id] }).ok).toBe(true);
    expect(w.state.records.workspace.map((f) => f.id)).toEqual([b.id]);
    expect(ctx.effects).toContainEqual({ kind: "delete-media", srcs: [a.src] });
  });

  it("keeps the extension however a rename is typed", () => {
    expect(renamed("report.pdf", "Final.PDF")).toBe("Final.pdf");
    expect(renamed("report.pdf", "Final.docx")).toBe("Final.docx.pdf");
    expect(renamed("report.pdf", "  ")).toBe("");
  });

  it("keeps working documents as links, several per document", () => {
    const w = setup();
    const doc = { unitId: w.eng.id, title: " Faculty  ratio sheet ", date: "2026-10-20", rankings: ["the-wur", "qs-wur"], status: "Draft" as const };
    const links = ["https://docs.google.com/spreadsheets/d/abc/edit", "drive.google.com/drive/folders/xyz"];
    expect(execute(w.coord(), { type: "workdoc.save", ...doc, links }).ok).toBe(true);
    const [d] = w.state.records.workingDocs;
    expect([d.title, d.links]).toEqual(["Faculty ratio sheet", ["https://docs.google.com/spreadsheets/d/abc/edit", "https://drive.google.com/drive/folders/xyz"]]);
    expect(execute(w.coord(), { type: "workdoc.status", id: d.id, status: "For review" }).ok).toBe(true);
    expect(d.status).toBe("For review");
    expect(execute(w.coord(), { type: "workdoc.save", id: d.id, ...doc, title: "Ratios", links: [links[0]] }).ok).toBe(true);
    expect([d.title, d.links.length, d.status]).toEqual(["Ratios", 1, "Draft"]);
    expect(execute(w.coord(), { type: "workdoc.delete", ids: [d.id] }).ok).toBe(true);
    expect(w.state.records.workingDocs).toHaveLength(0);
  });

  it("refuses bad links, dates and other units' documents", () => {
    const w = setup();
    const doc = { unitId: w.eng.id, title: "Draft", date: "2026-10-20", rankings: [], status: "Draft" as const, links: ["https://example.org/a.pdf"] };
    expect(execute(w.coord(), { type: "workdoc.save", ...doc, links: ["javascript:alert(1)"] }).ok).toBe(false);
    expect(execute(w.coord(), { type: "workdoc.save", ...doc, links: ["http://example.org"] }).ok).toBe(false);
    expect(execute(w.coord(), { type: "workdoc.save", ...doc, links: [] }).ok).toBe(false);
    expect(execute(w.coord(), { type: "workdoc.save", ...doc, links: ["   "] }).ok).toBe(false);
    expect(execute(w.coord(), { type: "workdoc.save", ...doc, date: "2026-02-30" }).ok).toBe(false);
    expect(execute(w.other(), { type: "workdoc.save", ...doc }).ok).toBe(false);
    expect(execute(w.coord(), { type: "workdoc.save", ...doc }).ok).toBe(true);
    expect(execute(w.other(), { type: "workdoc.delete", ids: [w.state.records.workingDocs[0].id] }).ok).toBe(false);
  });

  it("keeps the Office's own working documents to its Knowledge Center editors", () => {
    const w = setup();
    const doc = { title: "Cycle plan", date: "2026-10-20", rankings: [], status: "Draft" as const, links: ["https://docs.google.com/document/d/1/edit"] };
    expect(execute(w.coord(), { type: "workdoc.save", ...doc }).ok).toBe(false);
    expect(execute(w.admin(), { type: "workdoc.save", ...doc }).ok).toBe(true);
    expect(w.state.records.workingDocs[0].unitId).toBeUndefined();
  });

  it("reads pasted links and what each one opens", () => {
    expect(linksIn("https://docs.google.com/document/d/1/edit\nhttps://docs.google.com/document/d/1/edit, nope").links).toHaveLength(1);
    expect(linksIn("a b").bad).toEqual(["a", "b"]);
    expect(
      ["https://docs.google.com/document/d/1", "https://docs.google.com/spreadsheets/d/1", "https://drive.google.com/file/d/1", "https://x.org/r.PDF", "https://ust.edu.ph"].map(linkKind),
    ).toEqual(["gdoc", "gsheet", "gdrive", "pdf", "web"]);
    expect(
      ["https://docs.google.com/forms/d/e/1/viewform", "https://forms.gle/abc", "https://x.org/a.docx", "https://x.org/b.xlsx", "https://ust-my.sharepoint.com/:p:/g/abc", "https://docs.google.com/presentation/d/1"].map(linkKind),
    ).toEqual(["gform", "gform", "word", "excel", "powerpoint", "gslides"]);
  });

  it("keeps a working document's SDGs and authors, cleaned", () => {
    const w = setup();
    const doc = { unitId: w.eng.id, title: "Plan", date: "2026-10-20", rankings: [], status: "Draft" as const, links: ["https://example.org/a.pdf"] };
    expect(execute(w.coord(), { type: "workdoc.save", ...doc, sdgs: [4, 4, 18, 1], authors: [" Ana  Cruz ", "ana cruz", "", "Ben"] }).ok).toBe(true);
    const [d] = w.state.records.workingDocs;
    expect([d.sdgs, d.authors]).toEqual([[1, 4], ["Ana Cruz", "Ben"]]);
  });
});
