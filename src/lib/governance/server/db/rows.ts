/*
 * The governance model (types.ts) as rows of the store's Supabase tables
 * (supabase/migrations/20261026230000_relational_store.sql), and back. Lists keep their order in an `ord`
 * column counted so that the usual change rewrites one row: lists that grow at the end count from the start,
 * lists that grow at the front (newest first) count from the end. Optional fields are null in a row and
 * absent in the model. Timestamps come back from Postgres as `…+00:00` and are read as ISO strings (`…Z`),
 * the form the engine compares.
 */
import type {
  Account,
  AccountProfile,
  ApprovalRequest,
  AuditEvent,
  BackupState,
  CalendarEntry,
  DeadlineFinding,
  DeadlineWatch,
  DocumentRecord,
  EvidenceFile,
  EvidenceLink,
  EvidenceRecord,
  EvidenceReference,
  FormRecord,
  GovernanceState,
  OrgUnit,
  PostMedia,
  PostRecord,
  RankingConfig,
  Records,
  RequestPayload,
  Scope,
  SecurityPolicy,
  SystemConfig,
  WorkspaceFile,
  WorkspaceFolder,
  WorkingDoc,
} from "../../types";

export type Row = Record<string, unknown>;

/** The tables the store is made of, parents before children (public.hub_tables), with their primary keys. */
export const TABLES = {
  org_units: ["id"],
  org_unit_history: ["unit_id", "ord"],
  accounts: ["id"],
  org_unit_admins: ["unit_id", "account_id"],
  account_assignments: ["id"],
  account_transfers: ["account_id", "ord"],
  account_data_grants: ["account_id", "ord"],
  sessions: ["id"],
  sign_in_challenges: ["id"],
  sign_in_failures: ["ord"],
  datasets: ["id"],
  dataset_versions: ["dataset_id", "v"],
  quality_rules: ["id"],
  duplicate_decisions: ["key"],
  term_stewardship: ["term"],
  security_policy: ["id"],
  access_reviews: ["id"],
  access_review_items: ["review_id", "account_id"],
  privacy_assessments: ["id"],
  subject_requests: ["id"],
  security_alerts: ["id"],
  secret_keys: ["id"],
  incidents: ["id"],
  incident_timeline: ["incident_id", "ord"],
  workflows: ["id"],
  workflow_steps: ["workflow_id", "ord"],
  approval_requests: ["id"],
  approval_decisions: ["request_id", "ord"],
  ranking_bodies: ["key"],
  ranking_settings: ["slug"],
  reporting_cycles: ["id"],
  academic_years: ["id"],
  reporting_periods: ["id"],
  notification_templates: ["id"],
  features: ["id"],
  feature_flags: ["id"],
  system_settings: ["id"],
  backup_settings: ["id"],
  recovery_points: ["id"],
  restore_tests: ["id"],
  recovery_procedures: ["id"],
  evidence: ["id"],
  evidence_comments: ["evidence_id", "ord"],
  posts: ["id"],
  post_media: ["post_id", "role", "ord"],
  story_states: ["slug"],
  story_proposals: ["slug"],
  requirement_values: ["requirement_id"],
  published_reports: ["id"],
  innovations: ["id"],
  assistance_requests: ["id"],
  id_counters: ["name"],
  notices: ["id"],
  notice_reads: ["notice_id", "account_id"],
  calendar_entries: ["id"],
  deadline_findings: ["id"],
  deadline_watch: ["id"],
  documents: ["id"],
  workspace_files: ["id"],
  workspace_docs: ["id"],
  workspace_folders: ["id"],
  forms: ["id"],
} as const satisfies Record<string, readonly string[]>;

export type TableName = keyof typeof TABLES;
export type Tables = Record<TableName, Row[]>;

/** The model without what lives outside these tables: its schema number and the audit trail. */
export type Stored = Omit<GovernanceState, "schema" | "auditHead" | "recentAudit">;

/* ---------- Helpers ---------- */

const nul = <T>(v: T | undefined): T | null => (v === undefined ? null : v);
const opt = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);
/** A timestamptz as the engine writes it: 2026-10-24T02:03:24.224Z. */
const iso = (v: unknown) => new Date(String(v)).toISOString();
const isoOpt = (v: unknown) => (v === null || v === undefined ? undefined : iso(v));
const num = (v: unknown) => Number(v);

/** Drop keys whose value is undefined, so a model read back matches the one written. */
function tidy<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

/** `ord` for lists that grow at the end (append) or at the front (newest first). */
const appendOrd = (i: number) => i;
const prependOrd = (i: number, n: number) => n - 1 - i;

const byOrd = (dir: "append" | "prepend") => (a: Row, b: Row) => (dir === "append" ? num(a.ord) - num(b.ord) : num(b.ord) - num(a.ord));

/** Rows of one parent, in order. */
function childrenOf(rows: Row[], key: string, id: string, dir: "append" | "prepend" = "append") {
  return rows.filter((r) => r[key] === id).sort(byOrd(dir));
}

/** Keep the first of rows that would share a primary key (a list holding the same account twice). */
function unique<T>(items: T[], key: (t: T) => string) {
  const seen = new Set<string>();
  return items.filter((t) => (seen.has(key(t)) ? false : (seen.add(key(t)), true)));
}

const scopeArray = (v: "all" | string[]) => (v === "all" ? null : v);
const scopeValue = (v: unknown): "all" | string[] => (v === null || v === undefined ? "all" : (v as string[]));

/* ---------- Model → rows ---------- */

export function toRows(s: Stored): Tables {
  const t = Object.fromEntries(Object.keys(TABLES).map((k) => [k, [] as Row[]])) as Tables;

  s.units.forEach((u, i) => {
    t.org_units.push({
      id: u.id,
      ord: appendOrd(i),
      directory_key: nul(u.directoryKey),
      code: u.code,
      name: u.name,
      kind: u.kind,
      parent_id: u.parentId,
      status: u.status,
      emails: nul(u.emails),
      emblem_src: u.emblem?.src ?? null,
      emblem_width: u.emblem?.width ?? null,
      emblem_height: u.emblem?.height ?? null,
      established: nul(u.established),
      archived_at: nul(u.archivedAt),
      archived_reason: nul(u.archivedReason),
      merged_into: nul(u.mergedInto),
    });
    u.history.forEach((h, j) => t.org_unit_history.push({ unit_id: u.id, ord: appendOrd(j), at: h.at, by: h.by, change: h.change }));
    unique(u.adminIds, (a) => a).forEach((a, j) => t.org_unit_admins.push({ unit_id: u.id, account_id: a, ord: appendOrd(j) }));
  });

  s.accounts.forEach((a, i) => {
    t.accounts.push({
      id: a.id,
      ord: appendOrd(i),
      name: a.name,
      email: a.email,
      title: a.title,
      avatar: nul(a.avatar),
      unit_id: a.unitId,
      status: a.status,
      active_assignment: nul(a.activeAssignment),
      created_at: a.createdAt,
      invited_at: nul(a.invitedAt),
      last_login: nul(a.lastLogin),
      first_login: nul(a.firstLogin),
      identity: a.identity,
      external: nul(a.external),
      profile: nul(a.profile),
      mfa_enrolled: a.mfa.enrolled,
      mfa_method: nul(a.mfa.method),
      reauth_after: nul(a.reauthAfter),
      pref_idle_minutes: a.sessionPrefs?.idleMinutes ?? null,
      pref_stay_signed_in: !!a.sessionPrefs?.stay,
      pref_notify_email: !!a.notifyPrefs?.email,
      pref_notify_off: a.notifyPrefs?.off ?? [],
      status_reason: nul(a.statusReason),
      status_changed_at: nul(a.statusChangedAt),
      kept_active_at: a.keptActive?.at ?? null,
      kept_active_by: a.keptActive?.by ?? null,
    });
    a.assignments.forEach((g, j) =>
      t.account_assignments.push({
        id: g.id,
        account_id: a.id,
        ord: appendOrd(j),
        role_id: g.roleId,
        scope_units: scopeArray(g.scope.units),
        scope_bodies: scopeArray(g.scope.rankingBodies),
        scope_years: scopeArray(g.scope.years),
        scope_datasets: scopeArray(g.scope.datasets),
        granted_by: g.grantedBy,
        granted_at: g.grantedAt,
        expires: nul(g.expires),
        note: nul(g.note),
      }),
    );
    a.transfers.forEach((x, j) => t.account_transfers.push({ account_id: a.id, ord: appendOrd(j), from_unit: x.from, to_unit: x.to, at: x.at, by: x.by }));
    (a.dataGrants ?? []).forEach((d, j) =>
      t.account_data_grants.push({ account_id: a.id, ord: appendOrd(j), dataset_id: d.datasetId, access: d.access, until: d.until, request_id: d.requestId }),
    );
  });

  s.sessions.forEach((x, i) =>
    t.sessions.push({ id: x.id, ord: appendOrd(i), account_id: x.accountId, created_at: x.createdAt, last_seen: x.lastSeen, mfa: x.mfa, device: x.device }),
  );
  s.challenges.forEach((x, i) =>
    t.sign_in_challenges.push({ id: x.id, ord: appendOrd(i), account_id: x.accountId, created_at: x.createdAt, next: x.next, attempts: x.attempts }),
  );
  s.failures.forEach((x, i) => t.sign_in_failures.push({ ord: appendOrd(i), email: x.email, at: x.at }));

  s.datasets.forEach((d, i) => {
    t.datasets.push({
      id: d.id,
      ord: appendOrd(i),
      name: d.name,
      description: d.description,
      owner_unit_id: d.ownerUnitId,
      steward_id: d.stewardId,
      classification: d.classification,
      locked: nul(d.locked),
      retention_years: d.retention.years,
      retention_then: d.retention.then,
      export_policy: d.exportPolicy,
      bodies: d.bodies,
      public_surface: nul(d.publicSurface),
      personal: d.personal,
      records: d.records,
      version: d.version,
      updated_at: d.updatedAt,
    });
    unique(d.versions, (v) => String(v.v)).forEach((v, j, all) =>
      t.dataset_versions.push({ dataset_id: d.id, v: v.v, ord: prependOrd(j, all.length), at: v.at, by: v.by, note: v.note }),
    );
  });
  s.rules.forEach((r, i) =>
    t.quality_rules.push({
      id: r.id,
      ord: appendOrd(i),
      dataset_id: r.datasetId,
      name: r.name,
      description: r.description,
      enabled: r.enabled,
      severity: r.severity,
      check: r.check,
      external_failures: nul(r.externalFailures),
      last_run: nul(r.lastRun),
    }),
  );
  s.duplicates.forEach((d, i) => t.duplicate_decisions.push({ key: d.key, ord: appendOrd(i), decision: d.decision, keep: nul(d.keep), by: d.by, at: d.at }));
  s.terms.forEach((m, i) =>
    t.term_stewardship.push({
      term: m.term,
      ord: appendOrd(i),
      definition: nul(m.definition),
      dataset_id: m.datasetId,
      steward_id: m.stewardId,
      unit_of_measure: m.unitOfMeasure,
      updated_at: m.updatedAt,
    }),
  );

  securityRows(s.security, t);

  s.workflows.forEach((w, i) => {
    t.workflows.push({ id: w.id, ord: appendOrd(i), name: w.name, description: w.description, enabled: w.enabled, sla_days: w.slaDays, separation: w.separation });
    w.steps.forEach((st, j) => t.workflow_steps.push({ workflow_id: w.id, ord: appendOrd(j), name: st.name }));
  });
  s.requests.forEach((r, i, all) => {
    t.approval_requests.push({
      id: r.id,
      ord: prependOrd(i, all.length),
      workflow_id: r.workflowId,
      title: r.title,
      requester_id: r.requesterId,
      requested_at: r.requestedAt,
      justification: r.justification,
      kind: r.payload.kind,
      payload: r.payload,
      status: r.status,
      step: r.step,
      reviewing_by: r.reviewing?.by ?? null,
      reviewing_at: r.reviewing?.at ?? null,
      due: r.due,
      completed_at: nul(r.completedAt),
    });
    r.decisions.forEach((d, j) =>
      t.approval_decisions.push({ request_id: r.id, ord: appendOrd(j), step: d.step, by: d.by, at: d.at, decision: d.decision, note: nul(d.note) }),
    );
  });

  configRows(s.config, s.records, t);
  backupRows(s.backup, t);
  recordRows(s.records, t);

  s.notices.forEach((n, i, all) => {
    t.notices.push({ id: n.id, ord: prependOrd(i, all.length), at: n.at, recipient: n.to, text: n.text, href: n.href, template_id: nul(n.templateId) });
    unique(n.readBy, (a) => a).forEach((a, j) => t.notice_reads.push({ notice_id: n.id, account_id: a, ord: appendOrd(j) }));
  });

  return t;
}

function securityRows(p: SecurityPolicy, t: Tables) {
  t.security_policy.push({
    id: 1,
    mfa_mode: p.mfa.mode,
    mfa_roles: p.mfa.roles,
    mfa_methods: p.mfa.methods,
    sso_provider: p.sso.provider,
    sso_enforced: p.sso.enforced,
    sso_domains: p.sso.domains,
    sso_allow_guests: p.sso.allowGuests,
    session_idle_minutes: p.session.idleMinutes,
    session_absolute_hours: p.session.absoluteHours,
    session_warn_minutes: p.session.warnMinutes,
    lockout_attempts: p.lockout.attempts,
    lockout_window_minutes: p.lockout.windowMinutes,
    inactivity_days: p.inactivityDays,
    export_approval_for: p.exports.approvalFor,
    export_blocked: p.exports.blocked,
    export_watermark: p.exports.watermark,
    sharing_external_links: p.sharing.externalLinks,
    sharing_guest_downloads: p.sharing.guestDownloads,
    privacy_officer: p.privacy.officer,
    privacy_email: p.privacy.email,
    privacy_notice_updated: p.privacy.noticeUpdated,
    privacy_breach_hours: p.privacy.breachHours,
    encryption_at_rest: p.encryption.atRest,
    encryption_in_transit: p.encryption.inTransit,
    encryption_secrets_manager: p.encryption.secretsManager,
  });
  p.reviews.forEach((r, i, all) => {
    t.access_reviews.push({ id: r.id, ord: prependOrd(i, all.length), name: r.name, scope: r.scope, due: r.due, status: r.status, reviewer_id: r.reviewerId });
    // The accounts under review, then any decided on that were not in the list.
    const ids = unique([...r.accountIds, ...Object.keys(r.decisions)], (a) => a);
    ids.forEach((a, j) => t.access_review_items.push({ review_id: r.id, account_id: a, ord: r.accountIds.includes(a) ? appendOrd(j) : -1 - j, decision: r.decisions[a] ?? null }));
  });
  p.assessments.forEach((a, i) =>
    t.privacy_assessments.push({ id: a.id, ord: appendOrd(i), name: a.name, dataset_id: a.datasetId, risk: a.risk, status: a.status, owner: a.owner, updated: a.updated, measures: a.measures }),
  );
  p.subjectRequests.forEach((r, i, all) =>
    t.subject_requests.push({
      id: r.id,
      ord: prependOrd(i, all.length),
      type: r.type,
      subject: r.subject,
      received: r.received,
      due: r.due,
      status: r.status,
      handler_id: r.handlerId,
      note: nul(r.note),
    }),
  );
  p.alerts.forEach((a, i, all) =>
    t.security_alerts.push({ id: a.id, ord: prependOrd(i, all.length), at: a.at, severity: a.severity, kind: a.kind, account_id: nul(a.accountId), detail: a.detail, status: a.status }),
  );
  p.keys.forEach((k, i) =>
    t.secret_keys.push({ id: k.id, ord: appendOrd(i), name: k.name, purpose: k.purpose, algorithm: k.algorithm, created: k.created, rotated: k.rotated, rotation_days: k.rotationDays }),
  );
  p.incidents.forEach((x, i, all) => {
    t.incidents.push({
      id: x.id,
      ord: prependOrd(i, all.length),
      title: x.title,
      severity: x.severity,
      reported: x.reported,
      reporter_id: x.reporterId,
      status: x.status,
      personal_data: x.personalData,
      escalated_to: nul(x.escalatedTo),
    });
    x.timeline.forEach((e, j) => t.incident_timeline.push({ incident_id: x.id, ord: appendOrd(j), at: e.at, by: e.by, note: e.note }));
  });
}

function configRows(c: SystemConfig, r: Records, t: Tables) {
  c.bodies.forEach((b, i) => t.ranking_bodies.push({ key: b.key, ord: appendOrd(i), name: b.name, short: b.short, enabled: b.enabled, website: b.website }));
  c.rankings.forEach((x, i) =>
    t.ranking_settings.push({
      slug: x.slug,
      ord: appendOrd(i),
      enabled: x.enabled,
      public: x.public,
      deadline: x.deadline,
      deadline_source: nul(x.deadlineSource),
      deadline_url: nul(x.deadlineUrl),
      deadline_by: nul(x.deadlineBy),
      deadline_at: nul(x.deadlineAt),
    }),
  );
  c.cycles.forEach((x, i) => t.reporting_cycles.push({ id: x.id, ord: appendOrd(i), status: x.status }));
  c.academicYears.forEach((x, i) => t.academic_years.push({ id: x.id, ord: appendOrd(i), current: x.current }));
  c.periods.forEach((x, i) => t.reporting_periods.push({ id: x.id, ord: appendOrd(i), label: x.label, note: x.note, accepting: x.accepting }));
  c.templates.forEach((x, i) =>
    t.notification_templates.push({ id: x.id, ord: appendOrd(i), name: x.name, event: x.event, channel: x.channel, subject: x.subject, body: x.body, enabled: x.enabled }),
  );
  c.features.forEach((x, i) => t.features.push({ id: x.id, ord: appendOrd(i), name: x.name, description: x.description, area: x.area, enabled: x.enabled }));
  c.flags.forEach((x, i) =>
    t.feature_flags.push({ id: x.id, ord: appendOrd(i), name: x.name, description: x.description, mode: x.mode, accounts: x.accounts, units: x.units, updated_at: x.updatedAt }),
  );
  c.calendar.forEach((x, i) =>
    t.calendar_entries.push({ id: x.id, ord: appendOrd(i), slug: x.slug, label: x.label, due: x.due, source: x.source, url: nul(x.url), set_by: x.by, set_at: x.at }),
  );
  c.findings.forEach((x, i, all) =>
    t.deadline_findings.push({
      id: x.id,
      ord: prependOrd(i, all.length),
      source_id: x.sourceId,
      slug: x.slug,
      target: x.target,
      label: x.label,
      due: x.due,
      quote: x.quote,
      url: x.url,
      found_at: x.foundAt,
      state: x.state,
      decided_by: nul(x.decidedBy),
      decided_at: nul(x.decidedAt),
    }),
  );
  c.watch.forEach((x, i) =>
    t.deadline_watch.push({ id: x.id, ord: appendOrd(i), checked_at: x.checkedAt, status: x.status, hash: nul(x.hash), changed_at: nul(x.changedAt), note: x.note }),
  );
  t.system_settings.push({
    id: 1,
    ...(c.rolePermissions ? { role_permissions: c.rolePermissions } : {}),
    upload_max_file_mb: c.uploads.maxFileMB,
    upload_max_files: c.uploads.maxFiles,
    upload_types: c.uploads.types,
    dashboard_office_view: c.dashboard.officeView,
    dashboard_show_clock: c.dashboard.showClock,
    dashboard_deadline_warning_days: c.dashboard.deadlineWarningDays,
    site_notice: c.site.notice,
    site_notice_on: c.site.noticeOn,
    site_as_of: c.site.asOf,
    post_views_since: r.postViewsStartedAt,
  });
}

function backupRows(b: BackupState, t: Tables) {
  t.backup_settings.push({
    id: 1,
    schedule_full: b.schedule.full,
    schedule_incremental: b.schedule.incremental,
    retention_days: b.schedule.retentionDays,
    monthly_months: b.schedule.monthlyMonths,
    offsite: b.schedule.offsite,
    encrypted: b.schedule.encrypted,
    rpo_minutes: b.objectives.rpoMinutes,
    rto_minutes: b.objectives.rtoMinutes,
  });
  b.points.forEach((p, i, all) =>
    t.recovery_points.push({
      id: p.id,
      ord: prependOrd(i, all.length),
      at: p.at,
      kind: p.kind,
      size_mb: p.sizeMB,
      location: p.location,
      status: p.status,
      checksum: p.checksum,
      file: nul(p.file),
      verified_at: nul(p.verifiedAt),
      expires_at: p.expiresAt,
    }),
  );
  b.tests.forEach((x, i, all) =>
    t.restore_tests.push({ id: x.id, ord: prependOrd(i, all.length), at: x.at, point_id: x.pointId, result: x.result, minutes: x.minutes, by: x.by, notes: x.notes }),
  );
  b.procedures.forEach((x, i) => t.recovery_procedures.push({ id: x.id, ord: appendOrd(i), title: x.title, owner: x.owner, updated: x.updated, steps: x.steps }));
}

const mediaRow = (postId: string, role: "thumbnail" | "photo", ord: number, m: PostMedia): Row => ({
  post_id: postId,
  role,
  ord,
  src: m.src,
  width: m.width,
  height: m.height,
  alt: m.alt,
});

function recordRows(r: Records, t: Tables) {
  Object.values(r.evidence).forEach((e, i) => {
    t.evidence.push({
      id: e.id,
      ord: appendOrd(i),
      title: e.title,
      unit_id: e.unitSlug,
      program_id: nul(e.programId),
      type: e.type,
      period: e.period,
      submitted: e.submitted,
      submitted_by: e.submittedBy,
      submitted_by_id: nul(e.submittedById),
      status: e.status,
      stage: e.stage,
      level: e.level,
      mapped_to: e.mappedTo,
      sdgs: e.sdgs,
      summary: e.summary,
      result: e.result,
      beneficiaries: e.beneficiaries,
      files: e.files,
      attachments: e.attachments ?? [],
      background: e.background ?? "",
      verified_by: e.verifiedBy ?? "",
      links: e.links ?? [],
      citations: e.references ?? [],
    });
    e.comments.forEach((c, j) => t.evidence_comments.push({ evidence_id: e.id, ord: appendOrd(j), by: c.by, role: c.role, date: c.date, text: c.text }));
  });
  r.posts.forEach((p, i, all) => {
    t.posts.push({
      id: p.id,
      ord: prependOrd(i, all.length),
      slug: p.slug,
      title: p.title,
      subtitle: p.subtitle,
      sdgs: p.sdgs,
      themes: p.themes,
      hashtags: nul(p.hashtags),
      layout: nul(p.layout),
      body: p.body,
      status: p.status,
      author_id: p.authorId,
      unit_id: nul(p.unitSlug),
      created_at: p.createdAt,
      updated_at: p.updatedAt,
      updated_by: p.updatedBy,
      published_at: nul(p.publishedAt),
    });
    if (p.thumbnail) t.post_media.push(mediaRow(p.id, "thumbnail", 0, p.thumbnail));
    p.photos.forEach((m, j) => t.post_media.push(mediaRow(p.id, "photo", appendOrd(j), m)));
  });
  (r.documents ?? []).forEach((d, i, all) =>
    t.documents.push({
      id: d.id,
      ord: prependOrd(i, all.length),
      slug: d.slug,
      kind: d.kind,
      title: d.title,
      authors: d.authors,
      venue: d.venue,
      type: d.type,
      abstract: d.abstract,
      issued: d.issued,
      doi: nul(d.doi),
      url: nul(d.url),
      file_src: nul(d.file?.src),
      file_name: nul(d.file?.name),
      file_mb: nul(d.file?.sizeMB),
      sdgs: d.sdgs,
      keywords: d.keywords,
      unit_id: nul(d.unitSlug),
      featured: d.featured ?? false,
      cover_tone: nul(d.coverTone),
      status: d.status,
      created_by: d.createdBy,
      created_at: d.createdAt,
      updated_at: d.updatedAt,
      updated_by: d.updatedBy,
      published_at: nul(d.publishedAt),
    }),
  );
  (r.workspace ?? []).forEach((f, i, all) =>
    t.workspace_files.push({
      id: f.id,
      ord: prependOrd(i, all.length),
      unit_id: nul(f.unitId),
      shelf: f.shelf,
      folder_id: nul(f.folderId),
      name: f.name,
      src: f.src,
      bytes: f.bytes,
      created_by: f.createdBy,
      created_at: f.createdAt,
      updated_at: f.updatedAt,
      updated_by: f.updatedBy,
      archived_at: nul(f.archivedAt),
      archived_by: nul(f.archivedBy),
    }),
  );
  (r.workspaceFolders ?? []).forEach((f, i) =>
    t.workspace_folders.push({
      id: f.id,
      ord: appendOrd(i),
      unit_id: nul(f.unitId),
      shelf: f.shelf,
      parent_id: nul(f.parentId),
      name: f.name,
      created_by: f.createdBy,
      created_at: f.createdAt,
      updated_at: f.updatedAt,
      updated_by: f.updatedBy,
    }),
  );
  (r.workingDocs ?? []).forEach((d, i, all) =>
    t.workspace_docs.push({
      id: d.id,
      ord: prependOrd(i, all.length),
      unit_id: nul(d.unitId),
      title: d.title,
      doc_date: d.date,
      rankings: d.rankings,
      sdgs: d.sdgs ?? [],
      authors: d.authors ?? [],
      status: d.status,
      links: d.links,
      remarks: d.remarks ?? "",
      created_by: d.createdBy,
      created_at: d.createdAt,
      updated_at: d.updatedAt,
      updated_by: d.updatedBy,
    }),
  );
  (r.forms ?? []).forEach((f, i, all) =>
    t.forms.push({
      id: f.id,
      ord: prependOrd(i, all.length),
      unit_id: nul(f.unitId),
      owner_id: nul(f.ownerId),
      code: f.code,
      prefix: f.prefix,
      title: f.title,
      description: f.description,
      kind: f.kind,
      reference: nul(f.reference),
      issuer_id: nul(f.issuerId),
      status: f.status,
      closes_on: nul(f.closesOn),
      copies: !!f.copies,
      students: !!f.students,
      schema: f.schema,
      created_by: f.createdBy,
      created_at: f.createdAt,
      updated_at: f.updatedAt,
      updated_by: f.updatedBy,
    }),
  );
  for (const [slug, state] of Object.entries(r.stories)) t.story_states.push({ slug, state });
  r.proposals.forEach((p, i, all) =>
    t.story_proposals.push({
      slug: p.slug,
      ord: prependOrd(i, all.length),
      title: p.title,
      unit_id: p.unitSlug,
      by: p.by,
      at: p.at,
      sdgs: p.sdgs,
      rankings: p.rankings,
      challenge: p.challenge,
      outcome: p.outcome,
    }),
  );
  for (const [id, v] of Object.entries(r.values)) t.requirement_values.push({ requirement_id: id, value: v.value, source: v.source, status: v.status, by: v.by, at: v.at });
  r.publishedReports.forEach((x, i, all) => t.published_reports.push({ id: x.id, ord: prependOrd(i, all.length), title: x.title, at: x.at, by: x.by }));
  r.innovations.forEach((x, i, all) =>
    t.innovations.push({ id: x.id, ord: prependOrd(i, all.length), name: x.name, unit_id: x.unitSlug, by: x.by, at: x.at, category: x.category }),
  );
  r.assistance.forEach((x, i, all) =>
    t.assistance_requests.push({ id: x.id, ord: prependOrd(i, all.length), topic: x.topic, unit_id: x.unitSlug, by: x.by, at: x.at, urgent: x.urgent }),
  );
  for (const [name, value] of Object.entries(r.counters)) t.id_counters.push({ name, value });
}

/* ---------- Rows → model ---------- */

const str = (v: unknown) => v as string;
const strs = (v: unknown) => (v ?? []) as string[];
const ints = (v: unknown) => ((v ?? []) as unknown[]).map(Number);

function single(rows: Row[], table: string): Row {
  if (rows.length !== 1) throw new Error(`Governance store: ${table} holds ${rows.length} rows; it must hold exactly one.`);
  return rows[0];
}

export function fromRows(t: Tables): Stored {
  const sorted = (rows: Row[], dir: "append" | "prepend" = "append") => [...rows].sort(byOrd(dir));
  const group = (rows: Row[], key: string) => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const k = String(r[key]);
      const list = m.get(k);
      if (list) list.push(r);
      else m.set(k, [r]);
    }
    return (id: string, dir: "append" | "prepend" = "append") => (m.get(id) ?? []).sort(byOrd(dir));
  };

  const historyOf = group(t.org_unit_history, "unit_id");
  const adminsOf = group(t.org_unit_admins, "unit_id");
  const units: OrgUnit[] = sorted(t.org_units).map((u) =>
    tidy({
      id: str(u.id),
      directoryKey: opt(u.directory_key as string | null),
      code: str(u.code),
      name: str(u.name),
      kind: u.kind as OrgUnit["kind"],
      parentId: (u.parent_id ?? null) as string | null,
      status: u.status as OrgUnit["status"],
      adminIds: adminsOf(str(u.id)).map((a) => str(a.account_id)),
      emails: opt(u.emails as string[] | null),
      emblem: u.emblem_src ? { src: str(u.emblem_src), width: num(u.emblem_width), height: num(u.emblem_height) } : undefined,
      established: opt(u.established as string | null),
      archivedAt: isoOpt(u.archived_at),
      archivedReason: opt(u.archived_reason as string | null),
      mergedInto: opt(u.merged_into as string | null),
      history: historyOf(str(u.id)).map((h) => ({ at: iso(h.at), by: str(h.by), change: str(h.change) })),
    }),
  );

  const assignmentsOf = group(t.account_assignments, "account_id");
  const transfersOf = group(t.account_transfers, "account_id");
  const grantsOf = group(t.account_data_grants, "account_id");
  const accounts: Account[] = sorted(t.accounts).map((a) => {
    const id = str(a.id);
    const grants = grantsOf(id);
    return tidy({
      id,
      name: str(a.name),
      email: str(a.email),
      title: str(a.title),
      avatar: opt(a.avatar as string | null),
      unitId: str(a.unit_id),
      status: a.status as Account["status"],
      assignments: assignmentsOf(id).map((g) =>
        tidy({
          id: str(g.id),
          roleId: g.role_id as Account["assignments"][number]["roleId"],
          scope: {
            units: scopeValue(g.scope_units),
            rankingBodies: scopeValue(g.scope_bodies) as Scope["rankingBodies"],
            years: scopeValue(g.scope_years),
            datasets: scopeValue(g.scope_datasets),
          },
          grantedBy: str(g.granted_by),
          grantedAt: iso(g.granted_at),
          expires: opt(g.expires as string | null),
          note: opt(g.note as string | null),
        }),
      ),
      activeAssignment: opt(a.active_assignment as string | null),
      createdAt: iso(a.created_at),
      invitedAt: isoOpt(a.invited_at),
      lastLogin: isoOpt(a.last_login),
      firstLogin: isoOpt(a.first_login),
      identity: a.identity as Account["identity"],
      external: opt(a.external as boolean | null),
      profile: opt(a.profile as AccountProfile | null),
      mfa: tidy({ enrolled: !!a.mfa_enrolled, method: opt(a.mfa_method as Account["mfa"]["method"] | null) }),
      reauthAfter: isoOpt(a.reauth_after),
      sessionPrefs: a.pref_idle_minutes != null || a.pref_stay_signed_in ? tidy({ idleMinutes: a.pref_idle_minutes != null ? num(a.pref_idle_minutes) : undefined, stay: a.pref_stay_signed_in ? true : undefined }) : undefined,
      notifyPrefs: a.pref_notify_email || strs(a.pref_notify_off).length ? tidy({ email: a.pref_notify_email ? true : undefined, off: strs(a.pref_notify_off).length ? strs(a.pref_notify_off) : undefined }) : undefined,
      statusReason: opt(a.status_reason as string | null),
      statusChangedAt: isoOpt(a.status_changed_at),
      keptActive: a.kept_active_at ? { at: iso(a.kept_active_at), by: str(a.kept_active_by) } : undefined,
      transfers: transfersOf(id).map((x) => ({ from: str(x.from_unit), to: str(x.to_unit), at: iso(x.at), by: str(x.by) })),
      dataGrants: grants.length
        ? grants.map((d) => ({ datasetId: str(d.dataset_id), access: d.access as "View" | "Export", until: str(d.until), requestId: str(d.request_id) }))
        : undefined,
    });
  });

  const versionsOf = group(t.dataset_versions, "dataset_id");
  const reviewItemsOf = group(t.access_review_items, "review_id");
  const timelineOf = group(t.incident_timeline, "incident_id");
  const stepsOf = group(t.workflow_steps, "workflow_id");
  const decisionsOf = group(t.approval_decisions, "request_id");
  const commentsOf = group(t.evidence_comments, "evidence_id");
  const readsOf = group(t.notice_reads, "notice_id");

  const p = single(t.security_policy, "security_policy");
  const security: SecurityPolicy = {
    mfa: { mode: p.mfa_mode as SecurityPolicy["mfa"]["mode"], roles: strs(p.mfa_roles) as SecurityPolicy["mfa"]["roles"], methods: strs(p.mfa_methods) as SecurityPolicy["mfa"]["methods"] },
    sso: { provider: str(p.sso_provider), enforced: !!p.sso_enforced, domains: strs(p.sso_domains), allowGuests: !!p.sso_allow_guests },
    session: { idleMinutes: num(p.session_idle_minutes), absoluteHours: num(p.session_absolute_hours), warnMinutes: num(p.session_warn_minutes) },
    lockout: { attempts: num(p.lockout_attempts), windowMinutes: num(p.lockout_window_minutes) },
    inactivityDays: num(p.inactivity_days),
    exports: {
      approvalFor: strs(p.export_approval_for) as SecurityPolicy["exports"]["approvalFor"],
      blocked: strs(p.export_blocked) as SecurityPolicy["exports"]["blocked"],
      watermark: !!p.export_watermark,
    },
    sharing: { externalLinks: !!p.sharing_external_links, guestDownloads: !!p.sharing_guest_downloads },
    privacy: { officer: str(p.privacy_officer), email: str(p.privacy_email), noticeUpdated: str(p.privacy_notice_updated), breachHours: num(p.privacy_breach_hours) },
    encryption: { atRest: str(p.encryption_at_rest), inTransit: str(p.encryption_in_transit), secretsManager: str(p.encryption_secrets_manager) },
    reviews: sorted(t.access_reviews, "prepend").map((r) => {
      const items = reviewItemsOf(str(r.id));
      return {
        id: str(r.id),
        name: str(r.name),
        scope: str(r.scope),
        due: str(r.due),
        status: r.status as "Scheduled" | "In progress" | "Complete",
        reviewerId: str(r.reviewer_id),
        decisions: Object.fromEntries(items.filter((x) => x.decision).map((x) => [str(x.account_id), x.decision as "Keep" | "Revoke"])),
        accountIds: items.filter((x) => num(x.ord) >= 0).map((x) => str(x.account_id)),
      };
    }),
    assessments: sorted(t.privacy_assessments).map((a) => ({
      id: str(a.id),
      name: str(a.name),
      datasetId: str(a.dataset_id),
      risk: a.risk as "Low" | "Medium" | "High",
      status: a.status as "Draft" | "In review" | "Approved",
      owner: str(a.owner),
      updated: str(a.updated),
      measures: str(a.measures),
    })),
    subjectRequests: sorted(t.subject_requests, "prepend").map((r) =>
      tidy({
        id: str(r.id),
        type: r.type as SecurityPolicy["subjectRequests"][number]["type"],
        subject: str(r.subject),
        received: str(r.received),
        due: str(r.due),
        status: r.status as SecurityPolicy["subjectRequests"][number]["status"],
        handlerId: str(r.handler_id),
        note: opt(r.note as string | null),
      }),
    ),
    alerts: sorted(t.security_alerts, "prepend").map((a) =>
      tidy({
        id: str(a.id),
        at: iso(a.at),
        severity: a.severity as "Low" | "Medium" | "High",
        kind: a.kind as SecurityPolicy["alerts"][number]["kind"],
        accountId: opt(a.account_id as string | null),
        detail: str(a.detail),
        status: a.status as "Open" | "Acknowledged" | "Resolved",
      }),
    ),
    keys: sorted(t.secret_keys).map((k) => ({
      id: str(k.id),
      name: str(k.name),
      purpose: str(k.purpose),
      algorithm: str(k.algorithm),
      created: str(k.created),
      rotated: str(k.rotated),
      rotationDays: num(k.rotation_days),
    })),
    incidents: sorted(t.incidents, "prepend").map((x) =>
      tidy({
        id: str(x.id),
        title: str(x.title),
        severity: x.severity as SecurityPolicy["incidents"][number]["severity"],
        reported: iso(x.reported),
        reporterId: str(x.reporter_id),
        status: x.status as SecurityPolicy["incidents"][number]["status"],
        personalData: !!x.personal_data,
        escalatedTo: opt(x.escalated_to as string | null),
        timeline: timelineOf(str(x.id)).map((e) => ({ at: iso(e.at), by: str(e.by), note: str(e.note) })),
      }),
    ),
  };

  const settings = single(t.system_settings, "system_settings");
  const config: SystemConfig = {
    ...(settings.role_permissions ? { rolePermissions: settings.role_permissions as SystemConfig["rolePermissions"] } : {}),
    bodies: sorted(t.ranking_bodies).map((b) => ({ key: str(b.key), name: str(b.name), short: str(b.short), enabled: !!b.enabled, website: str(b.website) })),
    rankings: sorted(t.ranking_settings).map((x) =>
      tidy({
        slug: str(x.slug),
        enabled: !!x.enabled,
        public: !!x.public,
        deadline: str(x.deadline),
        deadlineSource: opt(x.deadline_source as RankingConfig["deadlineSource"] | null),
        deadlineUrl: opt(x.deadline_url as string | null),
        deadlineBy: opt(x.deadline_by as string | null),
        deadlineAt: isoOpt(x.deadline_at),
      }),
    ),
    cycles: sorted(t.reporting_cycles).map((x) => ({ id: str(x.id), status: x.status as SystemConfig["cycles"][number]["status"] })),
    academicYears: sorted(t.academic_years).map((x) => ({ id: str(x.id), current: !!x.current })),
    periods: sorted(t.reporting_periods).map((x) => ({ id: str(x.id), label: str(x.label), note: str(x.note), accepting: !!x.accepting })),
    uploads: { maxFileMB: num(settings.upload_max_file_mb), maxFiles: num(settings.upload_max_files), types: strs(settings.upload_types) },
    templates: sorted(t.notification_templates).map((x) => ({
      id: str(x.id),
      name: str(x.name),
      event: str(x.event),
      channel: x.channel as SystemConfig["templates"][number]["channel"],
      subject: str(x.subject),
      body: str(x.body),
      enabled: !!x.enabled,
    })),
    dashboard: {
      officeView: settings.dashboard_office_view as SystemConfig["dashboard"]["officeView"],
      showClock: !!settings.dashboard_show_clock,
      deadlineWarningDays: num(settings.dashboard_deadline_warning_days),
    },
    features: sorted(t.features).map((x) => ({
      id: str(x.id),
      name: str(x.name),
      description: str(x.description),
      area: x.area as SystemConfig["features"][number]["area"],
      enabled: !!x.enabled,
    })),
    flags: sorted(t.feature_flags).map((x) => ({
      id: str(x.id),
      name: str(x.name),
      description: str(x.description),
      mode: x.mode as SystemConfig["flags"][number]["mode"],
      accounts: strs(x.accounts),
      units: strs(x.units),
      updatedAt: iso(x.updated_at),
    })),
    site: { notice: str(settings.site_notice), noticeOn: !!settings.site_notice_on, asOf: str(settings.site_as_of) },
    // A database from before the deadline check has none of these tables.
    calendar: sorted(t.calendar_entries ?? []).map((x) =>
      tidy({
        id: str(x.id),
        slug: str(x.slug),
        label: str(x.label),
        due: str(x.due),
        source: x.source as CalendarEntry["source"],
        url: opt(x.url as string | null),
        by: str(x.set_by),
        at: iso(x.set_at),
      }),
    ),
    findings: sorted(t.deadline_findings ?? [], "prepend").map((x) =>
      tidy({
        id: str(x.id),
        sourceId: str(x.source_id),
        slug: str(x.slug),
        target: x.target as DeadlineFinding["target"],
        label: str(x.label),
        due: str(x.due),
        quote: str(x.quote),
        url: str(x.url),
        foundAt: iso(x.found_at),
        state: x.state as DeadlineFinding["state"],
        decidedBy: opt(x.decided_by as string | null),
        decidedAt: isoOpt(x.decided_at),
      }),
    ),
    watch: sorted(t.deadline_watch ?? []).map((x) =>
      tidy({
        id: str(x.id),
        checkedAt: iso(x.checked_at),
        status: x.status as DeadlineWatch["status"],
        hash: opt(x.hash as string | null),
        changedAt: isoOpt(x.changed_at),
        note: str(x.note),
      }),
    ),
  };

  const b = single(t.backup_settings, "backup_settings");
  const backup: BackupState = {
    schedule: {
      full: str(b.schedule_full),
      incremental: str(b.schedule_incremental),
      retentionDays: num(b.retention_days),
      monthlyMonths: num(b.monthly_months),
      offsite: !!b.offsite,
      encrypted: !!b.encrypted,
    },
    objectives: { rpoMinutes: num(b.rpo_minutes), rtoMinutes: num(b.rto_minutes) },
    points: sorted(t.recovery_points, "prepend").map((x) =>
      tidy({
        id: str(x.id),
        at: iso(x.at),
        kind: x.kind as BackupState["points"][number]["kind"],
        sizeMB: num(x.size_mb),
        location: x.location as BackupState["points"][number]["location"],
        status: x.status as "Completed" | "Failed",
        checksum: str(x.checksum),
        file: opt(x.file as string | null),
        verifiedAt: isoOpt(x.verified_at),
        expiresAt: str(x.expires_at),
      }),
    ),
    tests: sorted(t.restore_tests, "prepend").map((x) => ({
      id: str(x.id),
      at: iso(x.at),
      pointId: str(x.point_id),
      result: x.result as "Passed" | "Failed",
      minutes: num(x.minutes),
      by: str(x.by),
      notes: str(x.notes),
    })),
    procedures: sorted(t.recovery_procedures).map((x) => ({ id: str(x.id), title: str(x.title), owner: str(x.owner), updated: str(x.updated), steps: strs(x.steps) })),
  };

  const mediaOf = group(t.post_media, "post_id");
  const media = (r: Row): PostMedia => ({ src: str(r.src), width: num(r.width), height: num(r.height), alt: str(r.alt) });
  const records: Records = {
    evidence: Object.fromEntries(
      sorted(t.evidence).map((e): [string, EvidenceRecord] => [
        str(e.id),
        tidy({
          id: str(e.id),
          title: str(e.title),
          unitSlug: str(e.unit_id),
          programId: opt(e.program_id as string | null),
          type: str(e.type),
          period: str(e.period),
          submitted: str(e.submitted),
          submittedBy: str(e.submitted_by),
          submittedById: opt(e.submitted_by_id as string | null),
          status: e.status as EvidenceRecord["status"],
          stage: num(e.stage),
          level: num(e.level) as EvidenceRecord["level"],
          mappedTo: strs(e.mapped_to),
          sdgs: ints(e.sdgs),
          summary: str(e.summary),
          result: str(e.result),
          beneficiaries: str(e.beneficiaries),
          files: strs(e.files),
          attachments: Array.isArray(e.attachments) && e.attachments.length ? (e.attachments as EvidenceFile[]) : undefined,
          background: str(e.background) || undefined,
          verifiedBy: str(e.verified_by) || undefined,
          links: Array.isArray(e.links) && e.links.length ? (e.links as EvidenceLink[]) : undefined,
          references: Array.isArray(e.citations) && e.citations.length ? (e.citations as EvidenceReference[]) : undefined,
          comments: commentsOf(str(e.id)).map((c) => ({ by: str(c.by), role: str(c.role), date: str(c.date), text: str(c.text) })),
        }),
      ]),
    ),
    posts: sorted(t.posts, "prepend").map((x): PostRecord => {
      const m = mediaOf(str(x.id));
      return tidy({
        id: str(x.id),
        slug: str(x.slug),
        title: str(x.title),
        subtitle: str(x.subtitle),
        sdgs: ints(x.sdgs),
        themes: strs(x.themes),
        hashtags: opt(x.hashtags as string[] | null),
        layout: opt(x.layout as PostRecord["layout"] | null),
        thumbnail: m.find((r) => r.role === "thumbnail") ? media(m.find((r) => r.role === "thumbnail")!) : null,
        body: str(x.body),
        photos: m.filter((r) => r.role === "photo").map(media),
        status: x.status as PostRecord["status"],
        authorId: str(x.author_id),
        unitSlug: opt(x.unit_id as string | null),
        createdAt: iso(x.created_at),
        updatedAt: iso(x.updated_at),
        updatedBy: str(x.updated_by),
        publishedAt: isoOpt(x.published_at),
      });
    }),
    // Read as empty until the documents migration reaches the database.
    documents: sorted(t.documents ?? [], "prepend").map((x): DocumentRecord =>
      tidy({
        id: str(x.id),
        slug: str(x.slug),
        kind: x.kind as DocumentRecord["kind"],
        title: str(x.title),
        authors: strs(x.authors),
        venue: str(x.venue),
        type: str(x.type),
        abstract: str(x.abstract),
        issued: str(x.issued),
        doi: opt(x.doi as string | null),
        url: opt(x.url as string | null),
        file: x.file_src ? { src: str(x.file_src), name: str(x.file_name), sizeMB: num(x.file_mb) } : undefined,
        sdgs: ints(x.sdgs),
        keywords: strs(x.keywords),
        unitSlug: opt(x.unit_id as string | null),
        featured: x.featured ? true : undefined,
        coverTone: opt(x.cover_tone as string | null) as DocumentRecord["coverTone"],
        status: x.status as DocumentRecord["status"],
        createdBy: str(x.created_by),
        createdAt: iso(x.created_at),
        updatedAt: iso(x.updated_at),
        updatedBy: str(x.updated_by),
        publishedAt: isoOpt(x.published_at),
      }),
    ),
    // Read as empty until the workspace migration reaches the database.
    workspace: sorted(t.workspace_files ?? [], "prepend").map((x): WorkspaceFile =>
      tidy({
        id: str(x.id),
        unitId: opt(x.unit_id as string | null),
        shelf: x.shelf as WorkspaceFile["shelf"],
        folderId: opt(x.folder_id as string | null),
        name: str(x.name),
        src: str(x.src),
        bytes: num(x.bytes),
        createdBy: str(x.created_by),
        createdAt: iso(x.created_at),
        updatedAt: iso(x.updated_at),
        updatedBy: str(x.updated_by),
        archivedAt: isoOpt(x.archived_at),
        archivedBy: opt(x.archived_by as string | null),
      }),
    ),
    // Read as empty until the folders migration reaches the database.
    workspaceFolders: sorted(t.workspace_folders ?? [], "append").map((x): WorkspaceFolder =>
      tidy({
        id: str(x.id),
        unitId: opt(x.unit_id as string | null),
        shelf: x.shelf as WorkspaceFolder["shelf"],
        parentId: opt(x.parent_id as string | null),
        name: str(x.name),
        createdBy: str(x.created_by),
        createdAt: iso(x.created_at),
        updatedAt: iso(x.updated_at),
        updatedBy: str(x.updated_by),
      }),
    ),
    // Read as empty until the working documents migration reaches the database.
    workingDocs: sorted(t.workspace_docs ?? [], "prepend").map((x): WorkingDoc => ({
      id: str(x.id),
      unitId: opt(x.unit_id as string | null),
      title: str(x.title),
      date: str(x.doc_date).slice(0, 10),
      rankings: strs(x.rankings),
      sdgs: ints(x.sdgs),
      authors: strs(x.authors),
      status: x.status as WorkingDoc["status"],
      links: strs(x.links),
      remarks: str(x.remarks),
      createdBy: str(x.created_by),
      createdAt: iso(x.created_at),
      updatedAt: iso(x.updated_at),
      updatedBy: str(x.updated_by),
    })),
    // Read as empty until the digital forms migration reaches the database.
    forms: sorted(t.forms ?? [], "prepend").map((x): FormRecord =>
      tidy({
        id: str(x.id),
        unitId: opt(x.unit_id as string | null),
        ownerId: opt(x.owner_id as string | null),
        code: str(x.code),
        prefix: str(x.prefix),
        title: str(x.title),
        description: str(x.description),
        kind: x.kind as FormRecord["kind"],
        reference: opt(x.reference as string | null),
        issuerId: opt(x.issuer_id as string | null),
        status: x.status as FormRecord["status"],
        closesOn: x.closes_on ? str(x.closes_on).slice(0, 10) : undefined,
        copies: x.copies === true || undefined,
        students: x.students === true || undefined,
        schema: x.schema as FormRecord["schema"],
        createdBy: str(x.created_by),
        createdAt: iso(x.created_at),
        updatedAt: iso(x.updated_at),
        updatedBy: str(x.updated_by),
      }),
    ),
    postViewsStartedAt: iso(settings.post_views_since),
    stories: Object.fromEntries(t.story_states.map((x) => [str(x.slug), x.state as Records["stories"][string]])),
    proposals: sorted(t.story_proposals, "prepend").map((x) => ({
      slug: str(x.slug),
      title: str(x.title),
      unitSlug: str(x.unit_id),
      by: str(x.by),
      at: iso(x.at),
      sdgs: ints(x.sdgs),
      rankings: strs(x.rankings),
      challenge: str(x.challenge),
      outcome: str(x.outcome),
    })),
    values: Object.fromEntries(
      t.requirement_values.map((v) => [
        str(v.requirement_id),
        { value: str(v.value), source: str(v.source), status: v.status as Records["values"][string]["status"], by: str(v.by), at: iso(v.at) },
      ]),
    ),
    publishedReports: sorted(t.published_reports, "prepend").map((x) => ({ id: str(x.id), title: str(x.title), at: iso(x.at), by: str(x.by) })),
    innovations: sorted(t.innovations, "prepend").map((x) => ({
      id: str(x.id),
      name: str(x.name),
      unitSlug: str(x.unit_id),
      by: str(x.by),
      at: iso(x.at),
      category: str(x.category),
    })),
    assistance: sorted(t.assistance_requests, "prepend").map((x) => ({
      id: str(x.id),
      topic: str(x.topic),
      unitSlug: str(x.unit_id),
      by: str(x.by),
      at: iso(x.at),
      urgent: !!x.urgent,
    })),
    counters: Object.fromEntries(t.id_counters.map((c) => [str(c.name), num(c.value)])),
  };

  return {
    accounts,
    sessions: sorted(t.sessions).map((x) => ({
      id: str(x.id),
      accountId: str(x.account_id),
      createdAt: iso(x.created_at),
      lastSeen: iso(x.last_seen),
      mfa: !!x.mfa,
      device: str(x.device),
    })),
    challenges: sorted(t.sign_in_challenges).map((x) => ({
      id: str(x.id),
      accountId: str(x.account_id),
      createdAt: iso(x.created_at),
      next: str(x.next),
      attempts: num(x.attempts),
    })),
    failures: sorted(t.sign_in_failures).map((x) => ({ email: str(x.email), at: iso(x.at) })),
    units,
    datasets: sorted(t.datasets).map((d) =>
      tidy({
        id: str(d.id),
        name: str(d.name),
        description: str(d.description),
        ownerUnitId: str(d.owner_unit_id),
        stewardId: str(d.steward_id),
        classification: d.classification as GovernanceState["datasets"][number]["classification"],
        locked: opt(d.locked as string | null),
        retention: { years: num(d.retention_years), then: d.retention_then as "Archive" | "Review" | "Dispose" },
        exportPolicy: d.export_policy as GovernanceState["datasets"][number]["exportPolicy"],
        bodies: strs(d.bodies) as GovernanceState["datasets"][number]["bodies"],
        publicSurface: opt(d.public_surface as string | null),
        personal: !!d.personal,
        records: num(d.records),
        version: num(d.version),
        versions: versionsOf(str(d.id), "prepend").map((v) => ({ v: num(v.v), at: iso(v.at), by: str(v.by), note: str(v.note) })),
        updatedAt: iso(d.updated_at),
      }),
    ),
    rules: sorted(t.quality_rules).map((r) =>
      tidy({
        id: str(r.id),
        datasetId: str(r.dataset_id),
        name: str(r.name),
        description: str(r.description),
        enabled: !!r.enabled,
        severity: r.severity as "Error" | "Warning",
        check: r.check as GovernanceState["rules"][number]["check"],
        externalFailures: opt(r.external_failures as number | null),
        lastRun: isoOpt(r.last_run),
      }),
    ),
    duplicates: sorted(t.duplicate_decisions).map((d) =>
      tidy({ key: str(d.key), decision: d.decision as "Merged" | "Dismissed", keep: opt(d.keep as string | null), by: str(d.by), at: iso(d.at) }),
    ),
    terms: sorted(t.term_stewardship).map((m) =>
      tidy({
        term: str(m.term),
        definition: opt(m.definition as string | null),
        datasetId: str(m.dataset_id),
        stewardId: str(m.steward_id),
        unitOfMeasure: str(m.unit_of_measure),
        updatedAt: iso(m.updated_at),
      }),
    ),
    security,
    workflows: sorted(t.workflows).map((w) => ({
      id: w.id as GovernanceState["workflows"][number]["id"],
      name: str(w.name),
      description: str(w.description),
      enabled: !!w.enabled,
      steps: stepsOf(str(w.id)).map((s) => ({ name: str(s.name) })),
      slaDays: num(w.sla_days),
      separation: !!w.separation,
    })),
    requests: sorted(t.approval_requests, "prepend").map((r): ApprovalRequest =>
      tidy({
        id: str(r.id),
        workflowId: r.workflow_id as ApprovalRequest["workflowId"],
        title: str(r.title),
        requesterId: str(r.requester_id),
        requestedAt: iso(r.requested_at),
        justification: str(r.justification),
        payload: r.payload as RequestPayload,
        status: r.status as ApprovalRequest["status"],
        step: num(r.step),
        decisions: decisionsOf(str(r.id)).map((d) =>
          tidy({ step: num(d.step), by: str(d.by), at: iso(d.at), decision: d.decision as "Approved" | "Rejected", note: opt(d.note as string | null) }),
        ),
        reviewing: r.reviewing_by ? { by: str(r.reviewing_by), at: iso(r.reviewing_at) } : undefined,
        due: str(r.due),
        completedAt: isoOpt(r.completed_at),
      }),
    ),
    config,
    backup,
    records,
    notices: sorted(t.notices, "prepend").map((n) =>
      tidy({
        id: str(n.id),
        at: iso(n.at),
        to: str(n.recipient),
        text: str(n.text),
        href: str(n.href),
        templateId: opt(n.template_id as string | null),
        readBy: readsOf(str(n.id)).map((r) => str(r.account_id)),
      }),
    ),
  };
}

/* ---------- The audit trail ---------- */

export const auditRow = (e: AuditEvent): Row => ({
  seq: e.seq,
  at: e.at,
  actor_id: e.actorId,
  actor_name: e.actorName,
  actor_role: e.actorRole,
  action: e.action,
  category: e.category,
  resource_type: e.resource.type,
  resource_id: e.resource.id,
  resource_label: e.resource.label,
  outcome: e.outcome,
  detail: nul(e.detail),
  prev: e.prev,
  hash: e.hash,
});

export const auditEvent = (r: Row): AuditEvent =>
  tidy({
    seq: num(r.seq),
    at: iso(r.at),
    actorId: str(r.actor_id),
    actorName: str(r.actor_name),
    actorRole: str(r.actor_role),
    action: str(r.action),
    category: r.category as AuditEvent["category"],
    resource: { type: str(r.resource_type), id: str(r.resource_id), label: str(r.resource_label) },
    outcome: r.outcome as AuditEvent["outcome"],
    detail: opt(r.detail as string | null),
    prev: str(r.prev),
    hash: str(r.hash),
  });

/* ---------- Changes between two models ---------- */

export interface Changes {
  deletes: { table: TableName; rows: Row[] }[];
  upserts: { table: TableName; rows: Row[] }[];
  /** Rows written, for logging. */
  count: number;
}

const keyOf = (table: TableName, r: Row) => TABLES[table].map((k) => String(r[k])).join("\u0000");

/** The rows to delete and to write so that tables holding `before` hold `after`. */
export function diff(before: Tables | null, after: Tables): Changes {
  const out: Changes = { deletes: [], upserts: [], count: 0 };
  const names = Object.keys(TABLES) as TableName[];
  for (const table of names) {
    const old = new Map((before?.[table] ?? []).map((r) => [keyOf(table, r), r]));
    const now = new Map(after[table].map((r) => [keyOf(table, r), r]));
    const upserts = [...now].filter(([k, r]) => !old.has(k) || JSON.stringify(old.get(k)) !== JSON.stringify(r)).map(([, r]) => r);
    const deletes = [...old].filter(([k]) => !now.has(k)).map(([, r]) => r);
    if (upserts.length) out.upserts.push({ table, rows: upserts });
    if (deletes.length) out.deletes.unshift({ table, rows: deletes.map((r) => Object.fromEntries(TABLES[table].map((c) => [c, r[c]]))) });
    out.count += upserts.length + deletes.length;
  }
  return out;
}
