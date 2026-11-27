/*
 * Who a signed-in account is to the Hub, as a pure function of the governance state: the role they act in, its
 * grants, the unit the contributor workspace shows. server/session.ts builds it for a real session; the portal demo
 * (lib/demo-portal) builds it for its fictional people, without a cookie or a database.
 */
import { COMMAND_CONTROL_MODULES, ROLE, roleOf } from "./catalog";
import { flagOn, portalScope, workspacesOf } from "./derive";
import { actingGrants, activeAssignments, assignmentScopeLabel, canWith, initials, mergedPermissions, roleLabel, today } from "./rbac";
import type { Account, Assignment, GovernanceState, Session } from "./types";
import { idleLimit } from "./session-limits";
import type { Viewer } from "./viewer";

/** "Super Administrator · Director" for the Office's people, else the role's own name. */
const nameOfRole = (a: Pick<Assignment, "roleId" | "position">) => {
  const role = roleOf(a.roleId);
  return role ? roleLabel(role, a.position) : a.roleId;
};

export function buildViewer(state: GovernanceState, account: Account, session: Session, now = new Date()): Viewer {
  const day = today(now);
  // Everything below follows the role they are acting in; the others are only listed, to switch to.
  const grants = actingGrants(account, state.units, day, state.config.rolePermissions);
  const acting = grants[0];
  const unitName = (id: string) => state.units.find((u) => u.id === id)?.name ?? id;
  const portal = portalScope(account, grants, state.units);
  const portalUnit = portal.unitId;
  // A coordinator scoped below their faculty works on the faculty's page but files against their own unit.
  const narrow = portal.reach !== "all" && !portal.reach.includes(portalUnit) ? grants.find((g) => g.scopeUnits !== "all")?.scopeUnits : undefined;
  const programId = narrow && narrow !== "all" ? narrow[0] : undefined;
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    title: account.title,
    initials: initials(account.name),
    avatar: account.avatar,
    external: !!account.external,
    unitId: account.unitId,
    unitName: unitName(account.unitId),
    roles: activeAssignments(account, day).map((a) => ({
      assignmentId: a.id,
      id: a.roleId,
      name: nameOfRole(a),
      // Students belong to no College/Faculty or Office: their role is just Student.
      scope: a.roleId === ROLE.student ? "" : assignmentScopeLabel(a, state.units, Object.fromEntries(state.datasets.map((d) => [d.id, d.name]))),
      expires: a.expires,
      active: a.id === acting?.assignmentId,
    })),
    roleName: acting?.roleName ?? "No role",
    grants,
    perms: mergedPermissions(grants),
    workspaces: workspacesOf(grants),
    portal: {
      unitId: portalUnit,
      unitName: unitName(portalUnit),
      programId,
      programName: programId ? unitName(programId) : undefined,
    },
    // The Command & Control console opens on the sections the viewer may see, and only while they act as a Super Administrator.
    commandControl: grants.some((g) => g.roleId === ROLE.superAdmin) ? COMMAND_CONTROL_MODULES.filter((m) => canWith(grants, m, "view")) : [],
    flags: state.config.flags.filter((f) => flagOn(state, f.id, account)).map((f) => f.id),
    features: Object.fromEntries(state.config.features.map((f) => [f.id, f.enabled])),
    dataGrants: (account.dataGrants ?? []).filter((g) => g.until > day),
    session: {
      id: session.id,
      startedAt: session.createdAt,
      ...state.security.session,
      // What applies to this person: 0 when they stay signed in. The policy's own limit stays as policyIdleMinutes.
      idleMinutes: idleLimit(state.security.session, account.sessionPrefs) ?? 0,
      policyIdleMinutes: state.security.session.idleMinutes,
      prefIdleMinutes: account.sessionPrefs?.idleMinutes,
      stay: !!account.sessionPrefs?.stay,
      mfa: session.mfa,
    },
    notify: { email: account.notifyPrefs?.email !== false, off: account.notifyPrefs?.off ?? [] },
  };
}

