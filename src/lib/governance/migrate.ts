/*
 * Upgrades a stored governance document to the current schema. Pure: the store calls it on the live row
 * and on recovery points taken by an older build, so neither is ever re-seeded over real records.
 */
import { ROLE } from "./catalog";
import { importUstDirectory } from "./directory";
import { SCHEMA, WORKFLOWS } from "./seed";
import type { Assignment, GovernanceState, RoleId } from "./types";

/** Schema 4 had nine built-in roles and custom ones; schema 5 has three. */
const LEGACY_ROLES: Record<string, RoleId> = {
  "super-admin": ROLE.admin,
  "system-admin": ROLE.admin,
  "university-admin": ROLE.admin,
  reviewer: ROLE.admin,
  auditor: ROLE.admin,
  "unit-admin": ROLE.coordinator,
  "program-coordinator": ROLE.coordinator,
  contributor: ROLE.coordinator,
  external: ROLE.external,
};

/** The role a schema 4 role id becomes. Custom roles become the coordinator role, the least a staff member holds. */
export const legacyRole = (id: string, external = false): RoleId => (external ? ROLE.external : LEGACY_ROLES[id] ?? ROLE.coordinator);

/** One assignment per role and scope: the one that lasts longest wins. */
function dedupe(list: Assignment[]): Assignment[] {
  const out = new Map<string, Assignment>();
  for (const a of list) {
    const key = `${a.roleId}|${JSON.stringify(a.scope)}`;
    const cur = out.get(key);
    if (!cur || (cur.expires && (!a.expires || a.expires > cur.expires))) out.set(key, a);
  }
  return [...out.values()];
}

type Stored = Omit<GovernanceState, "schema"> & { schema: number; roles?: unknown; templates?: unknown };

function from4(s: Stored): Stored {
  for (const a of s.accounts) a.assignments = dedupe(a.assignments.map((x) => ({ ...x, roleId: legacyRole(x.roleId, !!a.external) })));
  s.security.mfa.roles = [...new Set(s.security.mfa.roles.map((r) => legacyRole(r)))];
  for (const r of s.requests) {
    const p = r.payload;
    if (p.kind === "account-access") p.roleId = legacyRole(p.roleId, !!p.external);
    if (p.kind === "privilege-escalation") p.roleId = legacyRole(p.roleId, !!s.accounts.find((a) => a.id === p.accountId)?.external);
  }
  // Steps no longer name approver roles; switches and response times stay as they were set.
  s.workflows = WORKFLOWS.map((w) => {
    const cur = s.workflows.find((x) => x.id === w.id);
    return { ...structuredClone(w), ...(cur ? { enabled: cur.enabled, slaDays: cur.slaDays, separation: cur.separation } : {}) };
  });
  delete s.records.counters.role;
  delete s.roles;
  delete s.templates;
  return { ...s, schema: 5 };
}

/** Schema 6 adds Impact and Innovation posts. */
function from5(s: Stored): Stored {
  s.records.posts ??= [];
  s.records.counters.post ??= 0;
  return { ...s, schema: 6 };
}

/** Schema 7 imports the full UST directory without replacing existing units or their history. */
function from6(s: Stored): Stored {
  s.units = importUstDirectory(s.units, new Date().toISOString());
  return { ...s, schema: 7 };
}

/** Schema 8 starts anonymous view counts; past audience activity is not reconstructed. */
function from7(s: Stored): Stored {
  s.records.postViews ??= {};
  s.records.postViewsStartedAt ??= new Date().toISOString();
  return { ...s, schema: 8 };
}

/** The document at the current schema, or null when it comes from a schema this build can't upgrade. */
export function migrate<T extends { schema: number }>(doc: T): T | null {
  let s = structuredClone(doc) as unknown as Stored;
  if (s.schema === 4) s = from4(s);
  if (s.schema === 5) s = from5(s);
  if (s.schema === 6) s = from6(s);
  if (s.schema === 7) s = from7(s);
  return s.schema === SCHEMA ? (s as unknown as T) : null;
}
