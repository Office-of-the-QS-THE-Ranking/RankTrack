/*
 * Matching units to the University's directory (ust_directory.csv), which lives in Supabase (unit_directory) and
 * reaches code as the reference data's `directory`.
 */
import type { DirectoryEntry } from "@/lib/reference";
import type { OrgUnit } from "./types";

export type { DirectoryEntry };

const directoryName = (name: string) => name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const LEGACY_KEYS: Record<string, string> = { secgen: "A10", simbahayan: "A19", careers: "A21" };

/** Resolve existing units without combining the three faculties that share a contact email. */
export function matchDirectoryEntry(unit: Pick<OrgUnit, "id" | "name" | "emails" | "directoryKey">, directory: DirectoryEntry[]): DirectoryEntry | undefined {
  const named = directory.find((entry) => entry.key === (unit.directoryKey ?? LEGACY_KEYS[unit.id] ?? unit.id))
    ?? directory.find((entry) => directoryName(entry.name) === directoryName(unit.name));
  if (named) return named;
  const byEmail = directory.filter((entry) => unit.emails?.some((email) => entry.emails.some((other) => other.toLowerCase() === email.toLowerCase())));
  return byEmail.length === 1 ? byEmail[0] : undefined;
}
