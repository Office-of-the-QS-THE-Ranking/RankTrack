import { ROLE, ROLE_SECTIONS } from "./catalog";
import type { OrgUnit, RoleId } from "./types";

/** The Directory section a unit's kind belongs to, for who may hold which role there. */
export const unitSection = (unit: Pick<OrgUnit, "kind">): "academic" | "offices" | "research" | undefined =>
  ["Faculty", "College", "Institute", "School"].includes(unit.kind) ? "academic" : unit.kind === "Research Centre" ? "research" : ["Office", "Student Government"].includes(unit.kind) ? "offices" : undefined;

/** Whether someone in this unit may hold the role: Administrators and Coordinators in an office or college, Students in a college. */
export function invitationUnitMatchesRole(unit: Pick<OrgUnit, "kind">, roleId: string): boolean {
  const section = unitSection(unit);
  return !!section && section !== "research" && (ROLE_SECTIONS[roleId as RoleId] ?? []).includes(section);
}

/** What to tell someone who picked a unit the role can't be held in. */
export const roleUnitHint = (roleId: string) => (roleId === ROLE.student ? "Choose a College/Faculty for a Student." : roleId === ROLE.external ? "External partners are guests of a University Office." : "Choose a University Office or a College/Faculty.");
