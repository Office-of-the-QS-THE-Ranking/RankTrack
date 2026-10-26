import type { EvidenceItem } from "@/lib/data";
import { participationKind } from "./directory";
import { recordReach } from "./derive";
import type { HubUnit } from "./hub-types";
import { emblemOf, type UnitEmblem } from "./unit-emblems";
import type { GovernanceState } from "./types";

/** Every reporting unit comes from the live directory, regardless of how or when it was added. */
export function buildUnits(state: GovernanceState, evidence: EvidenceItem[], emblems?: Record<string, UnitEmblem>): HubUnit[] {
  return state.units.flatMap((unit) => {
    const kind = participationKind(unit);
    if (!kind) return [];
    const reach = recordReach(state.units, unit.id);
    const mine = evidence.filter((item) => reach.includes(item.unitSlug));
    const validated = mine.filter((item) => item.status === "Validated");
    const coordinators = unit.adminIds.flatMap((id) => {
      const account = state.accounts.find((candidate) => candidate.id === id && candidate.status !== "Deactivated");
      return account ? [account] : [];
    });
    return [{
      slug: unit.id,
      name: unit.name,
      kind,
      coordinator: coordinators.map((account) => account.name).join(", ") || "No coordinator assigned",
      coordinatorId: coordinators[0]?.id,
      emails: unit.emails ?? [],
      code: unit.code,
      emblem: emblemOf(unit, emblems),
      status: unit.status,
      archivedReason: unit.archivedReason,
      mergedInto: unit.mergedInto,
      mergedIntoName: state.units.find((other) => other.id === unit.mergedInto)?.name,
      assigned: mine.length,
      completed: mine.filter((item) => item.status !== "Not yet submitted").length,
      validated: validated.length,
      revisions: mine.filter((item) => item.status === "Needs revision").length,
      rankingsServed: new Set(validated.flatMap((item) => item.mappedTo.map((mapping) => mapping.split(" · ")[0]))).size,
      assistance: state.records.assistance.some((request) => reach.includes(request.unitSlug)),
      programs: state.units
        .filter((child) => child.parentId === unit.id || state.units.find((parent) => parent.id === child.parentId)?.parentId === unit.id)
        .filter((child) => child.kind === "Department" || child.kind === "Program")
        .map((child) => ({ id: child.id, name: child.name, status: child.status })),
    }];
  });
}
