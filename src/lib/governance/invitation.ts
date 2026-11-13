import { HUB_OFFICE, ROLE, ROLE_SECTIONS, STUDENT_HOME } from "./catalog";
import type { OrgUnit, RoleId } from "./types";

/** The Directory section a unit's kind belongs to, for who may hold which role there. */
export const unitSection = (unit: Pick<OrgUnit, "kind">): "academic" | "offices" | "research" | undefined =>
  ["Faculty", "College", "Institute", "School"].includes(unit.kind) ? "academic" : unit.kind === "Research Centre" ? "research" : ["Office", "Student Government"].includes(unit.kind) ? "offices" : undefined;

/**
 * Whether someone in this unit may hold the role: Super Administrators are the Rankings Office's own people,
 * Administrators and Coordinators head and file for another office or college, External Contributors are the
 * Office's guests, and Students have no unit and are kept with the Office.
 */
export function invitationUnitMatchesRole(unit: Pick<OrgUnit, "id" | "kind">, roleId: string): boolean {
  if (roleId === ROLE.student) return unit.id === STUDENT_HOME;
  if (roleId === ROLE.superAdmin) return unit.id === HUB_OFFICE;
  if ((roleId === ROLE.admin || roleId === ROLE.coordinator) && unit.id === HUB_OFFICE) return false;
  const section = unitSection(unit);
  return !!section && section !== "research" && (ROLE_SECTIONS[roleId as RoleId] ?? []).includes(section);
}

/** What to tell someone who picked a unit the role can't be held in. */
export const roleUnitHint = (roleId: string) => (roleId === ROLE.student ? "Student Organizers belong to no College/Faculty or Office." : roleId === ROLE.superAdmin ? "Super Administrators belong to the Office of QS/THE Rankings." : roleId === ROLE.external ? "External partners are guests of a University Office." : "Choose a University Office or a College/Faculty other than the Rankings Office.");
