import { AFFILIATIONS } from "./access-requests";
import { ROLE } from "./catalog";
import { activeAssignments } from "./rbac";
import type { AccountRow, RequestRow, UnitRow } from "./console-types";
import type { RequestPayload } from "./types";
import { matchDirectoryEntry, type DirectoryEntry } from "./ust-directory";

type AccessPayload = Extract<RequestPayload, { kind: "account-access" }>;
export type FilterOption = { value: string; label: string };

const key = (s: string) => s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const affiliationValue = (name: string) => `affiliation:${key(name)}`;
const categoryFor = (role: string) => role === ROLE.admin ? "Administrative Office" : role === ROLE.coordinator ? "College/Faculty" : undefined;

function eligibleUnit(unit: UnitRow, role: string, directory: DirectoryEntry[]) {
  const entry = matchDirectoryEntry(unit, directory);
  return entry ? entry.category === categoryFor(role)
    : role === ROLE.admin ? unit.kind === "Office" : role === ROLE.coordinator && (unit.kind === "College" || unit.kind === "Faculty");
}

const unitValue = (unit: UnitRow, directory: DirectoryEntry[]) => {
  const entry = matchDirectoryEntry(unit, directory);
  return entry ? `directory:${entry.key}` : `unit:${unit.id}`;
};

/** A coordinator in a department/program belongs under its college or faculty. */
function unitValues(unitId: string, units: UnitRow[], role: string, directory: DirectoryEntry[]): string[] {
  const seen = new Set<string>();
  let unit = units.find((u) => u.id === unitId);
  while (unit && !seen.has(unit.id)) {
    seen.add(unit.id);
    if (eligibleUnit(unit, role, directory)) return [unitValue(unit, directory)];
    unit = units.find((u) => u.id === unit!.parentId);
  }
  // Also recognize directory keys before an organizational unit has been imported.
  let entry = directory.find((e) => e.key === unitId);
  while (entry) {
    if (entry.category === categoryFor(role)) return [`directory:${entry.key}`];
    entry = directory.find((e) => e.key === entry!.parentKey);
  }
  return [];
}

function requestAffiliations(payload: AccessPayload): string[] {
  return [payload.applicant?.affiliation, payload.applicant?.organization, payload.title].filter((name): name is string => !!name?.trim());
}

function accountAffiliations(account: AccountRow, requests: RequestRow[]): string[] {
  const approved = requests.flatMap((r) => r.status === "Approved" && r.payload.kind === "account-access"
    && r.payload.email.toLowerCase() === account.email.toLowerCase() ? [r.payload] : []);
  return approved.length ? approved.flatMap(requestAffiliations) : [account.title];
}

/**
 * Complete directory choices plus live custom units; affiliations never use the guest's UST host office.
 * `directory`: the University directory (unit_directory), from the reference data.
 */
export function accountFilterOptions(role: string, units: UnitRow[], accounts: AccountRow[], requests: RequestRow[], directory: DirectoryEntry[]): FilterOption[] {
  const options = new Map<string, string>();
  if (role === ROLE.external) {
    const names = [...AFFILIATIONS,
      ...accounts.filter((a) => a.external || a.assignments.some((g) => g.roleId === ROLE.external)).flatMap((a) => accountAffiliations(a, requests)),
      ...requests.flatMap((r) => r.payload.kind === "account-access" && (r.payload.external || r.payload.roleId === ROLE.external) ? requestAffiliations(r.payload) : []),
    ];
    for (const name of names) if (name.trim()) options.set(affiliationValue(name), name.trim());
  } else if (categoryFor(role)) {
    for (const entry of directory.filter((e) => e.category === categoryFor(role))) options.set(`directory:${entry.key}`, entry.name);
    for (const unit of units.filter((u) => u.status === "Active" && eligibleUnit(u, role, directory))) {
      const value = unitValue(unit, directory);
      if (!options.has(value)) options.set(value, unit.name);
    }
  }
  return [...options].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

export function matchesAccountFilter(account: AccountRow, role: string, unit: string, units: UnitRow[], requests: RequestRow[], day: string, directory: DirectoryEntry[]): boolean {
  if (role && !activeAssignments(account, day).some((assignment) => assignment.roleId === role)) return false;
  if (!unit) return true;
  return role === ROLE.external
    ? accountAffiliations(account, requests).some((name) => affiliationValue(name) === unit)
    : unitValues(account.unitId, units, role, directory).includes(unit);
}

export function matchesAccessRequestFilter(payload: AccessPayload, role: string, unit: string, units: UnitRow[], directory: DirectoryEntry[]): boolean {
  if (role && payload.roleId !== role) return false;
  if (!unit) return true;
  if (role === ROLE.external) return requestAffiliations(payload).some((name) => affiliationValue(name) === unit);
  if (payload.unitId) return unitValues(payload.unitId, units, role, directory).includes(unit);
  // Pending requests may name their college/office as their affiliation before an approver assigns a unit.
  const names = requestAffiliations(payload).map(key);
  return accountFilterOptions(role, units, [], [], directory).some((option) => option.value === unit && names.includes(key(option.label)));
}
