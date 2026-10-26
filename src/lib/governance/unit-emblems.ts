/*
 * The official arms and seals of UST's faculties, colleges and basic-education schools, keyed by their
 * directory entry. The files in public/brand/units are the University's own artwork, trimmed and resized,
 * never redrawn. The table unit_emblems holds the same catalogue with its provenance; this copy is what the
 * Hub shows when the database can't be reached (server/emblems.ts). A logo uploaded in the Directory takes
 * the place of the official one. No server code, so the Directory can import it.
 */
import { matchDirectoryEntry } from "./ust-directory";
import type { OrgUnit } from "./types";

export interface UnitEmblem {
  /** Directory key, e.g. "C19", or the unit's id for an uploaded logo. */
  key: string;
  /** Path under public/, or /media/emblems/… for an uploaded logo. */
  src: string;
  /** A shield (the colleges' arms), a round seal (the basic-education schools) or a logo uploaded in the Directory. */
  form: "shield" | "seal" | "logo";
  width: number;
  height: number;
}

export const UNIT_EMBLEMS: Record<string, UnitEmblem> = {
  C01: { key: "C01", src: "/brand/units/c01.webp", form: "shield", width: 265, height: 320 },
  C02: { key: "C02", src: "/brand/units/c02.webp", form: "shield", width: 265, height: 320 },
  C03: { key: "C03", src: "/brand/units/c03.webp", form: "shield", width: 265, height: 320 },
  C04: { key: "C04", src: "/brand/units/c04.webp", form: "shield", width: 265, height: 320 },
  C05: { key: "C05", src: "/brand/units/c05.webp", form: "shield", width: 265, height: 320 },
  C06: { key: "C06", src: "/brand/units/c06.webp", form: "shield", width: 265, height: 320 },
  C07: { key: "C07", src: "/brand/units/c07.webp", form: "shield", width: 265, height: 320 },
  C08: { key: "C08", src: "/brand/units/c08.webp", form: "shield", width: 265, height: 320 },
  C09: { key: "C09", src: "/brand/units/c09.webp", form: "shield", width: 265, height: 320 },
  C10: { key: "C10", src: "/brand/units/c10.webp", form: "shield", width: 266, height: 320 },
  C11: { key: "C11", src: "/brand/units/c11.webp", form: "shield", width: 265, height: 320 },
  C12: { key: "C12", src: "/brand/units/c12.webp", form: "shield", width: 265, height: 320 },
  C13: { key: "C13", src: "/brand/units/c13.webp", form: "shield", width: 265, height: 320 },
  C14: { key: "C14", src: "/brand/units/c14.webp", form: "shield", width: 265, height: 320 },
  C15: { key: "C15", src: "/brand/units/c15.webp", form: "shield", width: 265, height: 320 },
  C16: { key: "C16", src: "/brand/units/c16.webp", form: "shield", width: 265, height: 320 },
  C17: { key: "C17", src: "/brand/units/c17.webp", form: "shield", width: 265, height: 320 },
  C18: { key: "C18", src: "/brand/units/c18.webp", form: "shield", width: 265, height: 320 },
  C19: { key: "C19", src: "/brand/units/c19.webp", form: "shield", width: 265, height: 320 },
  C20: { key: "C20", src: "/brand/units/c20.webp", form: "shield", width: 265, height: 320 },
  C21: { key: "C21", src: "/brand/units/c21.webp", form: "shield", width: 265, height: 320 },
  C22: { key: "C22", src: "/brand/units/c22.webp", form: "shield", width: 265, height: 320 },
  C23: { key: "C23", src: "/brand/units/c23.webp", form: "seal", width: 319, height: 320 },
  C24: { key: "C24", src: "/brand/units/c24.webp", form: "seal", width: 320, height: 320 },
  C25: { key: "C25", src: "/brand/units/c25.webp", form: "seal", width: 320, height: 320 },
};

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

/** The University's arms for a unit, matched through the directory so a renamed or recoded unit keeps them. */
export function officialEmblem(unit: Matchable, catalogue: Record<string, UnitEmblem> = UNIT_EMBLEMS): UnitEmblem | null {
  const key = matchDirectoryEntry(unit)?.key;
  return key ? (catalogue[key] ?? null) : null;
}

/** What a unit shows as its mark: its uploaded logo, else the University's arms, else nothing (its code). */
export function emblemOf(unit: Matchable & Pick<OrgUnit, "emblem">, catalogue?: Record<string, UnitEmblem>): UnitEmblem | null {
  if (unit.emblem && emblemPath(unit.emblem.src)) return { key: unit.id, form: "logo", ...unit.emblem };
  return officialEmblem(unit, catalogue);
}
