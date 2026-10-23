import "server-only";

/*
 * The governance store: one JSON document on disk, held in memory, changed only through serialized
 * transactions. Audit entries are sealed into a SHA-256 hash chain as they are committed, so editing or
 * deleting any entry afterwards is detectable.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { buildSeed, SCHEMA } from "../seed";
import type { AuditEvent, GovernanceState } from "../types";
import type { AuditDraft } from "../engine/core";

const DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "governance.json");
const POINTS = path.join(DIR, "recovery-points");
const GENESIS = "0".repeat(64);

interface Holder {
  state: GovernanceState | null;
  mtime: number;
  queue: Promise<unknown>;
  timer: ReturnType<typeof setTimeout> | null;
}

const g = globalThis as typeof globalThis & { __hubGovernance?: Holder };
const holder: Holder = (g.__hubGovernance ??= { state: null, mtime: 0, queue: Promise.resolve(), timer: null });

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

function write(state: GovernanceState) {
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, FILE);
  holder.mtime = fs.statSync(FILE).mtimeMs;
}

function load(): GovernanceState {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    const parsed = JSON.parse(raw) as GovernanceState;
    if (parsed.schema === SCHEMA) {
      holder.mtime = fs.statSync(FILE).mtimeMs;
      return parsed;
    }
    // A store from an older build: keep it beside the new one rather than losing it.
    fs.copyFileSync(FILE, path.join(DIR, `governance.schema-${parsed.schema ?? 0}.${Date.now()}.json`));
  } catch {
    /* no store yet, or unreadable: start from the seed */
  }
  const s = freshState();
  write(s);
  return s;
}

/** The current state. Picks up changes another server process wrote to disk. */
export function readState(): GovernanceState {
  if (holder.state) {
    try {
      if (fs.statSync(FILE).mtimeMs > holder.mtime + 1) holder.state = null;
    } catch {
      holder.state = null;
    }
  }
  return (holder.state ??= load());
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

/** Run `fn` on a private copy of the state, one transaction at a time, and commit what it returns. */
export function transact<T>(fn: (draft: GovernanceState, current: GovernanceState) => { commit: GovernanceState; result: T }): Promise<T> {
  const run = holder.queue.then(() => {
    const current = readState();
    const draft = structuredClone(current);
    const { commit, result } = fn(draft, current);
    holder.state = commit;
    write(commit);
    return result;
  });
  holder.queue = run.catch(() => undefined);
  return run;
}

/** Record that a session was used, without a full transaction; saved with the next write or shortly after. */
export function touch(sessionId: string, at: string) {
  const s = readState().sessions.find((x) => x.id === sessionId);
  if (!s) return;
  s.lastSeen = at;
  if (holder.timer) return;
  holder.timer = setTimeout(() => {
    holder.timer = null;
    if (holder.state) write(holder.state);
  }, 4000);
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

export function writePoint(state: GovernanceState, id: string): { checksum: string; sizeMB: number } {
  fs.mkdirSync(POINTS, { recursive: true });
  const body = JSON.stringify(restorable(state));
  const checksum = sha256(body);
  fs.writeFileSync(path.join(POINTS, `${id}.json`), JSON.stringify({ id, checksum, body }));
  return { checksum, sizeMB: Math.max(0.01, Math.round((Buffer.byteLength(body) / 1_048_576) * 100) / 100) };
}

function readPoint(id: string): { ok: true; data: ReturnType<typeof restorable> } | { ok: false; reason: string } {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(POINTS, `${id}.json`), "utf8")) as { checksum: string; body: string };
    if (sha256(raw.body) !== raw.checksum) return { ok: false, reason: "Checksum mismatch: the file changed after it was written." };
    const data = JSON.parse(raw.body);
    if (data.schema !== SCHEMA) return { ok: false, reason: `Taken by an older version of the Hub (schema ${data.schema}).` };
    return { ok: true, data };
  } catch {
    return { ok: false, reason: "The recovery point file is missing or unreadable." };
  }
}

export function verifyPoint(id: string) {
  const r = readPoint(id);
  return r.ok ? { ok: true as const, accounts: r.data.accounts.length, units: r.data.units.length } : r;
}

/** Replace everything restorable with the recovery point's contents; the audit trail and sessions carry on. */
export function restoreInto(state: GovernanceState, id: string): { ok: boolean; reason?: string } {
  const r = readPoint(id);
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

export function deletePointFile(id: string) {
  try {
    fs.unlinkSync(path.join(POINTS, `${id}.json`));
  } catch {
    /* sample points have no file */
  }
}

/** The seed, for the prototype reset; the audit trail is kept and continues. */
export function seedInto(state: GovernanceState) {
  const fresh = freshState();
  const keep = { audit: state.audit, sessions: state.sessions, challenges: state.challenges, failures: state.failures };
  Object.assign(state, fresh, keep);
}
