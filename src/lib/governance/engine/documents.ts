/*
 * Research articles and reports in Publications. The Office enters them in the workspace's form; publishing goes
 * through the publication workflow whenever enough other administrators can decide it, as posts do. A PDF is an
 * upload in the private bucket; it reaches the public one only while its document is published. A Coordinator enters
 * their own unit's documents, and the Rankings Office reviews each before it is published (unit-publications.ts).
 * Every change is authorized and audited.
 */
import type { Command, CommandResult, DocumentInput } from "../commands";
import { cleanDoi, cleanUrl, DOC_COVER_TONES, DOC_LIMITS, DOC_NOUN, documentPath } from "../documents";
import { slugify } from "../posts";
import { officeDocumentPath, portalDocumentPath } from "@/lib/publications";
import type { DocumentFile, DocumentKind, DocumentRecord } from "../types";
import { can, clean, cleanText, deny, invalid, isDay, log, nextId, ok, type Ctx } from "./core";
import { publishDocument } from "./mutations";
import { needsApproval, openRequest } from "./requests";
import { authorUnit, awaitingOffice, publishes, returnToUnit, sendToOffice, unitBlock } from "./unit-publications";

type Fields = Pick<DocumentRecord, "title" | "authors" | "venue" | "type" | "abstract" | "issued" | "doi" | "url" | "file" | "sdgs" | "keywords" | "unitSlug" | "featured" | "coverTone">;

const res = (d: { id: string; title: string }) => ({ type: "Document", id: d.id, label: d.title });

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** What the audit trail calls each part of a document. */
const PARTS: [keyof Fields, string][] = [
  ["title", "title"],
  ["authors", "authors"],
  ["venue", "venue"],
  ["type", "type"],
  ["abstract", "summary"],
  ["issued", "date"],
  ["doi", "DOI"],
  ["url", "link"],
  ["file", "PDF"],
  ["sdgs", "SDGs"],
  ["keywords", "keywords"],
  ["unitSlug", "unit"],
  ["featured", "featured"],
  ["coverTone", "cover color"],
];

/** The PDF as the form sent it, or null when it isn't an upload of the Hub's. Its size was read from storage (actions/governance.ts). */
function pdf(f: unknown): DocumentFile | null {
  if (!f || typeof f !== "object") return null;
  const { src, name, sizeMB } = f as Record<string, unknown>;
  if (typeof src !== "string" || !documentPath(src)) return null;
  const file = clean(name, DOC_LIMITS.fileName) || "document.pdf";
  return { src, name: /\.pdf$/i.test(file) ? file : `${file}.pdf`, sizeMB: typeof sizeMB === "number" && Number.isFinite(sizeMB) && sizeMB >= 0 ? sizeMB : 0 };
}

/** The form's fields, checked. Publishing asks for more than saving a draft. */
function read(ctx: Ctx, kind: DocumentKind, input: DocumentInput | undefined, publish: boolean): { fields: Fields } | { problem: string } {
  const i: Partial<DocumentInput> = input ?? {};
  const noun = DOC_NOUN[kind];
  if (i.coverTone !== undefined && !DOC_COVER_TONES.some((tone) => tone.value === i.coverTone)) return { problem: "Choose a cover color from the list." };
  const title = clean(i.title, DOC_LIMITS.title);
  if (title.length < 4) return { problem: `Give the ${noun.one} a title of at least four characters.` };

  const names = list(i.authors).map((a) => clean(a, DOC_LIMITS.author)).filter(Boolean);
  const authors = names.filter((a, n) => names.findIndex((x) => x.toLowerCase() === a.toLowerCase()) === n);
  if (authors.length > DOC_LIMITS.authors) return { problem: `List up to ${DOC_LIMITS.authors} authors.` };

  const types = (kind === "article" ? ctx.ref.articleTypes : ctx.ref.insightTypes) ?? [];
  const type = clean(i.type, DOC_LIMITS.type);
  if (!types.includes(type)) return { problem: `Choose the ${kind === "article" ? "article" : "report"} type from the list.` };

  if (!isDay(i.issued)) return { problem: "Enter the publication date." };
  if (i.issued < "1900-01-01" || i.issued > ctx.day) return { problem: "Enter a publication date from 1900 to today." };

  const doiText = typeof i.doi === "string" ? i.doi.trim() : "";
  const doi = doiText ? cleanDoi(doiText) : null;
  if (doiText && !doi) return { problem: "Enter the DOI as it is printed, like 10.1016/j.jclepro.2026.01.004." };
  const urlText = typeof i.url === "string" ? i.url.trim() : "";
  const url = urlText ? cleanUrl(urlText) : null;
  if (urlText && !url) return { problem: "Enter a link that starts with https://." };

  const file = i.file ? pdf(i.file) : null;
  if (i.file && !file) return { problem: "The PDF didn’t finish uploading. Remove it and add it again." };

  const sdgs = [...new Set(list(i.sdgs))];
  if (sdgs.some((n) => typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 17)) return { problem: "Choose SDGs between 1 and 17." };

  const words = list(i.keywords).map((k) => clean(k, DOC_LIMITS.keyword)).filter(Boolean);
  const keywords = words.filter((k, n) => words.findIndex((x) => x.toLowerCase() === k.toLowerCase()) === n);
  if (keywords.length > DOC_LIMITS.keywords) return { problem: `Add up to ${DOC_LIMITS.keywords} keywords.` };

  const unitSlug = clean(i.unitSlug);
  if (unitSlug && !ctx.state.units.some((u) => u.id === unitSlug)) return { problem: "Choose the unit from the list." };

  const abstract = cleanText(typeof i.abstract === "string" ? i.abstract.replace(/\r\n?/g, "\n") : "", DOC_LIMITS.abstract);

  if (publish) {
    if (!authors.length) return { problem: kind === "article" ? "Add at least one author before publishing." : "Say who prepared the report before publishing." };
    if (abstract.length < 40) return { problem: `Write the ${noun.summary.toLowerCase()} before publishing.` };
    if (!doi && !url && !file) return { problem: kind === "article" ? "Add the DOI, a link or the PDF before publishing." : "Add the PDF or a link before publishing." };
  }

  return {
    fields: {
      title,
      authors,
      venue: clean(i.venue, DOC_LIMITS.venue),
      type,
      abstract,
      issued: i.issued,
      doi: doi ?? undefined,
      url: url ?? undefined,
      file: file ?? undefined,
      sdgs: (sdgs as number[]).sort((a, b) => a - b),
      keywords,
      unitSlug: unitSlug || undefined,
      featured: i.featured === true || undefined,
      coverTone: kind === "report" ? i.coverTone : undefined,
    },
  };
}

/** An address no other document uses yet. */
function freeSlug(ctx: Ctx, title: string) {
  const taken = (s: string) => ctx.state.records.documents.some((d) => d.slug === s);
  const base = slugify(title);
  let slug = base;
  for (let n = 2; taken(slug); n++) slug = `${base}-${n}`;
  return slug;
}

const pendingFor = (ctx: Ctx, id: string) => ctx.state.requests.find((r) => r.status === "Pending" && r.payload.kind === "publication" && r.payload.target === "document" && r.payload.id === id);

/** Withdraw a publication request still waiting on the document. */
function dropRequest(ctx: Ctx, id: string, why: string) {
  const req = pendingFor(ctx, id);
  if (!req) return;
  req.status = "Cancelled";
  req.completedAt = ctx.iso;
  log(ctx, "request.cancel", "Approval", { type: "Request", id: req.id, label: req.title }, "Success", why);
}

/** One lead per page: featuring a document takes the mark off the one that had it. */
function feature(ctx: Ctx, doc: DocumentRecord) {
  if (!doc.featured) return;
  for (const d of ctx.state.records.documents) if (d !== doc && d.kind === doc.kind && d.featured) delete d.featured;
}

/** Put the document on the public website, or send it for approval when the publication workflow applies. */
function release(ctx: Ctx, doc: DocumentRecord): CommandResult {
  if (!needsApproval(ctx, "publication")) {
    publishDocument(ctx, doc);
    return ok("Published.", { data: doc.id });
  }
  doc.status = "In review";
  const noun = DOC_NOUN[doc.kind].one;
  const req =
    pendingFor(ctx, doc.id) ??
    openRequest(ctx, "publication", { kind: "publication", target: "document", id: doc.id, title: doc.title }, `Publish ${noun}: ${doc.title}`, `Entered by ${ctx.actor.name}.`);
  return ok(`Sent for approval (${req.id}).`, { data: doc.id, requestId: req.id });
}

/** A unit's document goes to the Rankings Office for review. */
function submit(ctx: Ctx, doc: DocumentRecord): CommandResult {
  sendToOffice(ctx, doc, officeDocumentPath(doc.kind, doc.slug));
  log(ctx, "document.submit", "Approval", res(doc), "Success", "Sent to the Rankings Office for review");
  return ok("Sent to the Rankings Office for review.", { data: doc.id });
}

const missingForPublish = (d: DocumentRecord) =>
  !d.authors.length
    ? d.kind === "article"
      ? "Add at least one author before publishing."
      : "Say who prepared the report before publishing."
    : d.abstract.length < 40
      ? `Write the ${DOC_NOUN[d.kind].summary.toLowerCase()} before publishing.`
      : !d.doi && !d.url && !d.file
        ? d.kind === "article"
          ? "Add the DOI, a link or the PDF before publishing."
          : "Add the PDF or a link before publishing."
        : null;

export function saveDocument(ctx: Ctx, cmd: Extract<Command, { type: "document.save" }>): CommandResult {
  const r = ctx.state.records;
  if (cmd.kind !== "article" && cmd.kind !== "report") return invalid("Choose a research article or a report.");
  const existing = cmd.id ? r.documents.find((d) => d.id === cmd.id) : undefined;
  if (cmd.id && !existing) return invalid(`That ${DOC_NOUN[cmd.kind].one} no longer exists.`);
  if (existing && existing.kind !== cmd.kind) return invalid("That document is filed under another section.");
  const noun = DOC_NOUN[cmd.kind];
  const target = existing ? res(existing) : { type: "Document", id: "new", label: clean(cmd.input?.title) || `Untitled ${noun.one}` };
  if (!can(ctx, "posts", existing ? "edit" : "create")) return deny(ctx, existing ? "document.update" : "document.create", "Data", target, `Your role cannot write ${noun.many}.`);
  const office = publishes(ctx);
  if (cmd.publish && !office && !can(ctx, "posts", "submit")) return deny(ctx, "document.publish", "Approval", target, `Your role cannot publish ${noun.many}.`);
  const home = authorUnit(ctx);
  if (!office) {
    const why = existing ? unitBlock(ctx, existing, "change", noun.one) : home ? null : "Your role has no unit to write for.";
    if (why) return deny(ctx, existing ? "document.update" : "document.create", "Data", target, why);
  }
  const checked = read(ctx, cmd.kind, cmd.input, cmd.publish);
  if ("problem" in checked) return invalid(checked.problem);
  const f = checked.fields;
  // A unit's document stays its own, and which document leads a page is the Office's call.
  if (!office) Object.assign(f, { unitSlug: existing?.unitSlug ?? home, featured: existing?.featured });

  if (existing) {
    const before = existing.file?.src;
    const changed = PARTS.filter(([k]) => JSON.stringify(existing[k] ?? null) !== JSON.stringify(f[k] ?? null)).map(([, word]) => word);
    for (const [k] of PARTS) delete existing[k];
    Object.assign(existing, Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)), { updatedAt: ctx.iso, updatedBy: ctx.actor.id });
    feature(ctx, existing);
    log(ctx, "document.update", "Data", res(existing), "Success", changed.length ? `Changed the ${changed.join(", ")}` : "Saved without changes");
    if (before && before !== existing.file?.src) ctx.effects.push({ kind: "delete-media", srcs: [before] });
    if (cmd.publish && existing.status !== "Published" && !pendingFor(ctx, existing.id)) return office ? release(ctx, existing) : submit(ctx, existing);
    return ok(existing.status === "Published" ? `${noun.one[0].toUpperCase()}${noun.one.slice(1)} updated.` : existing.status === "Draft" ? "Draft saved." : "Saved.", { data: existing.id });
  }

  const doc: DocumentRecord = {
    id: nextId(ctx, "document", "DOC-", 4),
    slug: freeSlug(ctx, f.title),
    kind: cmd.kind,
    title: f.title,
    authors: f.authors,
    venue: f.venue,
    type: f.type,
    abstract: f.abstract,
    issued: f.issued,
    sdgs: f.sdgs,
    keywords: f.keywords,
    ...(f.doi && { doi: f.doi }),
    ...(f.url && { url: f.url }),
    ...(f.file && { file: f.file }),
    ...(f.unitSlug && { unitSlug: f.unitSlug }),
    ...(f.featured && { featured: true }),
    ...(f.coverTone && { coverTone: f.coverTone }),
    status: "Draft",
    createdBy: ctx.actor.id,
    createdAt: ctx.iso,
    updatedAt: ctx.iso,
    updatedBy: ctx.actor.id,
  };
  r.documents.unshift(doc);
  feature(ctx, doc);
  log(ctx, "document.create", "Data", res(doc), "Success", [doc.type, doc.issued.slice(0, 4), doc.file ? "PDF attached" : doc.doi ? `DOI ${doc.doi}` : "No file"].join(" · "));
  if (cmd.publish) return office ? release(ctx, doc) : submit(ctx, doc);
  return ok("Draft saved.", { data: doc.id });
}

export function setDocumentStatus(ctx: Ctx, id: string, to: "Published" | "Unpublished" | "Draft", note?: string): CommandResult {
  const doc = ctx.state.records.documents.find((d) => d.id === id);
  if (!doc) return invalid("That document no longer exists.");
  const noun = DOC_NOUN[doc.kind];
  const action = to === "Published" ? "document.publish" : to === "Unpublished" ? "document.unpublish" : "document.draft";
  const office = publishes(ctx);
  // A unit sends its document to the Office rather than publishing it.
  const need = to === "Draft" ? "edit" : to === "Published" && !office ? "submit" : "approve";
  if (!can(ctx, "posts", need))
    return deny(ctx, action, "Approval", res(doc), to === "Draft" ? `Your role cannot edit ${noun.many}.` : `Your role cannot publish or unpublish ${noun.many}.`);
  const why = unitBlock(ctx, doc, to === "Draft" ? "withdraw" : "submit", noun.one);
  if (why) return deny(ctx, to === "Published" ? "document.submit" : action, "Approval", res(doc), why);
  const touched = () => Object.assign(doc, { updatedAt: ctx.iso, updatedBy: ctx.actor.id });
  if (to === "Published") {
    if (doc.status === "Published") return ok("Already published.");
    const pending = pendingFor(ctx, doc.id);
    if (pending) return invalid(`Already waiting for approval (${pending.id}).`);
    const missing = missingForPublish(doc);
    if (missing) return invalid(missing);
    touched();
    return office ? release(ctx, doc) : submit(ctx, doc);
  }
  if (to === "Unpublished") {
    if (doc.status !== "Published") return invalid(`Only a published ${noun.one} can be unpublished.`);
    doc.status = "Unpublished";
    touched();
    log(ctx, "document.unpublish", "Approval", res(doc), "Success", "Removed from the public website");
    return ok("Unpublished.");
  }
  if (doc.status !== "In review") return invalid(`Only a ${noun.one} waiting for review can move back to drafts.`);
  // The Office hands a unit's document back with what to change; the unit sees the note.
  const returning = office && !!doc.unitSlug && doc.createdBy !== ctx.actor.id && awaitingOffice(doc, pendingFor(ctx, doc.id));
  const said = cleanText(note, 600);
  if (returning && said.length < 5) return invalid("Say what the unit should change; they see your note.");
  dropRequest(ctx, doc.id, `The ${noun.one} moved back to drafts`);
  doc.status = "Draft";
  touched();
  if (returning) {
    returnToUnit(ctx, doc, said, portalDocumentPath(doc.kind, doc.slug));
    log(ctx, "document.return", "Approval", res(doc), "Success", `Returned to the unit: ${said.slice(0, 140)}`);
    return ok("Returned to the unit.");
  }
  log(ctx, "document.draft", "Data", res(doc), "Success", "Moved back to drafts");
  return ok("Moved to drafts.");
}

export function deleteDocument(ctx: Ctx, id: string): CommandResult {
  const r = ctx.state.records;
  const doc = r.documents.find((d) => d.id === id);
  if (!doc) return invalid("That document no longer exists.");
  const noun = DOC_NOUN[doc.kind];
  if (!can(ctx, "posts", "delete")) return deny(ctx, "document.delete", "Data", res(doc), `Your role cannot delete ${noun.many}.`);
  const why = unitBlock(ctx, doc, "delete", noun.one);
  if (why) return deny(ctx, "document.delete", "Data", res(doc), why);
  dropRequest(ctx, doc.id, `The ${noun.one} was deleted`);
  r.documents = r.documents.filter((d) => d !== doc);
  log(ctx, "document.delete", "Data", res(doc), "Success", `Was ${doc.status.toLowerCase()}${doc.file ? " · PDF released" : ""}`);
  if (doc.file) ctx.effects.push({ kind: "delete-media", srcs: [doc.file.src] });
  return ok(`${noun.one[0].toUpperCase()}${noun.one.slice(1)} deleted.`);
}
