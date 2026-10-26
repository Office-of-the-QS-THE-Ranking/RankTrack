import "server-only";

/*
 * The governance store: one JSON document in Supabase (table hub_state), changed only through serialized
 * transactions that commit with optimistic concurrency, so every server instance shares it safely. Audit
 * entries are sealed into a SHA-256 hash chain as they are committed, so editing or deleting any entry
 * afterwards is detectable. Recovery points live beside it (table hub_recovery_points).
 */
import { createHash } from "node:crypto";
import { adminDb } from "@/lib/supabase/server";
import { migrate } from "../migrate";
import { buildSeed, SCHEMA, SYSTEM_ACTOR } from "../seed";
import type { AuditEvent, GovernanceState } from "../types";
import type { AuditDraft } from "../engine/core";
import { removeMedia, syncPublicMedia } from "./media";

const GENESIS = "0".repeat(64);
/** How long a read trusts the copy in memory before asking the database whether another instance changed it. */
const FRESH_MS = 1000;
/** How often a session's last activity is written back, at most. */
const TOUCH_MS = 60_000;
const ATTEMPTS = 5;

type PointOp = { op: "put"; id: string; checksum: string; body: string } | { op: "delete"; id: string } | { op: "media"; paths: string[] };

interface Holder {
  state: GovernanceState | null;
  version: number;
  checkedAt: number;
  reading: Promise<GovernanceState> | null;
  queue: Promise<unknown>;
  /** Recovery point writes and media deletions of the transaction attempt in progress, applied once it commits. */
  pending: PointOp[] | null;
}

const g = globalThis as typeof globalThis & { __hubStore?: Holder };
const holder: Holder = (g.__hubStore ??= { state: null, version: 0, checkedAt: 0, reading: null, queue: Promise.resolve(), pending: null });

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

function canonical(e: Omit<AuditEvent, "prev" | "hash">) {
  return JSON.stringify([e.seq, e.at, e.actorId, e.actorName, e.actorRole, e.action, e.category, e.resource.type, e.resource.id, e.resource.label, e.outcome, e.detail ?? ""]);
}

export const sealHash = (prev: string, e: Omit<AuditEvent, "prev" | "hash">) => sha256(`${prev}|${canonical(e)}`);

function freshState(): GovernanceState {
  const seed = buildSeed();
  let prev = GENESIS;
  const audit = seed.audit.map((e) => {
    const hash = sealHash(prev, e);
    const sealed = { ...e, prev, hash };
    prev = hash;
    return sealed;
  });
  return { ...structuredClone(seed), audit } as GovernanceState;
}

const failed = (what: string, e: { message: string }) => new Error(`Governance store: ${what} failed (${e.message})`);

/** A state and the version it was read at, always together: a commit names the version its draft started from. */
type Snapshot = { state: GovernanceState; version: number };

async function fetchRow(): Promise<Snapshot | null> {
  const { data, error } = await adminDb().from("hub_state").select("schema, version, state").eq("id", 1).maybeSingle();
  if (error) throw failed("reading", error);
  if (!data) return null;
  const row = { state: data.state as GovernanceState, version: Number(data.version) };
  return data.schema === SCHEMA ? row : upgrade(data.schema, row);
}

/** Never re-seed over real records: an older store is migrated in place, and the migration is audited. */
async function upgrade(schema: number, row: Snapshot): Promise<Snapshot | null> {
  const state = migrate({ ...row.state, schema });
  if (!state)
    throw new Error(`Governance store: it holds schema ${schema} and this build expects ${SCHEMA}, with no migration between them. Deleting the hub_state row starts the Hub empty.`);
  seal(state, [
    {
      at: new Date().toISOString(),
      actorId: SYSTEM_ACTOR.id,
      actorName: SYSTEM_ACTOR.name,
      actorRole: SYSTEM_ACTOR.role,
      action: "store.migrate",
      category: "Configuration",
      resource: { type: "Governance store", id: "hub_state", label: "Governance store" },
      outcome: "Success",
      detail: `Schema ${schema} → ${SCHEMA}`,
    },
  ]);
  const { data, error } = await adminDb()
    .from("hub_state")
    .update({ schema: SCHEMA, state, version: row.version + 1, updated_at: new Date().toISOString() })
    .eq("id", 1)
    .eq("version", row.version)
    .select("version");
  if (error) throw failed("migrating", error);
  // Another instance migrated it first: read theirs.
  return data.length ? { state, version: row.version + 1 } : fetchRow();
}

/** The first read anywhere: the seed goes in, unless another instance put it there first. */
async function seedRow(): Promise<Snapshot> {
  const state = freshState();
  const { error } = await adminDb().from("hub_state").insert({ id: 1, schema: SCHEMA, version: 1, state });
  if (!error) return { state, version: 1 };
  if (error.code !== "23505") throw failed("seeding", error);
  const row = await fetchRow();
  if (!row) throw failed("seeding", error);
  return row;
}

function remember(row: Snapshot) {
  holder.state = row.state;
  holder.version = row.version;
  holder.checkedAt = Date.now();
  return row;
}

async function load() {
  return remember((await fetchRow()) ?? (await seedRow()));
}

/** The copy in memory if the database is still at its version, else the database's. */
async function refresh(): Promise<Snapshot> {
  if (holder.state?.schema === SCHEMA) {
    const known = { state: holder.state, version: holder.version };
    const { data, error } = await adminDb().from("hub_state").select("version").eq("id", 1).maybeSingle();
    if (error) throw failed("reading", error);
    if (data && Number(data.version) === known.version) {
      holder.checkedAt = Date.now();
      return known;
    }
  }
  return load();
}

/** The current state. Read it, never change it: changes go through transact. */
export function readState(): Promise<GovernanceState> {
  if (holder.state?.schema === SCHEMA && Date.now() - holder.checkedAt < FRESH_MS) return Promise.resolve(holder.state);
  return (holder.reading ??= refresh()
    .then((s) => s.state)
    .finally(() => {
      holder.reading = null;
    }));
}

/** Seal drafted audit entries onto the end of the chain. */
export function seal(state: GovernanceState, drafts: AuditDraft[]) {
  let prev = state.audit.at(-1)?.hash ?? GENESIS;
  let seq = state.audit.at(-1)?.seq ?? 0;
  for (const d of drafts) {
    const e = { ...d, seq: ++seq };
    const hash = sealHash(prev, e);
    state.audit.push({ ...e, prev, hash });
    prev = hash;
  }
}

type Change<T> = { commit: GovernanceState; result: T };

/**
 * Run `fn` on a private copy of the state, one transaction at a time in this instance, and commit what it
 * returns if no other instance committed meanwhile; otherwise `fn` runs again on the newer state.
 */
export function transact<T>(fn: (draft: GovernanceState, current: GovernanceState) => Change<T> | Promise<Change<T>>): Promise<T> {
  const run = holder.queue.then(async () => {
    for (let attempt = 1; ; attempt++) {
      const { state: current, version } = await refresh();
      holder.pending = [];
      let change: Change<T>;
      let ops: PointOp[];
      try {
        change = await fn(structuredClone(current), current);
      } finally {
        ops = holder.pending ?? [];
        holder.pending = null;
      }
      const { data, error } = await adminDb()
        .from("hub_state")
        .update({ state: change.commit, version: version + 1, updated_at: new Date().toISOString() })
        .eq("id", 1)
        .eq("version", version)
        .select("version");
      if (error) throw failed("saving", error);
      if (data.length) {
        remember({ state: change.commit, version: version + 1 });
        await applyPoints(ops);
        await syncPublicMedia(current, change.commit);
        return change.result;
      }
      if (attempt === ATTEMPTS) throw new Error("Governance store: too many changes at once. Try again in a moment.");
    }
  });
  holder.queue = run.catch(() => undefined);
  return run;
}

/** Record that a session was used. The store is written at most once a minute per session. */
export async function touch(sessionId: string, at: string) {
  const s = (await readState()).sessions.find((x) => x.id === sessionId);
  if (!s || Date.parse(at) - Date.parse(s.lastSeen) < TOUCH_MS) return;
  await transact((draft) => {
    const d = draft.sessions.find((x) => x.id === sessionId);
    if (d && d.lastSeen < at) d.lastSeen = at;
    return { commit: draft, result: undefined };
  });
}

/* ---------- Audit verification ---------- */

export function verifyChain(state: GovernanceState): { ok: boolean; entries: number; brokenAt?: number; reason?: string } {
  let prev = GENESIS;
  for (const e of state.audit) {
    if (e.prev !== prev) return { ok: false, entries: state.audit.length, brokenAt: e.seq, reason: "An entry before it was removed or reordered." };
    const { prev: _p, hash, ...rest } = e;
    void _p;
    if (sealHash(prev, rest) !== hash) return { ok: false, entries: state.audit.length, brokenAt: e.seq, reason: "Its contents were changed after it was recorded." };
    prev = hash;
  }
  return { ok: true, entries: state.audit.length };
}

/* ---------- Recovery points ---------- */

/** What a recovery point holds: everything except the audit trail and live sign-ins, which are never rolled back. */
function restorable(state: GovernanceState) {
  const { audit: _a, sessions: _s, challenges: _c, failures: _f, ...rest } = state;
  void _a;
  void _s;
  void _c;
  void _f;
  return rest;
}

function queue(op: PointOp) {
  if (!holder.pending) throw new Error("Governance store: recovery points and media change only inside a transaction.");
  holder.pending.push(op);
}

/** Remove post pictures from the media bucket once the transaction commits. */
export function deleteMediaLater(paths: string[]) {
  queue({ op: "media", paths });
}

/** Take a recovery point of the state as it stands; it is saved once the transaction commits. */
export function writePoint(state: GovernanceState, id: string): { checksum: string; sizeMB: number } {
  const body = JSON.stringify(restorable(state));
  const checksum = sha256(body);
  queue({ op: "put", id, checksum, body });
  return { checksum, sizeMB: Math.max(0.01, Math.round((Buffer.byteLength(body) / 1_048_576) * 100) / 100) };
}

/** Remove a recovery point once the transaction commits. */
export function deletePoint(id: string) {
  queue({ op: "delete", id });
}

async function applyPoints(ops: PointOp[]) {
  const table = () => adminDb().from("hub_recovery_points");
  const puts = ops.flatMap((o) => (o.op === "put" ? [{ id: o.id, checksum: o.checksum, body: o.body }] : []));
  const deletes = ops.flatMap((o) => (o.op === "delete" ? [o.id] : []));
  // The state already names these points; if saving one fails, verifying it reports the gap.
  if (puts.length) {
    const { error } = await table().upsert(puts);
    if (error) console.error(failed("saving a recovery point", error).message);
  }
  if (deletes.length) {
    const { error } = await table().delete().in("id", deletes);
    if (error) console.error(failed("deleting a recovery point", error).message);
  }
  await removeMedia(ops.flatMap((o) => (o.op === "media" ? o.paths : [])));
}

async function readPoint(id: string): Promise<{ ok: true; data: ReturnType<typeof restorable> } | { ok: false; reason: string }> {
  const { data: row, error } = await adminDb().from("hub_recovery_points").select("checksum, body").eq("id", id).maybeSingle();
  if (error || !row) return { ok: false, reason: "The recovery point is missing or unreadable." };
  if (sha256(row.body) !== row.checksum) return { ok: false, reason: "Checksum mismatch: the point changed after it was written." };
  const data = migrate(JSON.parse(row.body));
  if (!data) return { ok: false, reason: "Taken by a version of the Hub this one can't read." };
  return { ok: true, data };
}

export async function verifyPoint(id: string) {
  const r = await readPoint(id);
  return r.ok ? { ok: true as const, accounts: r.data.accounts.length, units: r.data.units.length } : r;
}

/** Replace everything restorable with the recovery point's contents; the audit trail and sessions carry on. */
export async function restoreInto(state: GovernanceState, id: string): Promise<{ ok: boolean; reason?: string }> {
  const r = await readPoint(id);
  if (!r.ok) return r;
  const keep = { audit: state.audit, sessions: state.sessions, challenges: state.challenges, failures: state.failures };
  // Keep the catalogue of recovery points current, including this one and any taken after it.
  const points = state.backup.points;
  const tests = state.backup.tests;
  const counters = state.records.counters;
  Object.assign(state, structuredClone(r.data), keep);
  state.backup.points = points;
  state.backup.tests = tests;
  // Identifiers never repeat, even across a restore.
  for (const [k, n] of Object.entries(counters)) state.records.counters[k] = Math.max(n, state.records.counters[k] ?? 0);
  return { ok: true };
}
