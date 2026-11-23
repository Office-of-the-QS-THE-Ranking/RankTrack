/*
 * What a contributor-workspace page needs, as a pure function of the governed data: the viewer, the unit the
 * workspace shows, and that unit's records within the viewer's organizational scope. server/portal.ts builds it for
 * the signed-in viewer; the portal demo builds it for a fictional one.
 */
import { recordReach } from "./derive";
import type { Hub } from "./hub-build";
import type { HubUnit } from "./hub-types";
import { descendants } from "./rbac";
import { viewerCan, type Viewer } from "./viewer";

export function portalContextFrom(h: Hub, viewer: Viewer) {
  const state = h.state;
  const org = state.units.find((u) => u.id === viewer.portal.unitId);
  const unit: HubUnit = h.unit(viewer.portal.unitId) ?? {
    slug: viewer.portal.unitId,
    name: org?.name ?? viewer.portal.unitName,
    kind: "Office",
    coordinator: state.accounts.find((a) => a.id === org?.adminIds[0])?.name ?? "No coordinator assigned",
    assigned: 0,
    completed: 0,
    validated: 0,
    revisions: 0,
    rankingsServed: 0,
    code: org?.code ?? viewer.portal.unitId.toUpperCase(),
    status: org?.status ?? "Active",
    emails: org?.emails ?? [],
  };
  const reach = recordReach(state.units, unit.slug);
  const program = viewer.portal.programId ? descendants(state.units, viewer.portal.programId) : null;
  const evidence = h.evidence.filter((e) => {
    if (!reach.includes(e.unitSlug)) return false;
    if (!program) return true;
    const p = (e as typeof e & { programId?: string }).programId;
    return !!p && program.includes(p);
  });
  const target = { unitId: viewer.portal.programId ?? unit.slug };
  return {
    viewer,
    hub: h,
    unit,
    evidence,
    requirements: program ? [] : h.requirements(unit.slug),
    can: {
      submit: viewerCan(viewer, "evidence", "submit", target) && h.feature("submit-evidence"),
      data: viewerCan(viewer, "data", "submit", target) && h.feature("data-entry"),
      story: viewerCan(viewer, "stories", "create", target) && h.feature("story-proposals"),
      respond: viewerCan(viewer, "evidence", "edit", target),
    },
    scopeNote: viewer.portal.programName
      ? `Your role covers ${viewer.portal.programName}. You see and submit only its records; the rest of ${unit.name} stays with its coordinators.`
      : undefined,
  };
}


export type PortalContext = ReturnType<typeof portalContextFrom>;

/** Submit evidence's table: what the unit has sent, newest first. */
export const submittedRows = (ctx: PortalContext) =>
  ctx.evidence
    .filter((e) => e.status !== "Not yet submitted" && e.status !== "Not applicable")
    .sort((a, b) => b.submitted.localeCompare(a.submitted) || b.id.localeCompare(a.id));
