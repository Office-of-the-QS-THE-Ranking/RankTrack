/*
 * Two or more of these at once act like separate server instances committing to the store together: each
 * verifies the audit chain three times. Every commit must land (conflicts are retried on newer data), and the
 * chain must stay intact. The verifications stay in the audit trail.
 *
 *   NODE_PATH=scripts/store/shim npx tsx --conditions=react-server --env-file=.env.local scripts/store/concurrency-test.mts & (same again)
 */
import { readState } from "../../src/lib/governance/server/store.ts";
import { runSystem } from "../../src/lib/governance/server/run.ts";
import { execute } from "../../src/lib/governance/engine/index.ts";

const name = process.argv[2] ?? "instance";
await readState();
for (let i = 1; i <= 3; i++) {
  const r = await runSystem((ctx) => execute(ctx, { type: "audit.verify" }));
  console.log(`${name} #${i}: ${r.ok ? "committed" : "refused"} · ${r.message}`);
}
