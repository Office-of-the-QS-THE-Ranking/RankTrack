import "server-only";

/*
 * Reading the audit trail (public.audit_events). Entries are written only by hub_commit, sealed onto the hash
 * chain; the table refuses updates and deletes. Everything here reads it in pages, so the trail can grow without
 * the Hub holding it in memory.
 */
import { createHash } from "node:crypto";
import { adminDb } from "@/lib/supabase/server";
import { alert } from "@/lib/alerts";
import { listObjects, putObject } from "@/lib/r2";
import type { AuditEvent } from "../../types";
import { auditEvent, type Row } from "./rows";

export const GENESIS = "0".repeat(64);
const PAGE = 1000;

const failed = (what: string, e: { message: string }) => new Error(`Audit trail: ${what} failed (${e.message})`);

function canonical(e: Omit<AuditEvent, "prev" | "hash">) {
  return JSON.stringify([e.seq, e.at, e.actorId, e.actorName, e.actorRole, e.action, e.category, e.resource.type, e.resource.id, e.resource.label, e.outcome, e.detail ?? ""]);
}

export const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

/** The hash an entry is sealed with: SHA-256 over the previous entry's hash and the entry's own contents. */
export const sealHash = (prev: string, e: Omit<AuditEvent, "prev" | "hash">) => sha256(`${prev}|${canonical(e)}`);

/** The newest entries, newest first. */
export async function latestAudit(limit: number): Promise<AuditEvent[]> {
  const { data, error } = await adminDb().from("audit_events").select("*").order("seq", { ascending: false }).limit(limit);
  if (error) throw failed("reading", error);
  return (data as Row[]).map(auditEvent);
}

/** Original submission timestamps for already-authorized evidence IDs, without loading the full trail. */
export async function evidenceSubmissionTimes(ids: string[]): Promise<Record<string, string>> {
  const times: Record<string, string> = {};
  const unique = [...new Set(ids)];
  for (let batch = 0; batch < unique.length; batch += 100) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await adminDb().from("audit_events")
        .select("resource_id, at")
        .in("resource_id", unique.slice(batch, batch + 100))
        .eq("resource_type", "Evidence").eq("action", "evidence.submit").eq("outcome", "Success")
        .order("seq").range(from, from + PAGE - 1);
      if (error) throw failed("reading evidence submission times", error);
      for (const row of data) times[row.resource_id] ??= new Date(row.at).toISOString();
      if (data.length < PAGE) break;
    }
  }
  return times;
}

/** Entries by sequence number, in order. */
export async function auditBySeq(seqs: number[]): Promise<AuditEvent[]> {
  const out: AuditEvent[] = [];
  for (let i = 0; i < seqs.length; i += PAGE) {
    const { data, error } = await adminDb().from("audit_events").select("*").in("seq", seqs.slice(i, i + PAGE)).order("seq");
    if (error) throw failed("reading", error);
    out.push(...(data as Row[]).map(auditEvent));
  }
  return out;
}

/** Entries at or after `since`, oldest first, only the columns `columns` names. */
async function auditSince(since: string, columns: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await adminDb().from("audit_events").select(columns).gte("at", since).order("seq").range(from, from + PAGE - 1);
    if (error) throw failed("reading", error);
    out.push(...(data as unknown as Row[]));
    if (data.length < PAGE) return out;
  }
}

/** Entries per Manila day for the console's activity chart: total and refused. */
export async function auditActivity(days: string[], dayKey: (iso: string) => string, since: string) {
  const rows = await auditSince(since, "at, outcome");
  return days.map((day) => {
    const hits = rows.filter((r) => dayKey(new Date(String(r.at)).toISOString()) === day);
    return { day, total: hits.length, denied: hits.filter((r) => r.outcome !== "Success").length };
  });
}

/** The oldest change since `since` that a recovery point does not yet hold (sign-ins and backups are not data). */
export async function oldestUnbacked(since: string | undefined): Promise<string | undefined> {
  let q = adminDb().from("audit_events").select("at").not("category", "in", "(Session,Backup)").order("seq").limit(1);
  if (since) q = q.gt("at", since);
  const { data, error } = await q;
  if (error) throw failed("reading", error);
  return data[0] ? new Date(String(data[0].at)).toISOString() : undefined;
}

/** One person's successful actions, oldest first, and their sessions the policy ended: what the account window's Overview counts. */
export async function auditOfActor(accountId: string): Promise<{ at: string; action: string; detail: string | null }[]> {
  const out: { at: string; action: string; detail: string | null }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await adminDb()
      .from("audit_events")
      .select("at, action, detail")
      .or(`actor_id.eq."${accountId}",and(action.eq.session.timeout,resource_id.eq."${accountId}")`)
      .eq("outcome", "Success")
      .order("seq")
      .range(from, from + PAGE - 1);
    if (error) throw failed("reading", error);
    out.push(...data.map((r) => ({ at: new Date(String(r.at)).toISOString(), action: String(r.action), detail: r.detail === null ? null : String(r.detail) })));
    if (data.length < PAGE) return out;
  }
}

/** One person's latest actions, newest first, whatever the outcome: the account window's Logs. */
export async function latestOfActor(accountId: string, limit: number): Promise<AuditEvent[]> {
  const { data, error } = await adminDb().from("audit_events").select("*").eq("actor_id", accountId).order("seq", { ascending: false }).limit(limit);
  if (error) throw failed("reading", error);
  return (data as Row[]).map(auditEvent);
}

/** Whether this account signed in successfully from this device before (a new device raises an alert). */
export async function knownDevice(accountId: string, device: string): Promise<boolean> {
  const { data, error } = await adminDb()
    .from("audit_events")
    .select("seq")
    .eq("actor_id", accountId)
    .eq("action", "session.signin")
    .eq("outcome", "Success")
    .like("detail", `%${device.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
    .limit(1);
  if (error) throw failed("reading", error);
  return data.length > 0;
}

/*
 * Anchors: at most hourly, the head of the chain (its sequence number and hash) is written to the R2 private
 * bucket as audit-anchors/<seq>-<hash>, an object the database can't reach. Someone able to rewrite the database
 * and recompute every hash still can't make the chain agree with the anchors, so verifyChain reports it.
 */
const ANCHOR_MS = 3_600_000;
const ANCHORS = "audit-anchors/";
const ga = globalThis as typeof globalThis & { __hubAnchor?: { at: number; seq: number } };
const anchored = (ga.__hubAnchor ??= { at: 0, seq: 0 });

export async function anchorAudit() {
  if (Date.now() - anchored.at < ANCHOR_MS) return;
  anchored.at = Date.now();
  try {
    const head = (await latestAudit(1))[0];
    if (!head || head.seq <= anchored.seq) return;
    const key = `${ANCHORS}${String(head.seq).padStart(12, "0")}-${head.hash}`;
    await putObject("private", key, new TextEncoder().encode(JSON.stringify({ seq: head.seq, hash: head.hash, at: new Date().toISOString() })), "application/json");
    anchored.seq = head.seq;
  } catch (e) {
    // Retried at the next commit after the interval.
    void alert("audit-anchor", `Anchoring the audit trail failed: ${(e as Error).message}`);
  }
}

async function readAnchors(): Promise<Map<number, string>> {
  const list = await listObjects("private", ANCHORS);
  return new Map(list.flatMap(({ key }) => {
    const m = /(\d{12})-([0-9a-f]{64})$/.exec(key);
    return m ? [[Number(m[1]), m[2]] as [number, string]] : [];
  }));
}

/**
 * Walk the whole chain from the first entry, page by page: every entry must name the hash of the one before it,
 * hash to what it was sealed with, and match every anchor taken of it. Reports the first entry that breaks it.
 */
export async function verifyChain(): Promise<{ ok: boolean; entries: number; brokenAt?: number; reason?: string }> {
  const anchors = await readAnchors().catch((e: unknown) => (console.error(e), new Map<number, string>()));
  let prev = GENESIS;
  let expected = 1;
  let entries = 0;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await adminDb().from("audit_events").select("*").order("seq").range(from, from + PAGE - 1);
    if (error) throw failed("verifying", error);
    for (const row of data as Row[]) {
      const e = auditEvent(row);
      entries++;
      if (e.seq !== expected || e.prev !== prev) return { ok: false, entries, brokenAt: e.seq, reason: "An entry before it was removed or reordered." };
      const { prev: _p, hash, ...rest } = e;
      void _p;
      if (sealHash(prev, rest) !== hash) return { ok: false, entries, brokenAt: e.seq, reason: "Its contents were changed after it was recorded." };
      const anchor = anchors.get(e.seq);
      if (anchor && anchor !== hash) return { ok: false, entries, brokenAt: e.seq, reason: "It no longer matches the copy anchored outside the database: the trail was rewritten." };
      prev = hash;
      expected++;
    }
    if (data.length < PAGE) {
      const lost = [...anchors.keys()].filter((seq) => seq >= expected);
      if (lost.length) return { ok: false, entries, brokenAt: Math.min(...lost), reason: "Entries anchored outside the database are missing: the end of the trail was removed." };
      return { ok: true, entries };
    }
  }
}
