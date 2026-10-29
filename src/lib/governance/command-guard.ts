/*
 * What a browser sends as a command is untrusted: a Server Function accepts any serializable value, whatever the
 * TypeScript types say. Before the engine sees it, a command must be a plain JSON object of a known type, of
 * bounded size and depth. Each handler still checks its own fields; the engine refuses a handler that throws.
 */
import type { Command } from "./commands";

const TYPES = [
  "role.permissions",
  "account.invite", "account.keep", "account.reauth", "account.resend", "account.revoke", "account.status", "account.transfer", "account.update",
  "alert.update", "assignment.add", "assignment.remove", "assistance.request", "audit.export", "audit.verify",
  "backup.request", "backup.run", "backup.schedule", "backup.test",
  "config.body", "config.bodyAdd", "config.cycle", "config.cycleAdd", "config.dashboard", "config.feature", "config.flag", "config.period",
  "config.periodAdd", "config.ranking", "config.site", "config.template", "config.uploads", "config.year", "config.yearAdd",
  "data.submit", "dataset.update", "dataset.version", "deadline.apply", "deadline.dismiss", "deadline.set", "document.delete", "document.save", "document.status", "dsr.create", "dsr.update", "duplicate.resolve",
  "evidence.map", "evidence.respond", "evidence.review", "evidence.submit", "form.delete", "form.duplicate", "form.portal", "form.save", "form.status",
  "incident.report", "incident.update", "innovation.propose", "key.rotate", "notice.read", "pia.save",
  "post.delete", "post.save", "post.status", "report.export", "report.publish",
  "request.cancel", "request.create", "request.decide", "request.review", "retention.run",
  "review.complete", "review.decide", "review.start", "rule.run", "rule.toggle", "security.policy", "story.propose", "story.state", "term.update",
  "unit.archive", "unit.coordinator", "unit.create", "unit.merge", "unit.move", "unit.reactivate", "unit.update", "workflow.update",
  "workdoc.delete", "workdoc.save", "workdoc.status",
  "workspace.add", "workspace.archive", "workspace.delete", "workspace.edit", "workspace.folder", "workspace.folderDelete",
] as const satisfies readonly Command["type"][];

// Every command type is listed: a type added to Command but not here fails to compile.
type Unlisted = Exclude<Command["type"], (typeof TYPES)[number]>;
const complete: [Unlisted] extends [never] ? true : Unlisted = true;
void complete;

const KNOWN = new Set<string>(TYPES);
/** A post's markup is the largest thing a command carries (POST_LIMITS.markup); this leaves room around it. */
const MAX_BYTES = 512 * 1024;
const MAX_DEPTH = 12;
const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);

function plainJson(v: unknown, depth: number): boolean {
  if (v === null || typeof v === "string" || typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isFinite(v);
  if (depth > MAX_DEPTH || typeof v !== "object") return false;
  if (Array.isArray(v)) return v.every((x) => plainJson(x, depth + 1));
  const proto = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return false;
  return Object.entries(v).every(([k, x]) => !FORBIDDEN.has(k) && (x === undefined || plainJson(x, depth + 1)));
}

/** The command, or why it can't be one. */
export function checkCommand(raw: unknown): { ok: true; cmd: Command } | { ok: false; message: string } {
  const bad = { ok: false as const, message: "That request isn't one the Hub recognises. Reload the page and try again." };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return bad;
  const type = (raw as { type?: unknown }).type;
  if (typeof type !== "string" || !KNOWN.has(type)) return bad;
  if (!plainJson(raw, 0)) return bad;
  if (JSON.stringify(raw).length > MAX_BYTES) return { ok: false, message: "That change is too large to save in one go." };
  return { ok: true, cmd: raw as Command };
}
