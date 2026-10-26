import type { UnitKind } from "@/lib/data";
import type { OrgKind, OrgUnit } from "./types";
import type { RequestUnit } from "./access-requests";
import { UNIT_CATEGORY_LABELS } from "@/lib/unit-categories";
import { matchDirectoryEntry, type DirectoryEntry } from "./ust-directory";

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
  if (entry.category === "Research Center") return "Research Centre";
  if (entry.category === "Program/Department") return entry.name.startsWith("BS ") ? "Program" : "Department";
  if (entry.name.startsWith("Faculty")) return "Faculty";
  return entry.name.includes("College") ? "College" : "Institute";
}

/**
 * Add missing directory entries (unit_directory, through the reference data) while preserving IDs, edits,
 * archived units, coordinators and records.
 */
export function importUstDirectory(existing: OrgUnit[], directory: DirectoryEntry[], at: string): OrgUnit[] {
  const units = structuredClone(existing);
  const ids = new Map<string, string>();
  for (const unit of units) {
    const entry = matchDirectoryEntry(unit, directory);
    if (entry && !ids.has(entry.key)) {
      ids.set(entry.key, unit.id);
      unit.directoryKey = entry.key;
      // Fill missing contact addresses without replacing those edited in the Hub.
      if (!unit.emails?.length) unit.emails = [...entry.emails];
    }
  }
  for (const entry of directory) {
    if (ids.has(entry.key)) continue;
    let id = entry.key.toLowerCase();
    while (units.some((unit) => unit.id === id)) id = `ust-${id}`;
    ids.set(entry.key, id);
    units.push({
      id, directoryKey: entry.key, code: entry.key, name: entry.name, kind: orgKind(entry),
      parentId: null, status: "Active", adminIds: [], emails: [...entry.emails],
      history: [{ at, by: "system", change: "Imported from the University directory" }],
    });
  }
  const root = units.find((unit) => unit.kind === "University")?.id ?? "ust";
  // Resolve parent keys after every entry has an ID, including pre-existing parent units.
  for (const unit of units) {
    if (existing.some((old) => old.id === unit.id)) continue;
    const entry = directory.find((item) => item.key === unit.directoryKey)!;
    unit.parentId = entry.parentKey ? ids.get(entry.parentKey) ?? root : root;
  }
  return units;
}

/**
 * The colleges, faculties, offices and centres a Thomasian can name, grouped under the Directory's three
 * headings (Faculty/Colleges, University Offices, Research Centers), each as a tree in name order.
 */
export function requestUnits(units: Pick<OrgUnit, "id" | "name" | "kind" | "parentId" | "status">[]): { label: string; units: RequestUnit[] }[] {
  const active = units.filter((u) => u.status === "Active" && u.kind !== "University") as OrgUnit[];
  const ids = new Set(active.map((u) => u.id));
  const children = (parent: string | null) => active.filter((u) => (u.parentId && ids.has(u.parentId) ? u.parentId : null) === parent).sort((a, b) => a.name.localeCompare(b.name));
  return (Object.keys(UNIT_CATEGORY_LABELS) as (keyof typeof UNIT_CATEGORY_LABELS)[]).map((section) => {
    const out: RequestUnit[] = [];
    const walk = (u: OrgUnit, depth: number) => {
      out.push({ id: u.id, name: u.name, depth });
      for (const c of children(u.id)) walk(c, depth + 1);
    };
    for (const root of children(null)) if (directorySection(active, root) === section) walk(root, 0);
    return { label: UNIT_CATEGORY_LABELS[section], units: out };
  }).filter((g) => g.units.length);
}
