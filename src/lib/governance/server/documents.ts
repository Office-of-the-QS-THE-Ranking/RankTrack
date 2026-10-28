import "server-only";

/*
 * Research articles and reports for the Office's tables and the public website: each document with its unit by
 * name, the publication request waiting on it, and what the viewer may do.
 */
import { UNIT_CATEGORY_LABELS } from "@/lib/unit-categories";
import { featureOn } from "../derive";
import { actorFor, makeCtx, needsApproval } from "../engine";
import type { DocumentDesk, DocumentRow, DocumentView } from "../hub-types";
import type { DocumentKind, DocumentRecord, GovernanceState, OrgKind } from "../types";
import type { Viewer } from "../viewer";
import { viewerCan } from "../viewer";
import { readState } from "./store";
import { reference } from "./reference";

const GROUP: Record<OrgKind, string> = {
  Faculty: UNIT_CATEGORY_LABELS.academic,
  College: UNIT_CATEGORY_LABELS.academic,
  Institute: UNIT_CATEGORY_LABELS.academic,
  School: UNIT_CATEGORY_LABELS.academic,
  "Student Government": UNIT_CATEGORY_LABELS.academic,
  Office: UNIT_CATEGORY_LABELS.offices,
  University: UNIT_CATEGORY_LABELS.offices,
  "Research Centre": UNIT_CATEGORY_LABELS.research,
};

/** A document as both sides show it. */
export function documentView(state: GovernanceState, d: DocumentRecord): DocumentView {
  return {
    id: d.id,
    slug: d.slug,
    kind: d.kind,
    title: d.title,
    authors: d.authors,
    venue: d.venue,
    type: d.type,
    abstract: d.abstract,
    issued: d.issued,
    doi: d.doi,
    url: d.url,
    file: d.file,
    sdgs: d.sdgs,
    keywords: d.keywords,
    unitSlug: d.unitSlug,
    unit: d.unitSlug ? state.units.find((u) => u.id === d.unitSlug)?.name : undefined,
    featured: !!d.featured,
    coverTone: d.coverTone,
    status: d.status,
  };
}

/** Published documents of a kind, newest first, while Publications is switched on. */
export function publishedDocuments(state: GovernanceState, kind?: DocumentKind): DocumentView[] {
  if (!featureOn(state, "public-publications")) return [];
  return state.records.documents
    .filter((d) => d.status === "Published" && (!kind || d.kind === kind))
    .map((d) => documentView(state, d))
    .sort((a, b) => b.issued.localeCompare(a.issued));
}

/** The Office's table of articles or reports for this viewer. */
export async function documentDesk(viewer: Viewer, kind: DocumentKind): Promise<DocumentDesk> {
  const [state, ref] = await Promise.all([readState(), reference()]);
  const account = state.accounts.find((a) => a.id === viewer.id);
  const ctx = account ? makeCtx(state, actorFor(state, account), ref, new Date()) : null;
  const nameOf = (id: string) => state.accounts.find((a) => a.id === id)?.name ?? "Former account";
  const pending = new Map<string, string>();
  for (const r of state.requests) if (r.status === "Pending" && r.payload.kind === "publication" && r.payload.target === "document") pending.set(r.payload.id, r.id);
  const order = Object.values(UNIT_CATEGORY_LABELS) as string[];
  const rows: DocumentRow[] = state.records.documents
    .filter((d) => d.kind === kind)
    .map((d) => ({ ...documentView(state, d), updatedAt: d.updatedAt, updatedBy: nameOf(d.updatedBy), publishedAt: d.publishedAt, requestId: pending.get(d.id) }));
  return {
    kind,
    rows,
    can: {
      create: viewerCan(viewer, "posts", "create"),
      edit: viewerCan(viewer, "posts", "edit"),
      delete: viewerCan(viewer, "posts", "delete"),
      publish: viewerCan(viewer, "posts", "approve"),
    },
    needsApproval: !!ctx && needsApproval(ctx, "publication"),
    live: featureOn(state, "public-publications"),
    types: kind === "article" ? ref.articleTypes : ref.insightTypes,
    units: state.units
      .filter((u) => u.status === "Active" && u.parentId !== null)
      .map((u) => ({ id: u.id, name: u.name, group: GROUP[u.kind] ?? UNIT_CATEGORY_LABELS.offices }))
      .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.name.localeCompare(b.name)),
  };
}
