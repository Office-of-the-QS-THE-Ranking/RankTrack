import { ROLE } from "./catalog";
import type { OrgUnit } from "./types";

/** Invitations target reporting units, never their degree programs or departments. */
export function invitationUnitMatchesRole(unit: Pick<OrgUnit, "kind">, roleId: string): boolean {
  if (roleId === ROLE.coordinator) return unit.kind === "Faculty" || unit.kind === "College" || unit.kind === "Institute";
  if (roleId === ROLE.admin || roleId === ROLE.external) return unit.kind === "Office";
  return false;
}
