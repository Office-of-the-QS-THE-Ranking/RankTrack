import type { UnitKind } from "@/lib/data";
import type { OrgKind, OrgUnit } from "./types";
import { UST_DIRECTORY, matchDirectoryEntry, type DirectoryEntry } from "./ust-directory";

export type DirectorySection = "academic" | "offices" | "research";
export type UnitCreationKind = "College" | "Office" | "Research Centre";

/** The Add unit form offers category-specific parents, plus the University root. */
export function matchesUnitParent(parent: Pick<OrgUnit, "kind">, kind: UnitCreationKind): boolean {
  if (parent.kind === "University") return true;
  if (kind === "College") return participationKind(parent) === "Faculty or college";
  return parent.kind === kind;
}

/** Departments follow their academic, office or research parent; the University is shared context only. */
export function directorySection(units: OrgUnit[], unit: OrgUnit): DirectorySection | undefined {
  if (unit.kind === "University") return undefined;
  const seen = new Set<string>();
  let current: OrgUnit | undefined = unit;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (["Faculty", "College", "Institute", "School"].includes(current.kind)) return "academic";
    if (current.kind === "Research Centre") return "research";
    if (["Office", "Student Government"].includes(current.kind)) return "offices";
    current = units.find((parent) => parent.id === current!.parentId);
  }
  return "offices";
}

/** Reporting uses the organizational directory, including units with no submissions or coordinator yet. */
export function participationKind(unit: Pick<OrgUnit, "kind">): UnitKind | undefined {
  if (["Faculty", "College", "Institute"].includes(unit.kind)) return "Faculty or college";
  if (unit.kind === "Research Centre") return "Research centre";
  if (unit.kind === "Office") return "Office";
}

function orgKind(entry: DirectoryEntry): OrgKind {
  if (entry.category === "Administrative Office") return "Office";
  if (entry.category === "Basic Education") return "School";
  if (entry.category === "Student Government") return "Student Government";
  if (entry.category === "Program/Department") return entry.name.startsWith("BS ") ? "Program" : "Department";
  if (entry.name.startsWith("Faculty")) return "Faculty";
  return entry.name.includes("College") ? "College" : "Institute";
}

/** Add missing directory entries while preserving IDs, edits, archived units, coordinators and records. */
export function importUstDirectory(existing: OrgUnit[], at: string): OrgUnit[] {
  const units = structuredClone(existing);
  const ids = new Map<string, string>();
  for (const unit of units) {
    const entry = matchDirectoryEntry(unit);
    if (entry && !ids.has(entry.key)) {
      ids.set(entry.key, unit.id);
      unit.directoryKey = entry.key;
      // Fill missing contact addresses without replacing those edited in the Hub.
      if (!unit.emails?.length) unit.emails = [...entry.emails];
    }
  }
  for (const entry of UST_DIRECTORY) {
    if (ids.has(entry.key)) continue;
    let id = entry.key.toLowerCase();
    while (units.some((unit) => unit.id === id)) id = `ust-${id}`;
    ids.set(entry.key, id);
    units.push({
      id, directoryKey: entry.key, code: entry.key, name: entry.name, kind: orgKind(entry),
      parentId: null, status: "Active", adminIds: [], emails: [...entry.emails],
      history: [{ at, by: "system", change: "Imported from ust_directory.csv" }],
    });
  }
  const root = units.find((unit) => unit.kind === "University")?.id ?? "ust";
  // Resolve parent keys after every entry has an ID, including pre-existing parent units.
  for (const unit of units) {
    if (existing.some((old) => old.id === unit.id)) continue;
    const entry = UST_DIRECTORY.find((item) => item.key === unit.directoryKey)!;
    unit.parentId = entry.parentKey ? ids.get(entry.parentKey) ?? root : root;
  }
  return units;
}
