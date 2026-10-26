/*
 * Privacy and security: authentication policy, access reviews, privacy assessments, data subject
 * requests, alerts, keys and incidents. These settings support the University's policies and the Data
 * Privacy Act of 2012; no single setting makes the Hub compliant on its own.
 */
import { ROLE, roleOf } from "../catalog";
import type { Command, CommandResult } from "../commands";
import { addDays } from "../derive";
import type { SecurityAlert } from "../types";
import { accountById, actorFor, can, clean, cleanText, deny, invalid, isDay, isEmail, log, nextId, ok, type Ctx } from "./core";
import { revokeSessions } from "./mutations";

const POLICY = { type: "Policy", id: "security", label: "Privacy and security policy" };

export function raiseAlert(ctx: Ctx, kind: SecurityAlert["kind"], severity: SecurityAlert["severity"], detail: string, accountId?: string) {
  const alert: SecurityAlert = { id: nextId(ctx, "alert", "AL-"), at: ctx.iso, severity, kind, accountId, detail, status: "Open" };
  ctx.state.security.alerts.unshift(alert);
  log(ctx, "alert.raise", "Security", { type: "Alert", id: alert.id, label: kind }, "Success", detail);
  return alert;
}

type PolicyCmd = Extract<Command, { type: "security.policy" }>;

export function setPolicy(ctx: Ctx, cmd: PolicyCmd): CommandResult {
  if (!can(ctx, "security", "edit")) return deny(ctx, "security.policy", "Security", POLICY, "Your role cannot change security policy.");
  const sec = ctx.state.security;
  let summary = "";
  switch (cmd.section) {
    case "mfa": {
      const v = cmd.value;
      if (!["Everyone", "Privileged roles", "Off"].includes(v.mode)) return invalid("Choose who needs a second factor.");
      if (v.mode === "Off" && !can(ctx, "security", "manage")) return deny(ctx, "security.policy", "Security", POLICY, "Turning off two-step verification needs security management rights.");
      if (v.mode !== "Off" && !v.methods.length) return invalid("Allow at least one second-factor method.");
      if (v.roles.some((r) => !roleOf(r))) return invalid("One of the roles no longer exists.");
      summary = `Two-step verification: ${v.mode}${v.mode === "Privileged roles" ? ` (${v.roles.length} roles)` : ""}`;
      sec.mfa = { mode: v.mode, roles: [...new Set(v.roles)], methods: v.methods };
      break;
    }
    case "sso": {
      const v = cmd.value;
      const domains = [...new Set(v.domains.map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean))];
      if (!domains.length) return invalid("Keep at least one allowed sign-in domain.");
      if (domains.some((d) => !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d))) return invalid("Domains look like ust.edu.ph.");
      if (!can(ctx, "security", "manage")) return deny(ctx, "security.policy", "Security", POLICY, "Changing single sign-on needs security management rights.");
      summary = `Single sign-on: ${domains.join(", ")}${v.allowGuests ? " · sponsored guests allowed" : " · no guests"}${v.enforced ? " · enforced" : ""}`;
      sec.sso = { provider: sec.sso.provider, enforced: v.enforced, domains, allowGuests: v.allowGuests };
      break;
    }
    case "session": {
      const v = cmd.value;
      if (v.idleMinutes < 5 || v.idleMinutes > 240) return invalid("Idle timeout must be between 5 and 240 minutes.");
      if (v.absoluteHours < 1 || v.absoluteHours > 24) return invalid("Sessions must end within 1 to 24 hours.");
      if (v.warnMinutes < 1 || v.warnMinutes >= v.idleMinutes) return invalid("The warning must come before the timeout.");
      summary = `Sessions: sign out after ${v.idleMinutes} min idle, ${v.absoluteHours} h at most, warn ${v.warnMinutes} min before`;
      sec.session = { idleMinutes: Math.round(v.idleMinutes), absoluteHours: Math.round(v.absoluteHours), warnMinutes: Math.round(v.warnMinutes) };
      break;
    }
    case "lockout": {
      const v = cmd.value;
      if (v.attempts < 3 || v.attempts > 20 || v.windowMinutes < 5 || v.windowMinutes > 120) return invalid("Lock after 3–20 failures within 5–120 minutes.");
      summary = `Lockout after ${v.attempts} failures in ${v.windowMinutes} min`;
      sec.lockout = { attempts: Math.round(v.attempts), windowMinutes: Math.round(v.windowMinutes) };
      break;
    }
    case "inactivityDays": {
      if (cmd.value < 30 || cmd.value > 365) return invalid("Flag inactive accounts after 30 to 365 days.");
      summary = `Inactive accounts flagged after ${cmd.value} days`;
      sec.inactivityDays = Math.round(cmd.value);
      break;
    }
    case "exports": {
      const v = cmd.value;
      if (!v.blocked.includes("Restricted")) return invalid("Restricted data is never exported.");
      summary = `Exports: approval for ${v.approvalFor.join(", ") || "none"} · blocked for ${v.blocked.join(", ")}${v.watermark ? " · watermarked" : ""}`;
      sec.exports = { approvalFor: v.approvalFor.filter((c) => !v.blocked.includes(c)), blocked: v.blocked, watermark: v.watermark };
      break;
    }
    case "sharing": {
      summary = `Sharing: external links ${cmd.value.externalLinks ? "allowed" : "off"} · guest downloads ${cmd.value.guestDownloads ? "allowed" : "off"}`;
      sec.sharing = cmd.value;
      break;
    }
    case "privacy": {
      const v = cmd.value;
      if (!clean(v.officer) || !isEmail(v.email.trim())) return invalid("Give the privacy contact a name and a valid email address.");
      if (!isDay(v.noticeUpdated)) return invalid("Enter the date the privacy notice was last updated.");
      if (v.breachHours < 1 || v.breachHours > 72) return invalid("Escalate personal-data breaches within 72 hours at most.");
      summary = `Privacy contact: ${clean(v.officer)} <${v.email.trim()}> · breach escalation within ${v.breachHours} h`;
      sec.privacy = { officer: clean(v.officer), email: v.email.trim(), noticeUpdated: v.noticeUpdated, breachHours: Math.round(v.breachHours) };
      break;
    }
  }
  log(ctx, "security.policy", "Security", POLICY, "Success", summary);
  raiseAlert(ctx, "Policy change", "Low", summary);
  return ok("Saved.");
}

export function startReview(ctx: Ctx, name: string, population: "privileged" | "external" | "all", due: string): CommandResult {
  if (!can(ctx, "security", "manage")) return deny(ctx, "review.start", "Security", { type: "Access review", id: "new", label: name }, "Starting access reviews needs security management rights.");
  if (clean(name).length < 4) return invalid("Name the review.");
  if (!isDay(due) || due <= ctx.day) return invalid("Set a due date in the future.");
  const live = ctx.state.accounts.filter((a) => a.status === "Active");
  const accountIds = live
    .filter((a) => {
      if (population === "all") return true;
      if (population === "external") return !!a.external;
      return actorFor(ctx.state, a, ctx.now).grants.some((g) => g.roleId === ROLE.admin) || !!a.external || a.assignments.some((x) => x.expires);
    })
    .map((a) => a.id);
  const id = `AR-${nextId(ctx, "review", "", 3)}`;
  ctx.state.security.reviews.unshift({ id, name: clean(name), scope: population === "all" ? "All active accounts" : population === "external" ? "External collaborators" : "Privileged, temporary and external accounts", due, status: "In progress", reviewerId: ctx.actor.id, decisions: {}, accountIds });
  log(ctx, "review.start", "Security", { type: "Access review", id, label: clean(name) }, "Success", `${accountIds.length} accounts to recertify by ${due}`);
  return ok(`Review started for ${accountIds.length} ${accountIds.length === 1 ? "person" : "people"}.`);
}

export function decideReview(ctx: Ctx, id: string, accountId: string, decision: "Keep" | "Revoke"): CommandResult {
  const r = ctx.state.security.reviews.find((x) => x.id === id);
  if (!r || r.status === "Complete") return invalid("That review is closed.");
  if (!r.accountIds.includes(accountId)) return invalid("That account is not part of this review.");
  if (!can(ctx, "security", "edit")) return deny(ctx, "review.decide", "Security", { type: "Access review", id, label: r.name }, "Your role cannot recertify access.");
  if (accountId === ctx.actor.id) return invalid("You cannot recertify your own access.");
  r.decisions[accountId] = decision;
  return ok(`${accountById(ctx, accountId)?.name}: ${decision === "Keep" ? "access confirmed" : "marked for revocation"}.`);
}

export function completeReview(ctx: Ctx, id: string): CommandResult {
  const r = ctx.state.security.reviews.find((x) => x.id === id);
  if (!r || r.status === "Complete") return invalid("That review is closed.");
  if (!can(ctx, "security", "manage")) return deny(ctx, "review.complete", "Security", { type: "Access review", id, label: r.name }, "Completing reviews needs security management rights.");
  const open = r.accountIds.filter((a) => !r.decisions[a]);
  if (open.length) return invalid(`${open.length} ${open.length === 1 ? "account still needs" : "accounts still need"} a decision.`);
  const revoked = r.accountIds.filter((a) => r.decisions[a] === "Revoke");
  for (const aid of revoked) {
    const a = accountById(ctx, aid);
    if (!a || a.status !== "Active") continue;
    a.status = "Suspended";
    a.statusReason = `Access not recertified in ${r.name}.`;
    a.statusChangedAt = ctx.iso;
    revokeSessions(ctx, a.id);
    log(ctx, "account.suspend", "Account", { type: "Account", id: a.id, label: a.name }, "Success", `Access review ${r.id}: not recertified`);
  }
  r.status = "Complete";
  log(ctx, "review.complete", "Security", { type: "Access review", id, label: r.name }, "Success", `${r.accountIds.length - revoked.length} kept · ${revoked.length} suspended`);
  return ok(`Review finished: ${revoked.length ? `${revoked.length} ${revoked.length === 1 ? "account" : "accounts"} suspended` : "everyone keeps access"}.`);
}

export function savePia(ctx: Ctx, pia: Extract<Command, { type: "pia.save" }>["pia"]): CommandResult {
  if (!can(ctx, "security", "edit")) return deny(ctx, "pia.save", "Security", { type: "Privacy assessment", id: pia.id ?? "new", label: pia.name }, "Your role cannot edit privacy assessments.");
  if (clean(pia.name).length < 4) return invalid("Name the assessment.");
  if (!ctx.state.datasets.some((d) => d.id === pia.datasetId)) return invalid("Choose the dataset it covers.");
  if (cleanText(pia.measures).length < 10) return invalid("Describe the safeguards.");
  const list = ctx.state.security.assessments;
  const existing = pia.id ? list.find((p) => p.id === pia.id) : undefined;
  if (existing) Object.assign(existing, { name: clean(pia.name), datasetId: pia.datasetId, risk: pia.risk, status: pia.status, owner: pia.owner, measures: cleanText(pia.measures, 800), updated: ctx.day });
  else list.unshift({ id: `PIA-${nextId(ctx, "pia", "", 2)}`, name: clean(pia.name), datasetId: pia.datasetId, risk: pia.risk, status: pia.status, owner: pia.owner || ctx.actor.id, measures: cleanText(pia.measures, 800), updated: ctx.day });
  const id = existing?.id ?? list[0].id;
  log(ctx, "pia.save", "Security", { type: "Privacy assessment", id, label: clean(pia.name) }, "Success", `${pia.status} · ${pia.risk} risk`);
  return ok("Assessment saved.");
}

export function createDsr(ctx: Ctx, input: { type: string; subject: string; received: string }): CommandResult {
  if (!can(ctx, "security", "edit")) return deny(ctx, "dsr.create", "Security", { type: "Data subject request", id: "new", label: input.type }, "Your role cannot log data subject requests.");
  if (clean(input.subject).length < 4) return invalid("Describe who it is, without naming them.");
  if (!isDay(input.received) || input.received > ctx.day) return invalid("Enter the date the request was received.");
  const id = `DSR-${nextId(ctx, "dsr", "", 3)}`;
  ctx.state.security.subjectRequests.unshift({ id, type: input.type as never, subject: clean(input.subject), received: input.received, due: addDays(input.received, 30), status: "Open", handlerId: ctx.actor.id });
  log(ctx, "dsr.create", "Security", { type: "Data subject request", id, label: input.type }, "Success", `Respond by ${addDays(input.received, 30)}`);
  return ok(`Request logged. Respond by ${addDays(input.received, 30)}.`);
}

export function updateDsr(ctx: Ctx, id: string, status: string, text?: string): CommandResult {
  const r = ctx.state.security.subjectRequests.find((x) => x.id === id);
  if (!r) return invalid("That request no longer exists.");
  if (!can(ctx, "security", "edit")) return deny(ctx, "dsr.update", "Security", { type: "Data subject request", id, label: r.type }, "Your role cannot update data subject requests.");
  r.status = status as never;
  if (text) r.note = cleanText(text, 400);
  log(ctx, "dsr.update", "Security", { type: "Data subject request", id, label: r.type }, "Success", `${status}${text ? ` · ${cleanText(text, 120)}` : ""}`);
  return ok(`${id} marked ${status.toLowerCase()}.`);
}

export function updateAlert(ctx: Ctx, id: string, status: SecurityAlert["status"]): CommandResult {
  const a = ctx.state.security.alerts.find((x) => x.id === id);
  if (!a) return invalid("That alert no longer exists.");
  if (!can(ctx, "security", "edit")) return deny(ctx, "alert.update", "Security", { type: "Alert", id, label: a.kind }, "Your role cannot handle security alerts.");
  a.status = status;
  log(ctx, `alert.${status === "Resolved" ? "resolve" : "acknowledge"}`, "Security", { type: "Alert", id, label: a.kind }, "Success", status);
  return ok(`${id} ${status.toLowerCase()}.`);
}

export function rotateKey(ctx: Ctx, id: string): CommandResult {
  const k = ctx.state.security.keys.find((x) => x.id === id);
  if (!k) return invalid("That key no longer exists.");
  const target = { type: "Key", id: k.id, label: k.name };
  if (!can(ctx, "security", "manage")) return deny(ctx, "key.rotate", "Security", target, "Only University Administrators can rotate keys.");
  k.rotated = ctx.day;
  log(ctx, "key.rotate", "Security", target, "Success", `${k.algorithm} · next rotation ${addDays(ctx.day, k.rotationDays)}`);
  return ok(`${k.name} rotated.`);
}

export function reportIncident(ctx: Ctx, title: string, severity: "Low" | "Medium" | "High" | "Critical", personalData: boolean, text: string): CommandResult {
  if (!can(ctx, "security", "view")) return deny(ctx, "incident.report", "Security", { type: "Incident", id: "new", label: title }, "Your role cannot report incidents here; contact the Office.");
  if (clean(title).length < 6) return invalid("Describe the incident in a short title.");
  const id = `INC-${nextId(ctx, "incident", "", 3)}`;
  ctx.state.security.incidents.unshift({
    id,
    title: clean(title),
    severity,
    reported: ctx.iso,
    reporterId: ctx.actor.id,
    status: "Reported",
    personalData,
    timeline: [{ at: ctx.iso, by: ctx.actor.id, note: cleanText(text, 600) || "Reported." }],
  });
  log(ctx, "incident.report", "Security", { type: "Incident", id, label: clean(title) }, "Success", `${severity}${personalData ? " · personal data involved" : ""}`);
  if (personalData) raiseAlert(ctx, "Policy change", severity === "Low" ? "Medium" : "High", `${id} involves personal data: escalate to the privacy contact within ${ctx.state.security.privacy.breachHours} hours.`);
  return ok(`Incident reported.${personalData ? ` Escalate to ${ctx.state.security.privacy.officer} within ${ctx.state.security.privacy.breachHours} hours.` : ""}`);
}

export function updateIncident(ctx: Ctx, id: string, status: "Reported" | "Investigating" | "Escalated" | "Contained" | "Closed", text: string, escalatedTo?: string): CommandResult {
  const inc = ctx.state.security.incidents.find((x) => x.id === id);
  if (!inc) return invalid("That incident no longer exists.");
  if (!can(ctx, "security", "edit")) return deny(ctx, "incident.update", "Security", { type: "Incident", id, label: inc.title }, "Your role cannot update incidents.");
  if (cleanText(text).length < 3) return invalid("Add a note for the timeline.");
  inc.status = status;
  if (escalatedTo) inc.escalatedTo = clean(escalatedTo);
  inc.timeline.push({ at: ctx.iso, by: ctx.actor.id, note: cleanText(text, 600) });
  log(ctx, "incident.update", "Security", { type: "Incident", id, label: inc.title }, "Success", `${status}${escalatedTo ? ` · escalated to ${clean(escalatedTo)}` : ""}`);
  return ok(`${id} is now ${status.toLowerCase()}.`);
}
