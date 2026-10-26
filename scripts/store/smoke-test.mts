/*
 * Exercises the relational store through the Hub's own code, as the system: read the store, verify the audit
 * chain, run a restoration test of the newest recovery point (its file comes back from R2), and check what
 * was committed. Both are real operational checks and stay in the audit trail.
 *
 *   NODE_PATH=scripts/store/shim npx tsx --conditions=react-server --env-file=.env.local scripts/store/smoke-test.mts
 */
import { readState } from "../../src/lib/governance/server/store.ts";
import { runSystem } from "../../src/lib/governance/server/run.ts";
import { execute } from "../../src/lib/governance/engine/index.ts";
import { adminDb } from "../../src/lib/supabase/server.ts";

const t0 = Date.now();
const before = await readState();
console.log(`read: ${before.accounts.length} accounts, ${before.units.length} units, audit head ${before.auditHead.seq}, ${before.backup.points.length} points (${Date.now() - t0} ms)`);

const verified = await runSystem((ctx) => execute(ctx, { type: "audit.verify" }));
console.log("audit.verify:", verified.ok, verified.message);

const point = before.backup.points.find((p) => p.status === "Completed")!;
const tested = await runSystem((ctx) => execute(ctx, { type: "backup.test", pointId: point.id }));
console.log(`backup.test ${point.id}:`, tested.ok, tested.message);

const after = await readState();
const { data: meta } = await adminDb().from("hub_meta").select("version").single();
const { data: files } = await adminDb().from("recovery_point_files").select("point_id, bytes, schema").order("point_id", { ascending: false }).limit(2);
console.log(`after: version ${meta!.version}, audit head ${after.auditHead.seq} (+${after.auditHead.seq - before.auditHead.seq}), points ${after.backup.points.length}, newest file ${JSON.stringify(files?.[0])}`);
console.log("latest test:", JSON.stringify(after.backup.tests[0]));
console.log("new audit entries:", after.recentAudit.filter((e) => e.seq > before.auditHead.seq).map((e) => `${e.seq} ${e.action} ${e.outcome}`).join(" · "));
const reverify = await runSystem((ctx) => execute(ctx, { type: "audit.verify" }));
console.log("re-verify:", reverify.message);
