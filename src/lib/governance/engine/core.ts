/*
 * The command engine's shared pieces. Handlers receive a draft of the state and a context naming the
 * actor; they authorize, change the draft, and record audit entries. The store commits the draft and
 * seals the audit entries into the hash chain.
 */
import type { Reference } from "@/lib/reference";
import { SYSTEM_ACTOR } from "../seed";
import { UNIT_EMAILS } from "../catalog";
import { canWith, grantsFor, today, topGrant, type Grant, type Target } from "../rbac";
import type { CommandResult } from "../commands";
import type { Account, Action, AuditCategory, AuditEvent, GovernanceState, ModuleKey, Notice } from "../types";

export type AuditDraft = Omit<AuditEvent, "seq" | "prev" | "hash">;

export type Effect =
  | { kind: "snapshot"; pointId: string }
  | { kind: "verify-point"; pointId: string; testId: string }
  | { kind: "restore"; pointId: string }
  | { kind: "delete-point"; pointId: string }
  | { kind: "verify-audit" }
  /** Pictures a post no longer shows; files no other post uses leave the media bucket once the change commits. */
  | { kind: "delete-media"; srcs: string[] };

export interface Actor {
  id: string;
  name: string;
  role: string;
  grants: Grant[];
  /** Hub automation (sign-in bookkeeping, housekeeping), which acts outside the roles. */
  system?: boolean;
  account?: Account;
}

export interface Ctx {
  state: GovernanceState;
  actor: Actor;
  now: Date;
  day: string;
  iso: string;
  drafts: AuditDraft[];
  effects: Effect[];
  /** The reference data (ranking frameworks, dictionary, lists) the rules check against. */
  ref: Reference;
}

export function actorFor(state: GovernanceState, account: Account, now = new Date()): Actor {
  const grants = grantsFor(account, state.units, today(now));
  return { id: account.id, name: account.name, role: topGrant(grants)?.roleName ?? "No role", grants, account };
}

export const SYSTEM: Actor = { id: SYSTEM_ACTOR.id, name: SYSTEM_ACTOR.name, role: SYSTEM_ACTOR.role, grants: [], system: true };

export const GUEST: Actor = { id: "guest", name: "Access request form", role: "Not signed in", grants: [] };

export function makeCtx(state: GovernanceState, actor: Actor, ref: Reference, now = new Date()): Ctx {
  return { state, actor, now, day: today(now), iso: now.toISOString(), drafts: [], effects: [], ref };
}

export function log(
  ctx: Ctx,
  action: string,
  category: AuditCategory,
  resource: { type: string; id: string; label: string },
  outcome: AuditEvent["outcome"] = "Success",
  detail?: string,
  actor: Actor = ctx.actor,
) {
  ctx.drafts.push({ at: ctx.iso, actorId: actor.id, actorName: actor.name, actorRole: actor.role, action, category, resource, outcome, detail });
}

export const ok = (message: string, extra: Partial<CommandResult> = {}): CommandResult => ({ ok: true, message, ...extra });

/** Refuse, and record the refusal: access-control failures belong in the audit trail. */
export function deny(ctx: Ctx, action: string, category: AuditCategory, resource: { type: string; id: string; label: string }, reason: string): CommandResult {
  log(ctx, action, category, resource, "Denied", reason);
  return { ok: false, message: reason };
}

/** A validation problem: nothing was attempted, so nothing is logged. */
export const invalid = (message: string): CommandResult => ({ ok: false, message });

export const can = (ctx: Ctx, m: ModuleKey, a: Action, t: Target = {}) => !!ctx.actor.system || canWith(ctx.actor.grants, m, a, t);

export function nextId(ctx: Ctx, key: string, prefix: string, pad = 3) {
  const n = (ctx.state.records.counters[key] ?? 0) + 1;
  ctx.state.records.counters[key] = n;
  return `${prefix}${String(n).padStart(pad, "0")}`;
}

export const accountById = (ctx: Ctx, id: string) => ctx.state.accounts.find((a) => a.id === id);
export const unitById = (ctx: Ctx, id: string) => ctx.state.units.find((u) => u.id === id);
export const nameOf = (ctx: Ctx, id: string) => (id === "system" ? SYSTEM.name : id === "guest" ? "Access request form" : accountById(ctx, id)?.name ?? id);

/** Fill a notification template: {name} placeholders from `vars`. */
export function fill(ctx: Ctx, templateId: string, vars: Record<string, string | number>): { subject: string; body: string; enabled: boolean } {
  const t = ctx.state.config.templates.find((x) => x.id === templateId);
  const sub = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
  return t ? { subject: sub(t.subject), body: sub(t.body), enabled: t.enabled } : { subject: "", body: "", enabled: false };
}

/** Post an in-app notification built from a template, if the template is switched on. */
export function notify(ctx: Ctx, to: string, templateId: string, vars: Record<string, string | number>, href: string) {
  const msg = fill(ctx, templateId, vars);
  if (!msg.enabled) return;
  const t = ctx.state.config.templates.find((x) => x.id === templateId);
  if (t && t.channel === "Email") return;
  const notice: Notice = { id: nextId(ctx, "notice", "NT-"), at: ctx.iso, to, text: msg.body, href, templateId, readBy: [] };
  ctx.state.notices.unshift(notice);
  ctx.state.notices = ctx.state.notices.slice(0, 300);
}

export const MAX = { name: 120, text: 2000, note: 600 };

export const clean = (s: unknown, max = MAX.name) => (typeof s === "string" ? s.trim().replace(/\s+/g, " ").slice(0, max) : "");

export const cleanText = (s: unknown, max = MAX.text) => (typeof s === "string" ? s.trim().slice(0, max) : "");

export const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

/** Optional unit contacts, normalized once before creation or approval. */
export function readUnitEmails(value: unknown): string[] | string {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((email) => typeof email !== "string")) return "Enter unit email addresses as separate fields.";
  const emails = [...new Set(value.map((email: string) => email.trim().toLowerCase()).filter(Boolean))];
  if (emails.length > UNIT_EMAILS) return `List up to ${UNIT_EMAILS} email addresses.`;
  if (emails.some((email) => email.length > 254 || !isEmail(email))) return "Enter an email address, like office@ust.edu.ph.";
  return emails;
}
