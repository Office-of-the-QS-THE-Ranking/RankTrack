import "server-only";

/*
 * Shapes the governance store for the Administration console, section by section, according to what
 * the viewer may see.
 */
import { participationKind } from "../directory";
import { ROLES } from "../catalog";
import type { AccountRow, Attention, ConsoleData, DatasetRow, DuplicateRow, Health, RequestRow, RoleRow, TermRow, UnitRow } from "../console-types";
import { actorFor, decisionBlock, makeCtx, needsApproval } from "../engine";
import { daysSince, isInactive, keyOverdue, lastActivity, mfaRequired, rankingActive, rankingPublic, recordReach, workspacesOf } from "../derive";
import { findDuplicates, qualityScore, runRules } from "../quality";
import { grantCheck, grantsFor, today, UNIVERSITY, unitScope, type Grant } from "../rbac";
import { evidenceList, storyList } from "../records";
import type { Classification, GovernanceState } from "../types";
import { viewerCan as can, type Viewer } from "../viewer";
import { adminShortcut } from "./dev-access";
import { readState } from "./store";
import { auditActivity, latestAudit, oldestUnbacked } from "./db/audit";
import { reference } from "./reference";

export async function consoleData(viewer: Viewer, given?: GovernanceState): Promise<ConsoleData> {
  const state = given ?? (await readState());
  const ref = await reference();
  const now = new Date();
  const day = today(now);
  const nameOf = (id: string) => (id === "system" ? "Hub automation" : id === "guest" ? "Access request form" : state.accounts.find((a) => a.id === id)?.name ?? id);
  const unitName = (id: string) => state.units.find((u) => u.id === id)?.name ?? id;
  const me = state.accounts.find((a) => a.id === viewer.id)!;
  const actor = actorFor(state, me, now);
  const evidence = evidenceList(state);
  const stories = storyList(state);

  /* Accounts */
  const grantsOf = new Map<string, Grant[]>(state.accounts.map((a) => [a.id, grantsFor(a, state.units, day)]));
  const accountReach = (unitId: string) => can(viewer, "accounts", "view", { unitId });
  const accounts: AccountRow[] | undefined = viewer.admin.includes("accounts")
    ? state.accounts
        .filter((a) => accountReach(a.unitId))
        .map((a) => {
          const g = grantsOf.get(a.id) ?? [];
          const sessions = state.sessions.filter((s) => s.accountId === a.id);
          return {
            ...a,
            inactive: isInactive(a, state.security.inactivityDays, now),
            idleDays: daysSince(lastActivity(a), now),
            sessions: sessions.length,
            lastSeen: sessions.map((s) => s.lastSeen).sort().at(-1),
            workspaces: workspacesOf(g),
            canEdit: a.id !== viewer.id && can(viewer, "accounts", "edit", { unitId: a.unitId }),
            mfaRequired: mfaRequired(state, g),
            roleNames: [...new Set(g.map((x) => x.roleName))],
          };
        })
    : undefined;

  /* Roles */
  const roles: RoleRow[] = ROLES.map((r) => ({
    ...r,
    members: state.accounts.filter((a) => a.status !== "Deactivated" && a.assignments.some((x) => x.roleId === r.id && (!x.expires || x.expires > day))).length,
    grantable: [unitScope(viewer.portal.unitId), UNIVERSITY].some((scope) => grantCheck(viewer.grants, r, scope, state.units).ok),
  }));

  /* Directory */
  const participating = new Set(state.units.filter((unit) => participationKind(unit)).map((unit) => unit.id));
  const units: UnitRow[] = state.units.map((u) => {
    const reach = recordReach(state.units, u.id);
    return {
      ...u,
      accounts: state.accounts.filter((a) => a.unitId === u.id && a.status !== "Deactivated").length,
      records: evidence.filter((e) => reach.includes(e.programId ?? e.unitSlug)).length,
      participating: !!participationKind(u),
      canEdit: can(viewer, "directory", "edit", { unitId: u.id }),
      canManage: can(viewer, "directory", "manage", { unitId: u.id }),
    };
  });

  /* Data governance */
  const results = runRules(state.rules, evidence, stories, state.duplicates);
  const governance = viewer.admin.includes("governance");
  const datasets: DatasetRow[] | undefined = governance
    ? state.datasets.map((d) => ({
        ...d,
        records: d.id === "DS-EVIDENCE" ? evidence.length : d.id === "DS-STORIES" ? stories.length : d.id === "DS-ACCESS" ? state.accounts.length + state.auditHead.seq : d.records,
        stewardName: nameOf(d.stewardId),
        ownerName: unitName(d.ownerUnitId),
        quality: qualityScore(results.filter((r) => r.rule.datasetId === d.id)),
        canEdit: can(viewer, "governance", "edit", { datasetId: d.id }),
        canClassify: can(viewer, "governance", "manage", { datasetId: d.id }) && !d.locked,
      }))
    : undefined;
  const duplicates: DuplicateRow[] | undefined = governance
    ? findDuplicates(evidence, state.duplicates).map((p) => {
        const row = (e: typeof p.a) => ({ id: e.id, title: e.title, unit: unitName(e.unitSlug), submitted: e.submitted, submittedBy: e.submittedBy, status: e.status });
        return { key: p.key, score: p.score, a: row(p.a), b: row(p.b), decision: p.decision ? { decision: p.decision.decision, keep: p.decision.keep, by: nameOf(p.decision.by), at: p.decision.at } : undefined };
      })
    : undefined;
  const terms: TermRow[] | undefined = governance
    ? state.terms.map((t) => {
        const base = ref.dictionary.find((d) => d.term === t.term);
        return { ...t, definition: t.definition ?? base?.definition ?? "", stewardName: nameOf(t.stewardId), rankings: [...new Set(base?.links.map((l) => l.ranking) ?? [])] };
      })
    : undefined;

  /* Workflows */
  const ctx = makeCtx(state, actor, ref, now, await adminShortcut());
  const requests: RequestRow[] = state.requests
    .filter((r) => can(viewer, "workflows", "view") || r.requesterId === viewer.id)
    .map((r) => {
      const wf = state.workflows.find((w) => w.id === r.workflowId);
      const blocked = r.status === "Pending" ? decisionBlock(ctx, r) ?? undefined : undefined;
      return {
        ...r,
        requesterName: nameOf(r.requesterId),
        workflowName: wf?.name ?? r.workflowId,
        stepName: wf?.steps[r.step]?.name ?? (r.status === "Approved" ? "Complete" : "Closed"),
        steps: wf?.steps ?? [],
        canDecide: r.status === "Pending" && !blocked,
        blocked,
        overdue: r.status === "Pending" && r.due < day,
        mine: r.requesterId === viewer.id,
        decisions: r.decisions.map((d) => ({ ...d, by: nameOf(d.by) })),
        ...(r.reviewing ? { reviewing: { ...r.reviewing, by: nameOf(r.reviewing.by) } } : {}),
      };
    });

  /* Audit */
  // The trail is read from audit_events: the newest 800 entries for the log, its length from the chain's head.
  const audit = viewer.admin.includes("audit") ? { events: await latestAudit(800), total: state.auditHead.seq } : undefined;

  /* Health */
  const live = state.accounts.filter((a) => a.status !== "Deactivated");
  const classes = Object.fromEntries((["Public", "Internal", "Confidential", "Restricted"] as Classification[]).map((c) => [c, state.datasets.filter((d) => d.classification === c).length])) as Record<Classification, number>;
  const lastPoint = state.backup.points.filter((p) => p.status === "Completed").sort((a, b) => b.at.localeCompare(a.at))[0];
  const age = lastPoint ? Math.round((now.getTime() - Date.parse(lastPoint.at)) / 60_000) : undefined;
  // Data at risk: changes made since the last recovery point (sign-ins and backups themselves are not data).
  const unbackedSince = await oldestUnbacked(lastPoint?.at);
  const atRiskMinutes = unbackedSince ? Math.round((now.getTime() - Date.parse(unbackedSince)) / 60_000) : 0;
  const withinRpo = atRiskMinutes <= state.backup.objectives.rpoMinutes;
  const lastTest = [...state.backup.tests].sort((a, b) => b.at.localeCompare(a.at))[0];
  const dayKey = (iso: string) => new Date(Date.parse(iso) + 8 * 3_600_000).toISOString().slice(0, 10);
  const days = Array.from({ length: 14 }, (_, i) => dayKey(new Date(now.getTime() - (13 - i) * 86_400_000).toISOString()));
  const activity = await auditActivity(days, dayKey, new Date(`${days[0]}T00:00:00+08:00`).toISOString());
  const recent = state.recentAudit.filter((e) => now.getTime() - Date.parse(e.at) < 86_400_000);
  const lastEvent = audit?.events[0] ?? (await latestAudit(1))[0];
  const pending = state.requests.filter((r) => r.status === "Pending");
  const inactive = live.filter((a) => isInactive(a, state.security.inactivityDays, now));
  const keysOverdue = state.security.keys.filter((k) => keyOverdue(k, day)).length;
  const alertsOpen = state.security.alerts.filter((a) => a.status === "Open").length;
  const expiring = state.accounts.flatMap((a) =>
    a.assignments.filter((x) => a.status !== "Deactivated" && x.expires && x.expires > day && (Date.parse(x.expires) - Date.parse(day)) / 86_400_000 <= 21).map(() => a),
  );
  const failingRules = results.filter((r) => r.status === "Failing");
  const myDecisions = requests.filter((r) => r.canDecide).length;

  const attention: Attention[] = [];
  if (myDecisions) attention.push({ section: "workflows", text: `${myDecisions} ${myDecisions === 1 ? "request" : "requests"} to approve`, tone: "review" });
  if (alertsOpen && viewer.admin.includes("security")) attention.push({ section: "security", text: `${alertsOpen} open security ${alertsOpen === 1 ? "alert" : "alerts"}`, tone: "danger", focus: "alerts" });
  if (inactive.length && viewer.admin.includes("accounts")) attention.push({ section: "accounts", text: `${inactive.length} idle ${inactive.length === 1 ? "account" : "accounts"} to review`, tone: "revise", focus: "flagged" });
  if (keysOverdue && viewer.admin.includes("security")) attention.push({ section: "security", text: `${keysOverdue} ${keysOverdue === 1 ? "key" : "keys"} due for rotation`, tone: "revise", focus: "keys" });
  if (expiring.length && viewer.admin.includes("roles")) attention.push({ section: "roles", text: `${expiring.length} temporary ${expiring.length === 1 ? "role ends" : "roles end"} within 21 days`, tone: "review", focus: "temporary" });
  if (failingRules.length && governance) attention.push({ section: "governance", text: `${failingRules.length} data quality ${failingRules.length === 1 ? "check" : "checks"} failing`, tone: "revise", focus: "quality" });
  const openDupes = duplicates?.filter((d) => !d.decision).length ?? 0;
  if (openDupes) attention.push({ section: "governance", text: `${openDupes} possible ${openDupes === 1 ? "duplicate" : "duplicates"} to check`, tone: "review", focus: "quality" });
  if (!withinRpo && viewer.admin.includes("backup"))
    attention.push({ section: "backup", text: `Last ${Math.round(atRiskMinutes / 60)} h of changes not backed up`, tone: "danger" });
  const overdueReviews = state.security.reviews.filter((r) => r.status !== "Complete" && r.due < day).length;
  if (overdueReviews && viewer.admin.includes("security")) attention.push({ section: "security", text: `${overdueReviews} access ${overdueReviews === 1 ? "review" : "reviews"} overdue`, tone: "danger", focus: "reviews" });

  const health: Health = {
    accounts: {
      active: state.accounts.filter((a) => a.status === "Active").length,
      pending: state.accounts.filter((a) => a.status === "Pending Invitation").length,
      suspended: state.accounts.filter((a) => a.status === "Suspended").length,
      deactivated: state.accounts.filter((a) => a.status === "Deactivated").length,
      inactive: inactive.length,
      external: state.accounts.filter((a) => a.external && a.status !== "Deactivated").length,
      temporary: state.accounts.filter((a) => a.assignments.some((x) => x.expires && x.expires > day)).length,
    },
    sessions: state.sessions.length,
    units: { active: state.units.filter((u) => u.status === "Active").length, archived: state.units.filter((u) => u.status === "Archived").length, participating: participating.size },
    datasets: classes,
    alertsOpen,
    requests: { pending: pending.length, overdue: pending.filter((r) => r.due < day).length, mine: myDecisions },
    audit: { entries: state.auditHead.seq, last24h: recent.length, denied24h: recent.filter((e) => e.outcome !== "Success").length, lastAt: lastEvent?.at ?? "" },
    backup: { lastAt: lastPoint?.at, lastId: lastPoint?.id, ageMinutes: age, rpoMinutes: state.backup.objectives.rpoMinutes, withinRpo, atRiskMinutes, lastTest: lastTest ? { at: lastTest.at, result: lastTest.result } : undefined },
    keysOverdue,
    quality: qualityScore(results),
    flagsOn: state.config.flags.filter((f) => f.mode !== "Off").length,
    bodiesOn: state.config.bodies.filter((b) => b.enabled).length,
    rankingsTracked: ref.rankings.filter((r) => rankingActive(state, ref, r.slug)).length,
    rankingsPublic: ref.rankings.filter((r) => rankingPublic(state, ref, r.slug)).length,
    evidence: {
      total: evidence.length,
      review: evidence.filter((e) => e.status === "For review").length,
      revise: evidence.filter((e) => e.status === "Needs revision").length,
      validated: evidence.filter((e) => e.status === "Validated").length,
    },
    activity,
    attention,
  };

  return {
    now: now.toISOString(),
    day,
    viewer,
    health,
    accounts,
    roles,
    units,
    datasets,
    rules: governance ? results : undefined,
    duplicates,
    terms,
    security: viewer.admin.includes("security") ? state.security : undefined,
    audit,
    workflows: state.workflows,
    approvals: state.workflows.filter((w) => needsApproval(ctx, w.id)).map((w) => w.id),
    requests,
    config: viewer.admin.includes("config")
      ? {
          ...state.config,
          rankingMeta: ref.rankings.map((r) => ({ slug: r.slug, name: r.name, short: r.short, family: r.family, body: ref.families[r.family]?.body ?? r.family })),
        }
      : undefined,
    backup: viewer.admin.includes("backup") ? state.backup : undefined,
    people: state.accounts.filter((a) => a.status !== "Deactivated").map((a) => ({ id: a.id, name: a.name, unitId: a.unitId, status: a.status })),
    catalog: {
      cycles: state.config.cycles.map((c) => c.id),
      datasets: state.datasets.map((d) => ({ id: d.id, name: d.name, classification: d.classification })),
      bodies: state.config.bodies.filter((b) => ["THE", "QS", "UI", "WURI"].includes(b.key)).map((b) => ({ key: b.key, name: b.name })),
    },
  };
}
