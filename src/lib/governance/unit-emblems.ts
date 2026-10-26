/*
 * The official arms and seals of UST's faculties, colleges and basic-education schools, keyed by their
 * directory entry. The table unit_emblems holds the catalogue with its provenance and the files are in the R2
 * public bucket: the University's own artwork, trimmed and resized, never redrawn. The reference data carries
 * the catalogue (`emblems`). A logo uploaded in the Directory takes the place of the official one. No server
 * code, so the Directory can import it.
 */
import { matchDirectoryEntry, type DirectoryEntry } from "./ust-directory";
import type { OrgUnit } from "./types";

export interface UnitEmblem {
  /** Directory key, e.g. "C19", or the unit's id for an uploaded logo. */
  key: string;
  /** /media/units/… for the University's arms, or /media/emblems/… for an uploaded logo. */
  src: string;
  /** A shield (the colleges' arms), a round seal (the basic-education schools) or a logo uploaded in the Directory. */
  form: "shield" | "seal" | "logo";
  width: number;
  height: number;
}

/** Logo formats the bucket stores. No SVG: a logo is served from the Hub's own origin. */
export const EMBLEM_TYPES: Record<string, string> = { "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg" };
/** What the Directory lets someone pick: PNG or JPG. The browser compresses it, often to WebP, before upload. */
export const EMBLEM_PICK_TYPES: Record<string, string> = { "image/png": "PNG", "image/jpeg": "JPG" };
export const EMBLEM_MAX_MB = 2;
/** The longest side an uploaded logo keeps. */
export const EMBLEM_MAX_SIDE = 640;

/** Uploaded logos are served from /media/emblems/<uuid>.<ext>. */
const UPLOADED = /^\/media\/(emblems\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|webp|jpg))$/;

/** The bucket path of an uploaded logo, or null for anything that isn't one. */
export const emblemPath = (src: string) => UPLOADED.exec(src)?.[1] ?? null;

/** Uploaded logos use trusted media paths and bounded, positive image dimensions. */
export function validUnitEmblem(value: unknown): value is NonNullable<OrgUnit["emblem"]> {
  if (!value || typeof value !== "object") return false;
  const logo = value as Record<string, unknown>;
  const size = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n > 0 && n <= EMBLEM_MAX_SIDE;
  return typeof logo.src === "string" && !!emblemPath(logo.src) && size(logo.width) && size(logo.height);
}

type Matchable = Pick<OrgUnit, "id" | "name" | "emails" | "directoryKey">;

/** The directory and the arms catalogue, as the reference data carries them. */
export type EmblemCatalogue = { directory: DirectoryEntry[]; emblems: Record<string, UnitEmblem> };

/** The University's arms for a unit, matched through the directory so a renamed or recoded unit keeps them. */
export function officialEmblem(unit: Matchable, catalogue: EmblemCatalogue): UnitEmblem | null {
  const key = matchDirectoryEntry(unit, catalogue.directory)?.key;
  return key ? (catalogue.emblems[key] ?? null) : null;
}

/** What a unit shows as its mark: its uploaded logo, else the University's arms, else nothing (its code). */
export function emblemOf(unit: Matchable & Pick<OrgUnit, "emblem">, catalogue: EmblemCatalogue): UnitEmblem | null {
  if (unit.emblem && emblemPath(unit.emblem.src)) return { key: unit.id, form: "logo", ...unit.emblem };
  return officialEmblem(unit, catalogue);
}
