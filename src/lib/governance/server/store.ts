import "server-only";

/*
 * The governance store: Supabase tables, one per entity (supabase/migrations/20261026230000_relational_store.sql).
 * The engine works on the model those tables hold (types.ts), read whole through public.hub_snapshot and kept in
 * memory while the store's version stays the same. Changes go through serialized transactions: a transaction
 * works on a private copy, and its commit sends only the rows that changed, with the audit entries it sealed, to
 * public.hub_commit, which applies them in one database transaction if no other server instance committed
 * since; otherwise the transaction runs again on the newer data. The audit trail (public.audit_events) is
 * append-only and hash-chained; only its head and its last day are held in memory. Recovery points are gzipped
 * files in the R2 private bucket (db/backups.ts).
 */
import { alert } from "@/lib/alerts";
import { adminDb } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { migrate } from "../migrate";
import { buildSeed, SCHEMA, SYSTEM_ACTOR } from "../seed";
import type { GovernanceState } from "../types";
import type { AuditDraft } from "../engine/core";
import { GENESIS, sealHash } from "./db/audit";
import { deleteBackup, readBackup, saveBackup, snapshotBody, type Restorable } from "./db/backups";
import { auditEvent, auditRow, diff, fromRows, toRows, type Row, type Tables } from "./db/rows";
import { releaseMedia, syncPublicMedia } from "./media";
import { reference } from "./reference";

export { sha256, sealHash, verifyChain } from "./db/audit";

/** How long a read trusts the copy in memory before asking the database whether another instance changed it. */
const FRESH_MS = 1000;
/** How often a session's last activity is written back, at most. */
const TOUCH_MS = 60_000;
const ATTEMPTS = 5;
/** How much of the audit trail the model holds: what the engine's recent-activity checks look at. */
const RECENT_MS = 86_400_000;

type PendingOp = { op: "put"; id: string; body: string } | { op: "delete"; id: string } | { op: "release"; paths: string[] };

/** A model, the version of the store it was read at, and its rows (what a commit is diffed against). */
type Snapshot = { state: GovernanceState; version: number; rows: Tables };

interface Holder {
  snapshot: Snapshot | null;
  checkedAt: number;
  reading: Promise<Snapshot> | null;
  queue: Promise<unknown>;
  /** Recovery point files and media deletions of the transaction attempt in progress, applied once it commits. */
  pending: PendingOp[] | null;
}

const g = globalThis as typeof globalThis & { __hubTables?: Holder };
const holder: Holder = (g.__hubTables ??= { snapshot: null, checkedAt: 0, reading: null, queue: Promise.resolve(), pending: null });
// next dev keeps globalThis across edits, so a copy read by the code before an edit (without a field the model
// has since gained) would outlive it and break every commit: this code reads the store again.
holder.snapshot = null;

const failed = (what: string, e: { message: string }) => new Error(`Governance store: ${what} failed (${e.message})`);

const recentSince = (now = Date.now()) => new Date(now - RECENT_MS).toISOString();

/* ---------- Reading ---------- */

interface SnapshotPayload {
  schema: number;
  version: number;
  tables: Tables;
  auditHead: { seq: number; hash: string } | null;
  recentAudit: Row[];
}

async function fetchSnapshot(): Promise<SnapshotPayload | null> {
  const { data, error } = await adminDb().rpc("hub_snapshot", { p_recent_since: recentSince() });
  if (error) throw failed("reading", error);
  return (data as unknown as SnapshotPayload | null) ?? null;
}

function modelOf(p: SnapshotPayload): GovernanceState {
  return {
    schema: p.schema,
    ...fromRows(p.tables),
    auditHead: p.auditHead ? { seq: Number(p.auditHead.seq), hash: p.auditHead.hash } : { seq: 0, hash: GENESIS },
    recentAudit: p.recentAudit.map(auditEvent),
  };
}

function remember(s: Snapshot) {
  holder.snapshot = s;
  holder.checkedAt = Date.now();
  return s;
}

async function load(): Promise<Snapshot> {
  const payload = await fetchSnapshot();
  if (!payload) return remember(await seedStore());
  const state = modelOf(payload);
  const snapshot = { state, version: Number(payload.version), rows: toRows(state) };
  if (payload.schema === SCHEMA) return remember(snapshot);
  return remember(await upgrade(snapshot));
}

/**
 * Sessions' last activity, written by touch() without a new store version: copied into the model and its rows
 * alike, so housekeeping sees who is active and a later commit has nothing to write back. Never earlier than
 * what the copy holds (hub_commit keeps the later time too).
 */
function mergeLastSeen(s: Snapshot, seen: { id: string; last_seen: string }[]) {
  const at = new Map(seen.map((x) => [x.id, new Date(x.last_seen).toISOString()]));
  for (const x of s.state.sessions) {
    const t = at.get(x.id);
    if (t && t > x.lastSeen) x.lastSeen = t;
  }
  for (const row of s.rows.sessions ?? []) {
    const t = at.get(String(row.id));
    if (t && t > String(row.last_seen)) row.last_seen = t;
  }
}

/** The copy in memory if the store is still at its version, else the store's. */
async function refresh(): Promise<Snapshot> {
  const known = holder.snapshot;
  if (known) {
    const db = adminDb();
    const [meta, seen] = await Promise.all([db.from("hub_meta").select("version").eq("id", 1).maybeSingle(), db.from("sessions").select("id, last_seen")]);
    if (meta.error) throw failed("reading", meta.error);
    if (meta.data && Number(meta.data.version) === known.version) {
      if (!seen.error) mergeLastSeen(known, seen.data);
      holder.checkedAt = Date.now();
      return known;
    }
  }
  return load();
}

function current(): Promise<Snapshot> {
  if (holder.snapshot && Date.now() - holder.checkedAt < FRESH_MS) return Promise.resolve(holder.snapshot);
  return (holder.reading ??= refresh().finally(() => {
    holder.reading = null;
  }));
}

/** The current model. Read it, never change it: changes go through transact. */
export async function readState(): Promise<GovernanceState> {
  return (await current()).state;
}

/* ---------- Writing ---------- */

/** Seal drafted audit entries onto the end of the chain; they are written when the transaction commits. */
export function seal(state: GovernanceState, drafts: AuditDraft[]) {
  let { seq, hash: prev } = state.auditHead;
  for (const d of drafts) {
    const e = { ...d, seq: ++seq };
    const hash = sealHash(prev, e);
    state.recentAudit.push({ ...e, prev, hash });
    prev = hash;
  }
  state.auditHead = { seq, hash: prev };
}

/**
 * Write `next` over `base`: the changed rows and the audit entries sealed after `base`'s head, in one database
 * transaction. Returns the new version, or null when another instance committed first.
 */
async function commit(base: Snapshot | null, next: GovernanceState): Promise<Snapshot | null> {
  const rows = toRows(next);
  const changes = diff(base?.rows ?? null, rows);
  const head = base?.state.auditHead.seq ?? 0;
  const audit = next.recentAudit.filter((e) => e.seq > head);
  if (base && !changes.count && !audit.length) return { ...base, state: next };
  const { data, error } = await adminDb().rpc("hub_commit", {
    p_version: base?.version ?? 0,
    p_schema: SCHEMA,
    p_deletes: changes.deletes as unknown as Json,
    p_upserts: changes.upserts as unknown as Json,
    p_audit: audit.map(auditRow) as unknown as Json,
  });
  if (error) {
    void alert("store-save", error.message);
    throw failed("saving", error);
  }
  if (data === null) return null;
  const since = recentSince();
  next.recentAudit = next.recentAudit.filter((e) => e.at >= since);
  return { state: next, version: Number(data), rows };
}

/** A store never opened: the seed goes in, unless another instance put one there first. */
async function seedStore(): Promise<Snapshot> {
  const seed = buildSeed(await reference());
  const { audit, ...rest } = structuredClone(seed);
  const state: GovernanceState = { ...rest, auditHead: { seq: 0, hash: GENESIS }, recentAudit: [] };
  seal(state, audit);
  const done = await commit(null, state);
  if (done) return done;
  const payload = await fetchSnapshot();
  if (!payload) throw new Error("Governance store: seeding failed and no store exists.");
  const model = modelOf(payload);
  return { state: model, version: Number(payload.version), rows: toRows(model) };
}

/** A store an older build wrote: brought up to this schema in place, and the change audited. */
async function upgrade(s: Snapshot): Promise<Snapshot> {
  const from = s.state.schema;
  const next = migrate(structuredClone(s.state), (await reference()).directory);
  if (!next) throw new Error(`Governance store: it holds schema ${from} and this build expects ${SCHEMA}, with no migration between them.`);
  next.schema = SCHEMA;
  seal(next, [
    {
      at: new Date().toISOString(),
      actorId: SYSTEM_ACTOR.id,
      actorName: SYSTEM_ACTOR.name,
      actorRole: SYSTEM_ACTOR.role,
      action: "store.migrate",
      category: "Configuration",
      resource: { type: "Governance store", id: "hub_meta", label: "Governance store" },
      outcome: "Success",
      detail: `Schema ${from} → ${SCHEMA}`,
    },
  ]);
  const done = await commit(s, next);
  if (done) return done;
  // Another instance upgraded it first: read theirs.
  const payload = await fetchSnapshot();
  if (!payload) throw new Error("Governance store: the store disappeared during an upgrade.");
  const model = modelOf(payload);
  return { state: model, version: Number(payload.version), rows: toRows(model) };
}

type Change<T> = { commit: GovernanceState; result: T };

/**
 * Run `fn` on a private copy of the model, one transaction at a time in this instance, and commit what it
 * returns if no other instance committed meanwhile; otherwise `fn` runs again on the newer data.
 */
export function transact<T>(fn: (draft: GovernanceState, current: GovernanceState) => Change<T> | Promise<Change<T>>): Promise<T> {
  const run = holder.queue.then(async () => {
    for (let attempt = 1; ; attempt++) {
      const base = await refresh();
      holder.pending = [];
      let change: Change<T>;
      let ops: PendingOp[];
      try {
        change = await fn(structuredClone(base.state), base.state);
      } finally {
        ops = holder.pending ?? [];
        holder.pending = null;
      }
      const done = await commit(base, change.commit);
      if (done) {
        remember(done);
        await applyPending(ops, done.state.schema);
        await syncPublicMedia(base.state, done.state);
        return change.result;
      }
      if (attempt === ATTEMPTS) throw new Error("Governance store: too many changes at once. Try again in a moment.");
    }
  });
  holder.queue = run.catch(() => undefined);
  return run;
}

/**
 * Record that a session was used, at most once a minute. A plain update of the session's row, outside the store's
 * versions: every instance picks it up on its next refresh, and no instance has to reload the whole store for it.
 */
export async function touch(sessionId: string, at: string) {
  const snap = await current();
  const s = snap.state.sessions.find((x) => x.id === sessionId);
  if (!s || Date.parse(at) - Date.parse(s.lastSeen) < TOUCH_MS) return;
  const { error } = await adminDb().from("sessions").update({ last_seen: at }).eq("id", sessionId).lt("last_seen", at);
  if (error) return console.error(failed("recording activity", error).message);
  mergeLastSeen(snap, [{ id: sessionId, last_seen: at }]);
}

/* ---------- Recovery points ---------- */

function queue(op: PendingOp) {
  if (!holder.pending) throw new Error("Governance store: recovery points and media change only inside a transaction.");
  holder.pending.push(op);
}

/** Release pictures and files nothing shows any more once the transaction commits (see releaseMedia). */
export function releaseMediaLater(paths: string[]) {
  queue({ op: "release", paths });
}

/** How many side effects the transaction attempt has queued, to drop those of a command that is then refused. */
export function pendingMark() {
  return holder.pending?.length ?? 0;
}

export function dropPendingAfter(mark: number) {
  if (holder.pending) holder.pending.length = Math.min(mark, holder.pending.length);
}

/** Take a recovery point of the model as it stands; its file is stored once the transaction commits. */
export function writePoint(state: GovernanceState, id: string): { checksum: string; sizeMB: number } {
  const { body, checksum, bytes } = snapshotBody(state);
  queue({ op: "put", id, body });
  return { checksum, sizeMB: Math.max(0.01, Math.round((bytes / 1_048_576) * 100) / 100) };
}

/** Remove a recovery point's file once the transaction commits. */
export function deletePoint(id: string) {
  queue({ op: "delete", id });
}

async function applyPending(ops: PendingOp[], schema: number) {
  // The catalogue already names these points; if storing a file fails, verifying the point reports the gap.
  const done = new Set<string>();
  for (const o of ops) {
    if (o.op === "release") continue;
    const key = `${o.op}:${o.id}`;
    if (done.has(key)) continue;
    done.add(key);
    try {
      if (o.op === "put") await saveBackup(o.id, o.body, schema);
      else await deleteBackup(o.id);
    } catch (e) {
      void alert("recovery-point", `Recovery point ${o.id} (${o.op}) failed: ${(e as Error).message}`);
    }
  }
  await releaseMedia([...new Set(ops.flatMap((o) => (o.op === "release" ? o.paths : [])))]);
}

async function readPoint(id: string): Promise<{ ok: true; data: Restorable } | { ok: false; reason: string }> {
  const r = await readBackup(id);
  if (!r.ok) return r;
  const data = migrate(r.data, (await reference()).directory);
  if (!data) return { ok: false, reason: "Taken by a version of the Hub this one can't read." };
  return { ok: true, data };
}

export async function verifyPoint(id: string) {
  const r = await readPoint(id);
  return r.ok ? { ok: true as const, accounts: r.data.accounts.length, units: r.data.units.length } : r;
}

/** Replace everything restorable with the recovery point's contents; the audit trail and sign-ins carry on. */
export async function restoreInto(state: GovernanceState, id: string): Promise<{ ok: boolean; reason?: string }> {
  const r = await readPoint(id);
  if (!r.ok) return r;
  const keep = { auditHead: state.auditHead, recentAudit: state.recentAudit, sessions: state.sessions, challenges: state.challenges, failures: state.failures };
  // Keep the catalogue of recovery points current, including this one and any taken after it.
  const points = state.backup.points;
  const tests = state.backup.tests;
  const counters = state.records.counters;
  Object.assign(state, structuredClone(r.data), keep, { schema: SCHEMA });
  state.backup.points = points;
  state.backup.tests = tests;
  // Identifiers never repeat, even across a restore.
  for (const [k, n] of Object.entries(counters)) state.records.counters[k] = Math.max(n, state.records.counters[k] ?? 0);
  return { ok: true };
}
