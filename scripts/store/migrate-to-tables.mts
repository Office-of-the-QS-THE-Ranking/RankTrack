/*
 * One-off: move the governance store from the hub_state JSON document into the relational tables
 * (supabase/migrations/20261026230000_relational_store.sql), and its recovery points from hub_recovery_points
 * into the R2 private bucket. Refuses to run once the tables hold a store. Checks the audit chain before copying,
 * commits everything in one hub_commit, then reads the store back and compares it with the document.
 *
 *   npx tsx --env-file=.env.local scripts/store/migrate-to-tables.mts
 */
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";
import { AwsClient } from "aws4fetch";
import { auditRow, fromRows, toRows } from "../../src/lib/governance/server/db/rows.ts";

const env = process.env as Record<string, string>;
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const r2 = new AwsClient({ accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY, service: "s3", region: "auto" });
const bucket = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_PRIVATE_BUCKET}`;
const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
const GENESIS = "0".repeat(64);
const SCHEMA = 9;

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

// 1. The tables must be empty.
const { data: meta } = await db.from("hub_meta").select("version").maybeSingle();
if (meta) fail(`The relational store already exists (version ${meta.version}). Nothing was changed.`);

// 2. The document.
const { data: row, error } = await db.from("hub_state").select("schema, version, state").eq("id", 1).single();
if (error || !row) fail(`hub_state could not be read: ${error?.message}`);
if (row.schema !== 8) fail(`hub_state is at schema ${row.schema}; this script moves schema 8.`);
const doc = row.state as Record<string, any>;
console.log(`hub_state: schema ${row.schema}, version ${row.version}, ${doc.accounts.length} accounts, ${doc.units.length} units, ${doc.audit.length} audit entries`);

// 3. The audit chain must be intact before it is copied.
const canonical = (e: any) => JSON.stringify([e.seq, e.at, e.actorId, e.actorName, e.actorRole, e.action, e.category, e.resource.type, e.resource.id, e.resource.label, e.outcome, e.detail ?? ""]);
let prev = GENESIS;
for (const [i, e] of (doc.audit as any[]).entries()) {
  const { prev: p, hash, ...rest } = e;
  if (e.seq !== i + 1 || p !== prev || sha256(`${prev}|${canonical(rest)}`) !== hash) fail(`The audit chain breaks at entry ${e.seq}. Nothing was changed.`);
  prev = hash;
}
console.log(`✓ audit chain intact: ${doc.audit.length} entries, head ${prev.slice(0, 12)}…`);

// 4. Schema 8 → 9 (migrate.ts from8): the trail leaves the model, and the unused postViews go.
const audit = doc.audit as any[];
const model = structuredClone(doc);
delete model.audit;
delete model.schema;
delete model.records.postViews;
const tables = toRows(model as any);
const upserts = Object.entries(tables).filter(([, rows]) => rows.length).map(([table, rows]) => ({ table, rows }));
console.log(`rows: ${upserts.map((u) => `${u.table}=${u.rows.length}`).join(" ")}`);

// 5. One commit creates the store with every row and the whole trail.
const { data: version, error: commitError } = await db.rpc("hub_commit", { p_version: 0, p_schema: SCHEMA, p_deletes: [], p_upserts: upserts, p_audit: audit.map(auditRow) });
if (commitError || version === null) fail(`hub_commit failed: ${commitError?.message ?? "another store appeared"}`);
console.log(`✓ store created at version ${version}`);

// 6. Recovery points: each body to R2 as gzipped JSON, recorded with its checksum.
const { data: points, error: pointsError } = await db.from("hub_recovery_points").select("id, checksum, body");
if (pointsError) fail(`hub_recovery_points could not be read: ${pointsError.message}`);
for (const p of points!) {
  if (sha256(p.body) !== p.checksum) {
    console.warn(`! ${p.id}: its checksum does not match; copied as is, and verifying it will report the mismatch`);
  }
  const key = `backups/${p.id}.json.gz`;
  const gz = gzipSync(p.body);
  const res = await r2.fetch(`${bucket}/${key}`, { method: "PUT", body: gz, headers: { "Content-Type": "application/gzip", "Content-Length": String(gz.byteLength) } });
  if (!res.ok) fail(`R2 refused ${key}: ${res.status} ${await res.text()}`);
  const back = await r2.fetch(`${bucket}/${key}`);
  if (!back.ok || sha256(Buffer.from(await back.arrayBuffer())) !== sha256(gz)) fail(`${key} did not read back intact`);
  const { error: recError } = await db.from("recovery_point_files").upsert({ point_id: p.id, object_key: key, sha256: p.checksum, bytes: gz.byteLength, schema: JSON.parse(p.body).schema ?? 8 });
  if (recError) fail(`recording ${p.id} failed: ${recError.message}`);
}
console.log(`✓ ${points!.length} recovery points stored in R2 (backups/) and recorded`);

// 7. Read the store back and compare.
const { data: snap, error: snapError } = await db.rpc("hub_snapshot", { p_recent_since: "1970-01-01T00:00:00Z" });
if (snapError || !snap) fail(`hub_snapshot failed: ${snapError?.message}`);
const s = snap as any;
const back = fromRows(s.tables);
const norm = (v: any): any => (Array.isArray(v) ? v.map(norm) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])])) : v);
const want = JSON.stringify(norm(JSON.parse(JSON.stringify(model))));
const got = JSON.stringify(norm(JSON.parse(JSON.stringify(back))));
if (want !== got) {
  const a = JSON.parse(want), b = JSON.parse(got);
  for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) console.error(`  differs: ${k}`);
  fail("The store read back differs from the document (see above).");
}
if (s.auditHead?.seq !== audit.length || s.auditHead?.hash !== prev) fail(`Audit head ${s.auditHead?.seq} ${s.auditHead?.hash} does not match the document's.`);
if (s.recentAudit.length !== audit.length) fail(`${s.recentAudit.length} audit entries read back, ${audit.length} expected.`);
console.log(`✓ read back identical: ${back.accounts.length} accounts, ${back.units.length} units, ${s.recentAudit.length} audit entries, head matches`);
console.log("Done. Next: apply the cutover migration (sign-in gate on the tables), then retire hub_state.");
