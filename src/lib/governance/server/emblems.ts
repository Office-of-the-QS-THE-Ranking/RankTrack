import "server-only";

/*
 * The University's unit emblems from the unit_emblems table, falling back to the bundled catalogue when the
 * table can't be read. Read once a minute at most: the catalogue changes only when the University issues new
 * arms. A logo uploaded in the Directory still comes first (emblemOf).
 */
import { adminDb } from "@/lib/supabase/server";
import { UNIT_EMBLEMS, type UnitEmblem } from "../unit-emblems";

const TTL_MS = 60_000;
const g = globalThis as typeof globalThis & { __hubEmblems?: { at: number; rows: Record<string, UnitEmblem> } };

export async function emblemCatalogue(): Promise<Record<string, UnitEmblem>> {
  const cached = g.__hubEmblems;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.rows;
  let rows = UNIT_EMBLEMS;
  try {
    const { data, error } = await adminDb().from("unit_emblems").select("unit_key, file_path, form, width, height");
    if (!error && data?.length) {
      rows = Object.fromEntries(data.map((r) => [r.unit_key, { key: r.unit_key, src: r.file_path, form: r.form, width: r.width, height: r.height }]));
    }
  } catch {
    // Keep the bundled catalogue.
  }
  g.__hubEmblems = { at: Date.now(), rows };
  return rows;
}

