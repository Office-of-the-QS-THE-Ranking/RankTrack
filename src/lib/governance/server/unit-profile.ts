import "server-only";

/*
 * What a unit's profile in the Office workspace needs: the unit, its coordinator, every cycle's records
 * within the viewer's reach, and whether the viewer may edit the unit's account settings.
 */
import { ACTIONS, RECOGNITION } from "@/lib/data";
import { recordReach } from "../derive";
import type { UnitProfileData } from "../hub-types";
import { descendants } from "../rbac";
import { flag, viewerCan } from "../viewer";
import { hub } from "./hub";
import { getViewer } from "./session";

export async function unitProfile(slug: string): Promise<UnitProfileData | null> {
  const [h, viewer] = await Promise.all([hub(), getViewer()]);
  const unit = h.unit(slug);
  if (!unit || !viewer) return null;
  const state = h.state;
  const org = state.units.find((u) => u.id === unit.slug);
  const reach = recordReach(state.units, unit.slug);
  const tracked = new Set(h.rankings.map((r) => r.short));
  const counts = (m: string) => tracked.has(m.split(" · ")[0]) || !tracked.size;
  const evidence = h.evidence
    .filter((e) => reach.includes(e.unitSlug) && viewerCan(viewer, "evidence", "view", { unitId: e.unitSlug }))
    .map((e) => ({ ...e, mappedTo: e.mappedTo.filter(counts) }));
  const requirements = h.requirements(unit.slug).filter((r) => h.rankings.some((x) => x.slug === r.ranking));
  const owned = h.rankings.flatMap((r) => r.indicators.filter((i) => i.owner === unit.name).map((i) => ({ ranking: r.slug, name: i.name, status: i.status })));
  const mapped = new Set(evidence.flatMap((e) => e.mappedTo.map((m) => m.split(" · ")[0])));
  const coordinators = (org?.adminIds ?? []).flatMap((id) => {
    const account = state.accounts.find((a) => a.id === id && a.status !== "Deactivated");
    return account ? [{ id: account.id, name: account.name, email: account.email, title: account.title, avatar: account.avatar, status: account.status, lastLogin: account.lastLogin }] : [];
  });
  const canEdit = unit.status === "Active" && viewerCan(viewer, "directory", "edit", { unitId: unit.slug });
  const tree = descendants(state.units, unit.slug);
  const code = (id: string) => state.units.find((u) => u.id === id)?.code ?? id;
  return {
    unit: {
      slug: unit.slug,
      name: unit.name,
      code: unit.code,
      kind: unit.kind,
      status: unit.status,
      archivedReason: unit.archivedReason,
      mergedIntoName: unit.mergedIntoName,
      emails: unit.emails,
      adminIds: org?.adminIds ?? [],
      emblem: unit.emblem ?? null,
    },
    coordinators,
    evidence,
    requirements,
    actions: ACTIONS.filter((a) => a.unit === unit.name),
    recognition: RECOGNITION.filter((r) => r.unit === unit.name).map(({ award, reason }) => ({ award, reason })),
    owned,
    deadlines: h.rankings
      .filter((r) => requirements.some((q) => q.ranking === r.slug) || owned.some((o) => o.ranking === r.slug) || mapped.has(r.short))
      .sort((a, b) => a.deadline.localeCompare(b.deadline))
      .map((r) => ({ slug: r.slug, deadline: r.deadline })),
    cycles: h.cycles,
    currentCycle: h.currentCycle,
    insights: flag(viewer, "reuse-insights"),
    canEdit,
    people: canEdit
      ? state.accounts
          .filter((a) => a.status !== "Deactivated")
          .map((a) => ({ id: a.id, name: a.name, email: a.email, unitCode: code(a.unitId), here: tree.includes(a.unitId) }))
          .sort((a, b) => Number(b.here) - Number(a.here) || a.name.localeCompare(b.name))
      : [],
  };
}
