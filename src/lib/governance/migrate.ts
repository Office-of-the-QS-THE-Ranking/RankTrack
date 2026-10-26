/*
 * Upgrades a stored governance model to the current schema. Pure: the store calls it on its tables' contents
 * when an older build wrote them, and on recovery points taken by an older build, so neither is ever re-seeded
 * over real records. Up to schema 8 the store was one JSON document (hub_state); schema 9 is the relational store.
 */
import { ROLE } from "./catalog";
import { importUstDirectory } from "./directory";
import type { DirectoryEntry } from "./ust-directory";
import { SCHEMA, WORKFLOWS } from "./seed";
import type { Assignment, GovernanceState, RoleId } from "./types";

/** Schema 4 had nine built-in roles and custom ones; schema 5 had three; schema 10 has four. */
const LEGACY_ROLES: Record<string, RoleId> = {
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

/** Older documents carried fields the relational store drops (the audit trail moved to its own table at 9). */
type Legacy = { roles?: unknown; templates?: unknown; audit?: unknown };
type LegacyRecords = { postViews?: unknown };
type Stored = Omit<GovernanceState, "schema" | "records"> & { schema: number; records: GovernanceState["records"] & LegacyRecords } & Legacy;

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
function from6(s: Stored, directory: DirectoryEntry[]): Stored {
  s.units = importUstDirectory(s.units, directory, new Date().toISOString());
  return { ...s, schema: 7 };
}

/** Schema 8 starts anonymous view counts; past audience activity is not reconstructed. */
function from7(s: Stored): Stored {
  s.records.postViewsStartedAt ??= new Date().toISOString();
  return { ...s, schema: 8 };
}

/**
 * Schema 9 is the relational store: the audit trail lives in audit_events, outside the model, and post views
 * only in hub_post_views (the document's own counts were never used: it held none when they moved).
 */
function from8(s: Stored): Stored {
  delete s.audit;
  delete s.records.postViews;
  return { ...s, schema: 9 };
}

/**
 * Schema 10 has four roles: University Administrator becomes Administrator (held University-wide, it still runs
 * the Hub), and Student joins Coordinator and External. Supabase migration 20261027300000 does the same to the tables.
 */
function from9(s: Stored): Stored {
  const id = (r: string) => (r === "university-admin" ? ROLE.admin : (r as RoleId));
  for (const a of s.accounts) {
    a.assignments = a.assignments.map((x) => ({ ...x, roleId: id(x.roleId) }));
    if (a.title === "Super Administrator" || a.title === "University Administrator") a.title = "Administrator";
  }
  s.security.mfa.roles = s.security.mfa.roles.map(id);
  for (const r of s.requests) if (r.payload.kind === "account-access" || r.payload.kind === "privilege-escalation") r.payload.roleId = id(r.payload.roleId);
  return { ...s, schema: 10 };
}

/**
 * The model at the current schema, or null when it comes from a schema this build can't upgrade.
 * `directory`: the University directory (unit_directory), which schema 7 imports.
 */
export function migrate<T extends { schema: number }>(doc: T, directory: DirectoryEntry[]): T | null {
  let s = structuredClone(doc) as unknown as Stored;
  if (s.schema === 4) s = from4(s);
  if (s.schema === 5) s = from5(s);
  if (s.schema === 6) s = from6(s, directory);
  if (s.schema === 7) s = from7(s);
  if (s.schema === 8) s = from8(s);
  if (s.schema === 9) s = from9(s);
  return s.schema === SCHEMA ? (s as unknown as T) : null;
}
