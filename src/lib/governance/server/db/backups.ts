import "server-only";

/*
 * Recovery point files. A point holds everything restorable in the governance store (not the audit trail and
 * not live sign-ins, which are never rolled back), as gzipped JSON in the R2 private bucket under backups/.
 * public.recovery_point_files records each file's object key, size, schema and SHA-256, checked before a point
 * is verified or restored; public.recovery_points is the catalogue the console shows.
 */
import { gunzipSync, gzipSync } from "node:zlib";
import { adminDb } from "@/lib/supabase/server";
import { deleteObject, getObject, putObject } from "@/lib/r2";
import type { GovernanceState } from "../../types";
import { sha256 } from "./audit";

/** What a recovery point holds. */
export type Restorable = Omit<GovernanceState, "auditHead" | "recentAudit" | "sessions" | "challenges" | "failures">;

const objectKey = (id: string) => `backups/${id}.json.gz`;

export function restorable(state: GovernanceState): Restorable {
  const { auditHead: _h, recentAudit: _a, sessions: _s, challenges: _c, failures: _f, ...rest } = state;
  void _h;
  void _a;
  void _s;
  void _c;
  void _f;
  return rest;
}

/** The file's contents before compression, its SHA-256 and its size. */
export function snapshotBody(state: GovernanceState) {
  const body = JSON.stringify(restorable(state));
  return { body, checksum: sha256(body), bytes: Buffer.byteLength(body) };
}

/** Store a point's file and record it. */
export async function saveBackup(id: string, body: string, schema: number) {
  const key = objectKey(id);
  const gz = gzipSync(body);
  await putObject("private", key, gz, "application/gzip");
  const { error } = await adminDb()
    .from("recovery_point_files")
    .upsert({ point_id: id, object_key: key, sha256: sha256(body), bytes: gz.byteLength, schema, created_at: new Date().toISOString() });
  if (error) throw new Error(`recording ${id} failed (${error.message})`);
}

export async function deleteBackup(id: string) {
  const { data, error } = await adminDb().from("recovery_point_files").select("object_key").eq("point_id", id).maybeSingle();
  if (error) throw new Error(`reading ${id} failed (${error.message})`);
  await deleteObject("private", data?.object_key ?? objectKey(id));
  const { error: gone } = await adminDb().from("recovery_point_files").delete().eq("point_id", id);
  if (gone) throw new Error(`forgetting ${id} failed (${gone.message})`);
}

/** A point's contents, after checking its file against the checksum recorded when it was stored. */
export async function readBackup(id: string): Promise<{ ok: true; data: Restorable & { schema: number } } | { ok: false; reason: string }> {
  const { data: row, error } = await adminDb().from("recovery_point_files").select("object_key, sha256").eq("point_id", id).maybeSingle();
  if (error || !row) return { ok: false, reason: "The recovery point's file is not recorded." };
  const file = await getObject("private", row.object_key).catch(() => null);
  if (!file) return { ok: false, reason: "The recovery point's file is missing from storage." };
  let body: string;
  try {
    body = gunzipSync(Buffer.from(await file.arrayBuffer())).toString("utf8");
  } catch {
    return { ok: false, reason: "The recovery point's file is unreadable." };
  }
  if (sha256(body) !== row.sha256) return { ok: false, reason: "Checksum mismatch: the file changed after it was written." };
  return { ok: true, data: JSON.parse(body) };
}
