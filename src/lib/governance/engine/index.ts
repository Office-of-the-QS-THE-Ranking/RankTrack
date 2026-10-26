/*
 * The command engine: housekeeping, then one handler per command.
 */
import type { Command, CommandResult } from "../commands";
import { has, isExpired, type Grant } from "../rbac";
import { storyList } from "../records";
import * as accounts from "./accounts";
import * as backup from "./backup";
import { configure } from "./config";
import { roleOf } from "../catalog";
import { can, deny, log, ok, SYSTEM, type Ctx } from "./core";
import * as data from "./data";
import * as directory from "./directory";
import * as posts from "./posts";
import * as records from "./records";
import * as requests from "./requests";
import * as security from "./security";

export { actorFor, makeCtx, SYSTEM, GUEST, type Actor, type Ctx, type AuditDraft, type Effect } from "./core";
export { decisionBlock, needsApproval } from "./requests";
export { raiseAlert } from "./security";

/** Who sees a notification addressed to `to`. */
export function noticeVisible(to: string, accountId: string, grants: Grant[]) {
  if (to === accountId) return true;
  if (to === "office") return grants.some((g) => has(g.perms, "dashboard", "view") && (has(g.perms, "evidence", "approve") || has(g.perms, "workflows", "approve")));
  if (to.startsWith("unit:")) {
    const unit = to.slice(5);
    return grants.some((g) => g.units !== "all" && has(g.perms, "evidence", "view") && g.units.includes(unit));
  }
  return false;
}

/** Days after an access request closes that its applicant's birthday and website are kept. */
const REQUEST_PII_DAYS = 30;

/** Expire what policy says has expired. Runs before every change, as the system. */
export function housekeeping(ctx: Ctx) {
  const s = ctx.state;
  for (const a of s.accounts) {
    const gone = a.assignments.filter((x) => isExpired(x, ctx.day));
    if (gone.length) {
      a.assignments = a.assignments.filter((x) => !isExpired(x, ctx.day));
      for (const g of gone)
        log(ctx, "assignment.expire", "Access", { type: "Account", id: a.id, label: a.name }, "Success", `${roleOf(g.roleId)?.name ?? g.roleId} ended on ${g.expires}`, SYSTEM);
    }
    const grants = (a.dataGrants ?? []).filter((g) => g.until <= ctx.day);
    if (grants.length) {
      a.dataGrants = (a.dataGrants ?? []).filter((g) => g.until > ctx.day);
      for (const g of grants) log(ctx, "access.expire", "Access", { type: "Dataset", id: g.datasetId, label: g.datasetId }, "Success", `${g.access} access for ${a.name} ended on ${g.until}`, SYSTEM);
    }
  }
  const { idleMinutes, absoluteHours } = s.security.session;
  const now = ctx.now.getTime();
  const live = s.sessions.filter((x) => now - Date.parse(x.lastSeen) <= idleMinutes * 60_000 && now - Date.parse(x.createdAt) <= absoluteHours * 3_600_000);
  for (const x of s.sessions.filter((x) => !live.includes(x))) {
    const a = s.accounts.find((y) => y.id === x.accountId);
    log(ctx, "session.timeout", "Session", { type: "Account", id: x.accountId, label: a?.name ?? x.accountId }, "Success", "Signed out automatically by the session policy", SYSTEM);
  }
  s.sessions = live;
  // Access requests carry personal data the Office needs only while deciding: a month after one closes, the
  // birthday and any website are removed. Name, email and affiliation stay as the record of who was given access.
  const cutoff = now - REQUEST_PII_DAYS * 86_400_000;
  const closed = s.requests.filter((r) => r.status !== "Pending" && r.completedAt && Date.parse(r.completedAt) < cutoff && r.payload.kind === "account-access" && (r.payload.applicant?.birthday || r.payload.applicant?.website));
  for (const r of closed) {
    if (r.payload.kind !== "account-access" || !r.payload.applicant) continue;
    r.payload.applicant.birthday = "";
    delete r.payload.applicant.website;
  }
  if (closed.length) log(ctx, "retention.redact", "Data", { type: "Access requests", id: "account-access", label: "Access requests" }, "Success", `Birthday and website removed from ${closed.length} closed ${closed.length === 1 ? "request" : "requests"} (${closed.map((r) => r.id).join(", ")})`.slice(0, 300), SYSTEM);
  s.challenges = s.challenges.filter((c) => now - Date.parse(c.createdAt) < 10 * 60_000);
  s.failures = s.failures.filter((f) => now - Date.parse(f.at) < s.security.lockout.windowMinutes * 60_000);
}

export function execute(ctx: Ctx, cmd: Command): CommandResult {
  switch (cmd.type) {
    case "account.invite":
      return accounts.invite(ctx, cmd.input);
    case "account.update":
      return accounts.update(ctx, cmd.id, cmd);
    case "account.status":
      return accounts.setStatus(ctx, cmd.id, cmd.status, cmd.reason);
    case "account.resend":
      return accounts.resend(ctx, cmd.id);
    case "account.revoke":
      return accounts.revoke(ctx, cmd.id);
    case "account.reauth":
      return accounts.reauth(ctx, cmd.id);
    case "account.transfer":
      return accounts.transfer(ctx, cmd.id, cmd.toUnitId, cmd.moveScope);
    case "account.keep":
      return accounts.keep(ctx, cmd.id);
    case "assignment.add":
      return accounts.addRole(ctx, cmd.accountId, cmd.roleId, cmd.scope, cmd.expires, cmd.note);
    case "assignment.remove":
      return accounts.removeRole(ctx, cmd.accountId, cmd.assignmentId);

    case "unit.create":
      return directory.createUnitCmd(ctx, cmd);
    case "unit.update":
      return directory.updateUnit(ctx, cmd.id, cmd);
    case "unit.coordinator":
      return directory.changeCoordinator(ctx, cmd.id, cmd.accountId, cmd.operation);
    case "unit.move":
      return directory.moveUnit(ctx, cmd.id, cmd.parentId);
    case "unit.archive":
      return directory.archiveUnit(ctx, cmd.id, cmd.reason);
    case "unit.reactivate":
      return directory.reactivateUnit(ctx, cmd.id);
    case "unit.merge":
      return directory.mergeUnit(ctx, cmd.id, cmd.intoId, cmd.reason);

    case "dataset.update":
      return data.updateDataset(ctx, cmd.id, cmd);
    case "dataset.version":
      return data.recordVersion(ctx, cmd.id, cmd.note);
    case "rule.toggle":
      return data.toggleRule(ctx, cmd.id, cmd.enabled);
    case "rule.run":
      return data.runChecks(ctx);
    case "duplicate.resolve":
      return data.resolveDuplicate(ctx, cmd.key, cmd.decision, cmd.keep);
    case "term.update":
      return data.updateTerm(ctx, cmd);
    case "retention.run":
      return data.runRetention(ctx);

    case "security.policy":
      return security.setPolicy(ctx, cmd);
    case "review.start":
      return security.startReview(ctx, cmd.name, cmd.population, cmd.due);
    case "review.decide":
      return security.decideReview(ctx, cmd.id, cmd.accountId, cmd.decision);
    case "review.complete":
      return security.completeReview(ctx, cmd.id);
    case "pia.save":
      return security.savePia(ctx, cmd.pia);
    case "dsr.create":
      return security.createDsr(ctx, cmd.request);
    case "dsr.update":
      return security.updateDsr(ctx, cmd.id, cmd.status, cmd.note);
    case "alert.update":
      return security.updateAlert(ctx, cmd.id, cmd.status);
    case "key.rotate":
      return security.rotateKey(ctx, cmd.id);
    case "incident.report":
      return security.reportIncident(ctx, cmd.title, cmd.severity, cmd.personalData, cmd.note);
    case "incident.update":
      return security.updateIncident(ctx, cmd.id, cmd.status, cmd.note, cmd.escalatedTo);

    case "audit.verify":
      if (!can(ctx, "audit", "view")) return deny(ctx, "audit.verify", "Security", { type: "Audit log", id: "audit", label: "Audit log integrity" }, "Your role cannot check the audit log.");
      ctx.effects.push({ kind: "verify-audit" });
      log(ctx, "audit.verify", "Security", { type: "Audit log", id: "audit", label: "Audit log integrity" });
      return ok("Checking the chain…");
    case "audit.export":
      return { ok: false, message: "Audit exports are handled by the server." };

    case "request.create":
      return requests.create(ctx, cmd.workflowId, cmd.payload, cmd.justification, cmd.title);
    case "request.decide":
      return requests.decide(ctx, cmd.id, cmd.decision, cmd.note, cmd.unitId);
    case "request.cancel":
      return requests.cancel(ctx, cmd.id);
    case "request.review":
      return requests.review(ctx, cmd.id);
    case "workflow.update":
      return requests.updateWorkflow(ctx, cmd.id, cmd);

    case "config.body":
    case "config.bodyAdd":
    case "config.ranking":
    case "config.cycle":
    case "config.cycleAdd":
    case "config.year":
    case "config.yearAdd":
    case "config.period":
    case "config.periodAdd":
    case "config.uploads":
    case "config.template":
    case "config.dashboard":
    case "config.feature":
    case "config.flag":
    case "config.site":
      return configure(ctx, cmd);

    case "backup.run":
      return backup.runBackup(ctx);
    case "backup.test":
      return backup.testRestore(ctx, cmd.pointId);
    case "backup.schedule":
      return backup.schedule(ctx, cmd);
    case "backup.request":
      return backup.requestDestructive(ctx, cmd.operation, cmd.pointId, cmd.justification);

    case "evidence.submit":
      return records.submitEvidence(ctx, cmd);
    case "evidence.review":
      return records.review(ctx, cmd.id, cmd.decision, cmd.note);
    case "evidence.map":
      return records.remap(ctx, cmd.id, cmd.add, cmd.remove);
    case "evidence.respond":
      return records.respond(ctx, cmd.id, cmd.text, cmd.file);
    case "data.submit":
      return records.submitValues(ctx, cmd.unitSlug, cmd.values);
    case "story.propose":
      return records.proposeStory(ctx, cmd);
    case "story.state": {
      const post = ctx.state.records.posts.find((p) => p.slug === cmd.slug);
      if (post) return posts.setPostStatus(ctx, post.id, cmd.state === "Published" ? "Published" : "Unpublished");
      const title = storyList(ctx.state).find((s) => s.slug === cmd.slug)?.title ?? cmd.slug;
      return records.setStoryState(ctx, cmd.slug, cmd.state, title);
    }
    case "post.save":
      return posts.savePost(ctx, cmd);
    case "post.status":
      return posts.setPostStatus(ctx, cmd.id, cmd.status);
    case "post.delete":
      return posts.deletePost(ctx, cmd.id);
    case "innovation.propose":
      return records.proposeInnovation(ctx, cmd.unitSlug, cmd.name, cmd.category);
    case "assistance.request":
      return records.requestAssistance(ctx, cmd.unitSlug, cmd.topic, cmd.urgent, cmd.message);
    case "report.export":
      return records.exportReport(ctx, cmd.report, cmd.cycle, cmd.rows, cmd.datasets);
    case "report.publish":
      return records.publishReport(ctx, cmd.report, cmd.cycle, cmd.justification);
    case "notice.read":
      return records.readNotices(ctx, (to) => noticeVisible(to, ctx.actor.id, ctx.actor.grants));
  }
}
