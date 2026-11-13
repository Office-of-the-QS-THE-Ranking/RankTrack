"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { AccessReview, Classification, Incident, PrivacyAssessment, SecurityPolicy, SubjectRequest } from "@/lib/governance/types";
import type { ConsoleData } from "@/lib/governance/console-types";
import { viewerCan } from "@/lib/governance/viewer";
import { Tile } from "@/components/dashboard/Tile";
import { ChoiceCards, type Choice } from "./ChoiceCards";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Segmented, TabPanel } from "@/components/ui/interactive";
import { DateField, NumberField, Select } from "@/components/ui/pickers";
import { EmptyNote, Field, Hint, Pill, ReadOnly, Sheet, StatusPill, Switch, Tabs, fmtAgo, fmtDate, plural, useAct, useConsole } from "../ui";

/*
 * Command & Control › Privacy & Security. Overview scores the policy against a short list of checks and sends each
 * failing one to the tab that fixes it; the other tabs draw each setting as what it does (a session timeline,
 * a lockout counter, a classification ladder, key rotation rings) with the control beside it. Styles: security.css (sp-*).
 */

type Tab = "Overview" | "Sign-in" | "Access reviews" | "Privacy" | "Alerts" | "Protection";
type Creating = null | "review" | "dsr" | "pia" | "incident";

const COMPLIANCE =
  "These settings support University policy and the Data Privacy Act of 2012 (RA 10173). No single setting guarantees compliance: confirm procedures with the Data Protection Officer.";

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const day0 = (iso: string) => Date.parse(iso.slice(0, 10) + "T00:00:00Z");
const daysBetween = (from: string, to: string) => Math.round((day0(to) - day0(from)) / 86_400_000);
const addDays = (iso: string, n: number) => new Date(day0(iso) + n * 86_400_000).toISOString().slice(0, 10);
const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

/* ---------- Posture: the checks behind the score ---------- */

type Layer = "Identity" | "Sessions" | "Access" | "Privacy" | "Data" | "Monitoring";
type State = "pass" | "warn" | "fail";
interface Check {
  id: string;
  layer: Layer;
  label: string;
  value: string;
  state: State;
  tab: Tab;
}

const LAYERS: { key: Layer; icon: IconName; tab: Tab }[] = [
  { key: "Identity", icon: "user", tab: "Sign-in" },
  { key: "Sessions", icon: "clock", tab: "Sign-in" },
  { key: "Access", icon: "users", tab: "Access reviews" },
  { key: "Privacy", icon: "eye-closed", tab: "Privacy" },
  { key: "Data", icon: "lock", tab: "Protection" },
  { key: "Monitoring", icon: "activity", tab: "Alerts" },
];

const isOpenDsr = (r: SubjectRequest) => r.status === "Open" || r.status === "In progress";
const nextRotation = (k: SecurityPolicy["keys"][number]) => addDays(k.rotated, k.rotationDays);
const reviewOverdue = (r: AccessReview, day: string) => r.status !== "Complete" && r.due < day;

function posture(sec: SecurityPolicy, data: ConsoleData): Check[] {
  const day = data.day;
  const required = (data.accounts ?? []).filter((a) => a.status === "Active" && a.mfaRequired);
  const gaps = required.filter((a) => !a.mfa.enrolled).length;
  const overdueReviews = sec.reviews.filter((r) => reviewOverdue(r, day)).length;
  const lateDsr = sec.subjectRequests.filter((r) => isOpenDsr(r) && r.due < day).length;
  const highPia = sec.assessments.filter((a) => a.risk === "High" && a.status !== "Approved").length;
  const lateKeys = sec.keys.filter((k) => nextRotation(k) <= day).length;
  const highAlerts = sec.alerts.filter((a) => a.status === "Open" && a.severity === "High").length;
  const openInc = sec.incidents.filter((i) => i.status !== "Closed");
  const noticeAge = sec.privacy.noticeUpdated ? daysBetween(sec.privacy.noticeUpdated, day) : Infinity;
  const confidential = sec.exports.blocked.includes("Confidential") || sec.exports.approvalFor.includes("Confidential");
  const checks: Check[] = [
    {
      id: "mfa",
      layer: "Identity",
      label: "2-step verification for everyone",
      value: sec.mfa.mode === "Everyone" ? "Everyone" : sec.mfa.mode === "Off" ? "Off" : "Selected roles",
      state: sec.mfa.mode === "Everyone" ? "pass" : sec.mfa.mode === "Off" ? "fail" : "warn",
      tab: "Sign-in",
    },
    { id: "sso", layer: "Identity", label: "Google sign-in only", value: sec.sso.enforced ? "On" : "Off", state: sec.sso.enforced ? "pass" : "fail", tab: "Sign-in" },
    {
      id: "idle",
      layer: "Sessions",
      label: "Idle sign-out in 30 minutes or less",
      value: `${sec.session.idleMinutes} min`,
      state: sec.session.idleMinutes <= 30 ? "pass" : sec.session.idleMinutes <= 60 ? "warn" : "fail",
      tab: "Sign-in",
    },
    { id: "abs", layer: "Sessions", label: "Sessions end within 12 hours", value: `${sec.session.absoluteHours} h`, state: sec.session.absoluteHours <= 12 ? "pass" : "warn", tab: "Sign-in" },
    {
      id: "lock",
      layer: "Sessions",
      label: "Lock after 5 failed tries or fewer",
      value: `${sec.lockout.attempts} tries`,
      state: sec.lockout.attempts <= 5 ? "pass" : sec.lockout.attempts <= 10 ? "warn" : "fail",
      tab: "Sign-in",
    },
    {
      id: "reviews",
      layer: "Access",
      label: "Access reviews on schedule",
      value: !sec.reviews.length ? "None yet" : overdueReviews ? `${overdueReviews} overdue` : "On time",
      state: !sec.reviews.length ? "warn" : overdueReviews ? "fail" : "pass",
      tab: "Access reviews",
    },
    {
      id: "notice",
      layer: "Privacy",
      label: "Privacy notice reviewed this year",
      value: sec.privacy.noticeUpdated ? fmtDate(sec.privacy.noticeUpdated) : "Not set",
      state: noticeAge <= 365 ? "pass" : noticeAge === Infinity ? "fail" : "warn",
      tab: "Privacy",
    },
    { id: "dsr", layer: "Privacy", label: "Data requests answered on time", value: lateDsr ? `${lateDsr} late` : "On time", state: lateDsr ? "fail" : "pass", tab: "Privacy" },
    { id: "pia", layer: "Privacy", label: "High-risk assessments approved", value: highPia ? `${highPia} pending` : "All approved", state: highPia ? "warn" : "pass", tab: "Privacy" },
    {
      id: "restricted",
      layer: "Data",
      label: "Restricted data cannot be exported",
      value: sec.exports.blocked.includes("Restricted") ? "Blocked" : "Allowed",
      state: sec.exports.blocked.includes("Restricted") ? "pass" : "fail",
      tab: "Protection",
    },
    { id: "confidential", layer: "Data", label: "Confidential exports need approval", value: confidential ? "Guarded" : "Open", state: confidential ? "pass" : "warn", tab: "Protection" },
    { id: "watermark", layer: "Data", label: "Exports carry a watermark", value: sec.exports.watermark ? "On" : "Off", state: sec.exports.watermark ? "pass" : "warn", tab: "Protection" },
    { id: "links", layer: "Data", label: "No public links to evidence", value: sec.sharing.externalLinks ? "Allowed" : "Off", state: sec.sharing.externalLinks ? "warn" : "pass", tab: "Protection" },
    { id: "keys", layer: "Data", label: "Keys rotated on schedule", value: lateKeys ? `${lateKeys} overdue` : "On time", state: lateKeys ? "fail" : "pass", tab: "Protection" },
    { id: "alerts", layer: "Monitoring", label: "No open high-severity alerts", value: highAlerts ? `${highAlerts} open` : "Clear", state: highAlerts ? "fail" : "pass", tab: "Alerts" },
    {
      id: "incidents",
      layer: "Monitoring",
      label: "No open incidents",
      value: openInc.length ? `${openInc.length} open` : "Clear",
      state: openInc.some((i) => i.personalData || i.severity === "Critical") ? "fail" : openInc.length ? "warn" : "pass",
      tab: "Alerts",
    },
  ];
  if (sec.mfa.mode !== "Off" && required.length)
    checks.splice(2, 0, { id: "enrol", layer: "Identity", label: "Everyone required has set up 2-step", value: gaps ? `${gaps} pending` : "All set", state: gaps ? "warn" : "pass", tab: "Sign-in" });
  return checks;
}

const WEIGHT: Record<State, number> = { pass: 1, warn: 0.5, fail: 0 };
const scoreOf = (checks: Check[]) => Math.round((checks.reduce((n, c) => n + WEIGHT[c.state], 0) / Math.max(1, checks.length)) * 100);
const gradeOf = (score: number) =>
  score >= 90 ? { key: "resilient", label: "Resilient" } : score >= 75 ? { key: "satisfactory", label: "Satisfactory" } : score >= 55 ? { key: "elevated", label: "Elevated Risk" } : { key: "critical", label: "Critical" };
const STATE_ICON: Record<State, IconName> = { pass: "check", warn: "alert", fail: "x-circle" };

/* ---------- Page ---------- */

export function Security() {
  const { data, focus } = useConsole();
  const sec = data.security!;
  const [tab, setTab] = useState<Tab>(focus === "alerts" ? "Alerts" : focus === "keys" ? "Protection" : focus === "reviews" ? "Access reviews" : "Overview");
  const [creating, setCreating] = useState<Creating>(null);
  const edit = viewerCan(data.viewer, "security", "edit");
  const manage = viewerCan(data.viewer, "security", "manage");
  const checks = useMemo(() => posture(sec, data), [sec, data]);
  const toFix = checks.filter((c) => c.state !== "pass").length;
  const alerts = sec.alerts.filter((a) => a.status === "Open").length + sec.incidents.filter((i) => i.status !== "Closed").length;
  const tabs: Tab[] = ["Overview", "Sign-in", "Access reviews", "Privacy", "Alerts", "Protection"];
  const action = (label: string, icon: IconName, what: Creating) => (
    <button type="button" className="content-tabs__action" onClick={() => setCreating(what)}>
      <Icon name={icon} size={15} /> {label}
    </button>
  );
  const actions =
    tab === "Access reviews" && manage ? (
      action("Start review", "plus", "review")
    ) : tab === "Privacy" && edit ? (
      <>
        {action("New assessment", "plus", "pia")}
        {action("Log request", "inbox", "dsr")}
      </>
    ) : tab === "Alerts" ? (
      action("Report incident", "flag", "incident")
    ) : undefined;
  const close = () => setCreating(null);
  return (
    <div className="sp">
      <Tabs
        label="Privacy and security"
        idBase="sp"
        value={tab}
        onChange={(t) => {
          setTab(t);
          setCreating(null);
        }}
        actions={actions}
        tabs={[
          { key: "Overview", label: "Overview", count: toFix || undefined },
          { key: "Sign-in", label: "Sign-in" },
          { key: "Access reviews", label: "Access reviews" },
          { key: "Privacy", label: "Privacy" },
          { key: "Alerts", label: "Alerts and incidents", count: alerts || undefined, countTone: "alert" },
          { key: "Protection", label: "Data protection" },
        ]}
      />
      {!edit && <ReadOnly>View only.</ReadOnly>}
      <TabPanel idBase="sp" index={tabs.indexOf(tab)} className="sp-panel">
        {tab === "Overview" && <Overview sec={sec} checks={checks} go={setTab} />}
        {tab === "Sign-in" && <SignIn sec={sec} />}
        {tab === "Access reviews" && <Reviews sec={sec} starting={creating === "review"} onDone={close} />}
        {tab === "Privacy" && <Privacy sec={sec} creating={creating} onDone={close} />}
        {tab === "Alerts" && <AlertsAndIncidents sec={sec} reporting={creating === "incident"} onDone={close} />}
        {tab === "Protection" && <Protection sec={sec} />}
      </TabPanel>
    </div>
  );
}

function SaveBar({ dirty, onSave, onReset }: { dirty: boolean; onSave: () => void; onReset: () => void }) {
  if (!dirty) return null;
  return (
    <div className="sp-save">
      <span className="sp-save__dot" aria-hidden="true" />
      <span className="sp-save__text">Unsaved changes</span>
      <button type="button" className="btn btn--sm" onClick={onReset}>
        Discard
      </button>
      <button type="button" className="btn btn--sm btn--dark" onClick={onSave}>
        Save
      </button>
    </div>
  );
}

/** A tile heading with its glyph. */
const Head = ({ icon, children, hint }: { icon: IconName; children: ReactNode; hint?: string }) => (
  <>
    <span className="sp-glyph" aria-hidden="true">
      <Icon name={icon} size={16} />
    </span>
    {children}
    {hint && <Hint text={hint} />}
  </>
);

/** A thin progress ring; `value` runs 0 to 1. */
function Ring({ value, size = 44, tone, children, label }: { value: number; size?: number; tone?: "ok" | "warn" | "danger"; children?: ReactNode; label: string }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  return (
    <span className="sp-ring" data-tone={tone} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle className="sp-ring__track" cx={size / 2} cy={size / 2} r={r} />
        {value > 0 && <circle className="sp-ring__fill" cx={size / 2} cy={size / 2} r={r} strokeDasharray={`${clamp(value) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
      </svg>
      {children && <span className="sp-ring__in">{children}</span>}
    </span>
  );
}

/* ---------- Overview ---------- */

function Overview({ sec, checks, go }: { sec: SecurityPolicy; checks: Check[]; go: (t: Tab) => void }) {
  const { data } = useConsole();
  const [show, setShow] = useState<"To fix" | "All checks">("To fix");
  const score = scoreOf(checks);
  const grade = gradeOf(score);
  const order: Record<State, number> = { fail: 0, warn: 1, pass: 2 };
  const listed = (show === "To fix" ? checks.filter((c) => c.state !== "pass") : checks).slice().sort((a, b) => order[a.state] - order[b.state]);
  const TICKS = 60;
  const lit = Math.round((score / 100) * TICKS);

  const openAlerts = sec.alerts.filter((a) => a.status === "Open").length;
  const openInc = sec.incidents.filter((i) => i.status !== "Closed").length;
  const openDsr = sec.subjectRequests.filter(isOpenDsr).length;
  const activeReviews = sec.reviews.filter((r) => r.status !== "Complete").length;
  const days = Array.from({ length: 14 }, (_, i) => addDays(data.day, i - 13));
  const perDay = days.map((d) => sec.alerts.filter((a) => a.at.slice(0, 10) === d).length + sec.incidents.filter((i) => i.reported.slice(0, 10) === d).length);
  const peak = Math.max(1, ...perDay);
  const events = perDay.reduce((a, b) => a + b, 0);

  return (
    <div className="sp-ov">
      <section className="sp-hero" data-grade={grade.key} aria-labelledby="sp-hero-title">
        <div className="sp-hero__grid" aria-hidden="true" />
        <div className="sp-radar" role="img" aria-label={`Security score ${score} of 100, ${grade.label}`}>
          <svg viewBox="0 0 220 220" aria-hidden="true">
            <circle className="sp-radar__ring" cx="110" cy="110" r="72" />
            <circle className="sp-radar__ring" cx="110" cy="110" r="52" />
            <circle className="sp-radar__ring sp-radar__ring--dash" cx="110" cy="110" r="88" />
            {Array.from({ length: TICKS }, (_, i) => {
              const deg = (i / TICKS) * 360 - 90;
              const r2 = i % 5 === 0 ? 108 : 104;
              // The wave's phase is the tick's angle behind the sweep (5s per turn), so the
              // crests travel round the ring in step with the sweep's bright edge.
              const wave = { animationDelay: `${i * 14}ms, ${Math.round((i / TICKS) * 5000) - 5000}ms` } as CSSProperties;
              return (
                <g key={i} transform={`rotate(${deg.toFixed(2)} 110 110)`}>
                  <line className={i < lit ? "sp-radar__tick is-lit" : "sp-radar__tick"} style={wave} x1="206" y1="110" x2={110 + r2} y2="110" />
                </g>
              );
            })}
          </svg>
          <span className="sp-radar__sweep" aria-hidden="true" />
          <span className="sp-radar__core">
            <b className="num">{score}</b>
            <small>of 100</small>
          </span>
        </div>
        <div className="sp-hero__body">
          <span className="sp-eyebrow sp-eyebrow--plain">
            Security Posture: Listening for Leaks
          </span>
          <h2 id="sp-hero-title" className="sp-hero__title">
            {grade.label}
          </h2>
        </div>
        <ul className="sp-layers" aria-label="Protection layers">
          {LAYERS.map((l) => {
            const mine = checks.filter((c) => c.layer === l.key);
            const worst: State = mine.some((c) => c.state === "fail") ? "fail" : mine.some((c) => c.state === "warn") ? "warn" : "pass";
            return (
              <li key={l.key}>
                <button type="button" className="sp-layer" data-state={worst} onClick={() => go(l.tab)}>
                  <span className="sp-layer__top">
                    <Icon name={l.icon} size={14} />
                    <span>{l.key}</span>
                    <Icon name="arrow-up-right" size={12} className="sp-go" aria-hidden="true" />
                  </span>
                  <span className="sp-layer__segs" aria-hidden="true">
                    {mine.map((c) => (
                      <i key={c.id} data-state={c.state} />
                    ))}
                  </span>
                  <span className="sr-only">
                    {mine.filter((c) => c.state === "pass").length} of {mine.length} pass
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="sp-bento">
        <Tile
          id="sp-checks"
          className="sp-span-7"
          title={<Head icon="shield-check">Checks</Head>}
          aside={<Segmented label="Which checks" value={show} onChange={setShow} options={["To fix", "All checks"]} />}
        >
          {listed.length ? (
            <ul className="sp-checks">
              {listed.map((c) => (
                <li key={c.id} className="sp-check" data-state={c.state}>
                  <span className="sp-check__mark" aria-label={c.state === "pass" ? "Passes" : c.state === "warn" ? "Could be stronger" : "Fails"}>
                    <Icon name={STATE_ICON[c.state]} size={13} />
                  </span>
                  <span className="sp-check__text">
                    <b>{c.label}</b>
                    <small>{c.layer}</small>
                  </span>
                  <span className="sp-check__value num">{c.value}</span>
                  {c.state !== "pass" ? (
                    <button type="button" className="btn btn--sm sp-check__go" onClick={() => go(c.tab)} aria-label={`Fix: ${c.label}`}>
                      Fix <Icon name="arrow" size={13} />
                    </button>
                  ) : (
                    <span className="sp-check__go" aria-hidden="true" />
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="sp-allclear">
              <span className="sp-allclear__badge" aria-hidden="true">
                <Icon name="shield-check" size={28} />
              </span>
              <b>Every check passes</b>
            </div>
          )}
        </Tile>

        <Tile id="sp-signals" className="sp-span-5" title={<Head icon="activity">Signals</Head>}>
          <div className="sp-signals">
            {(
              [
                ["Open alerts", openAlerts, "Alerts", openAlerts ? "danger" : undefined],
                ["Open incidents", openInc, "Alerts", openInc ? "danger" : undefined],
                ["Data requests", openDsr, "Privacy", undefined],
                ["Reviews running", activeReviews, "Access reviews", undefined],
              ] as const
            ).map(([label, n, t, tone]) => (
              <button key={label} type="button" className="sp-signal" data-tone={tone} onClick={() => go(t)}>
                <span className="sp-signal__n num">{n}</span>
                <span className="sp-signal__label">{label}</span>
                <Icon name="arrow-up-right" size={14} className="sp-go" aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="sp-spark">
            <div className="sp-spark__head">
              <span>Last 14 days</span>
              <b className="num">{plural(events, "event")}</b>
            </div>
            <div className="sp-spark__bars" role="img" aria-label={`${events} alerts and incidents in the last 14 days`}>
              {perDay.map((n, i) => (
                <i key={days[i]} data-on={n > 0 || undefined} style={{ height: `${Math.max(8, (n / peak) * 100)}%` }} title={`${fmtDate(days[i])}: ${n}`} />
              ))}
            </div>
          </div>
        </Tile>

        <Tile id="sp-stack" className="sp-span-12" title={<Head icon="layers">Encryption</Head>}>
          <EncryptionStack sec={sec} />
        </Tile>
      </div>
    </div>
  );
}

function EncryptionStack({ sec }: { sec: SecurityPolicy }) {
  const rows: [string, string, IconName][] = [
    ["At rest", sec.encryption.atRest, "hard-drive"],
    ["In transit", sec.encryption.inTransit, "send"],
    ["Secrets", sec.encryption.secretsManager, "key"],
    ["Passwords", "None stored · Google sign-in", "lock"],
  ];
  return (
    <ol className="sp-stack">
      {rows.map(([k, v, icon], i) => (
        <li key={k} style={{ ["--i" as string]: i }}>
          <span className="sp-stack__icon" aria-hidden="true">
            <Icon name={icon} size={16} />
          </span>
          <span className="sp-stack__k">{k}</span>
          <span className="sp-stack__v">{v}</span>
          <span className="sp-stack__ok" aria-label="Active">
            <Icon name="check" size={12} />
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ---------- Sign-in ---------- */

const MODES: Choice<SecurityPolicy["mfa"]["mode"]>[] = [
  { value: "Everyone", label: "Everyone", sub: "Every account", icon: "users", tone: "ok" },
  { value: "Privileged roles", label: "Selected roles", sub: "Roles you choose", icon: "key", tone: "warn" },
  { value: "Off", label: "Nobody", sub: "Not recommended", icon: "lock-open", tone: "danger" },
];
const METHOD_ICON: Record<SecurityPolicy["mfa"]["methods"][number], IconName> = { "Authenticator app": "phone", "Security key": "key" };

function Toggle({ on, disabled, onChange, icon, children }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void; icon?: IconName; children: ReactNode }) {
  return (
    <label className="sp-tog" data-on={on || undefined}>
      <input type="checkbox" className="sr-only" checked={on} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="sp-tog__box" aria-hidden="true">
        <Icon name={on ? "check" : icon ?? "plus"} size={12} />
      </span>
      {children}
    </label>
  );
}

function SignIn({ sec }: { sec: SecurityPolicy }) {
  const { data } = useConsole();
  const act = useAct();
  const edit = viewerCan(data.viewer, "security", "edit");
  const manage = viewerCan(data.viewer, "security", "manage");
  const [mfa, setMfa] = useState(sec.mfa);
  const [sso, setSso] = useState(sec.sso);
  const [domain, setDomain] = useState("");
  const [session, setSession] = useState(sec.session);
  const [lockout, setLockout] = useState(sec.lockout);
  const [idle, setIdle] = useState(sec.inactivityDays);
  useEffect(() => {
    setMfa(sec.mfa);
    setSso(sec.sso);
    setSession(sec.session);
    setLockout(sec.lockout);
    setIdle(sec.inactivityDays);
  }, [sec]);
  const required = (data.accounts ?? []).filter((a) => a.status === "Active" && a.mfaRequired);
  const gaps = required.filter((a) => !a.mfa.enrolled);
  const addDomain = () => {
    const d = domain.trim().toLowerCase().replace(/^@/, "");
    if (!d) return;
    if (!sso.domains.includes(d)) setSso({ ...sso, domains: [...sso.domains, d] });
    setDomain("");
  };
  const warnAt = Math.max(0, session.idleMinutes - session.warnMinutes);
  return (
    <div className="sp-bento">
      <Tile id="sp-mfa" className="sp-span-7" title={<Head icon="shield-check">2-step verification</Head>}>
        <ChoiceCards
          name="sp-mfa-mode"
          label="Who needs 2-step verification"
          value={mfa.mode}
          disabled={!edit}
          locked={edit ? "Director only" : "View only"}
          chosen="Required"
          options={MODES.map((m) => (m.value === "Off" && !manage ? { ...m, disabled: true } : m))}
          onChange={(v) => setMfa({ ...mfa, mode: v })}
        />
        {mfa.mode === "Privileged roles" && (
          <fieldset className="sp-fieldset">
            <legend>Roles</legend>
            <div className="sp-togs">
              {data.roles.map((r) => (
                <Toggle key={r.id} on={mfa.roles.includes(r.id)} disabled={!edit} onChange={(v) => setMfa({ ...mfa, roles: v ? [...mfa.roles, r.id] : mfa.roles.filter((x) => x !== r.id) })}>
                  {r.name}
                </Toggle>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset className="sp-fieldset">
          <legend>Methods</legend>
          <div className="sp-togs">
            {(["Authenticator app", "Security key"] as const).map((m) => (
              <Toggle key={m} icon={METHOD_ICON[m]} on={mfa.methods.includes(m)} disabled={!edit} onChange={(v) => setMfa({ ...mfa, methods: v ? [...mfa.methods, m] : mfa.methods.filter((x) => x !== m) })}>
                {m}
              </Toggle>
            ))}
          </div>
        </fieldset>
        {required.length > 0 && mfa.mode !== "Off" && (
          <div className="sp-enrol" title={gaps.length ? gaps.map((a) => a.name).join(", ") : undefined}>
            <div className="sp-enrol__row">
              <span>Set up</span>
              <b className="num">
                {required.length - gaps.length} <small>of {required.length}</small>
              </b>
            </div>
            <span className="sp-bar" aria-hidden="true">
              <i style={{ width: `${((required.length - gaps.length) / required.length) * 100}%` }} />
            </span>
            {gaps.length > 0 && <small className="sp-muted">{plural(gaps.length, "person", "people")} will set it up at their next sign-in.</small>}
          </div>
        )}
        <SaveBar dirty={!same(mfa, sec.mfa)} onReset={() => setMfa(sec.mfa)} onSave={() => void act({ type: "security.policy", section: "mfa", value: mfa })} />
      </Tile>

      <Tile id="sp-sso" className="sp-span-5" title={<Head icon="globe">Google sign-in</Head>}>
        <div className="sp-rows">
          <div className="sp-row">
            <span className="sp-row__icon" aria-hidden="true">
              <Icon name="lock-keyhole" size={15} />
            </span>
            <span className="sp-row__text">
              <b>Google sign-in only</b>
              <small>{sso.provider || "Google Workspace"}</small>
            </span>
            <Switch checked={sso.enforced} disabled={!manage} label="Google sign-in only" onChange={(v) => setSso({ ...sso, enforced: v })} />
          </div>
          <div className="sp-row">
            <span className="sp-row__icon" aria-hidden="true">
              <Icon name="user-plus" size={15} />
            </span>
            <span className="sp-row__text">
              <b>Allow guests</b>
              <small>Outside collaborators, with an end date</small>
            </span>
            <Switch checked={sso.allowGuests} disabled={!manage} label="Allow guests" onChange={(v) => setSso({ ...sso, allowGuests: v })} />
          </div>
        </div>
        <fieldset className="sp-fieldset">
          <legend>Allowed domains</legend>
          <div className="sp-domains">
            {sso.domains.map((d) => (
              <span key={d} className="sp-domain">
                <span className="sp-domain__at" aria-hidden="true">
                  @
                </span>
                {d}
                {manage && (
                  <button type="button" aria-label={`Remove ${d}`} onClick={() => setSso({ ...sso, domains: sso.domains.filter((x) => x !== d) })}>
                    <Icon name="close" size={12} />
                  </button>
                )}
              </span>
            ))}
            {!sso.domains.length && <span className="sp-muted">Any Google account</span>}
          </div>
          {manage && (
            <span className="sp-add">
              <input
                className="input input--sm"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDomain();
                  }
                }}
                placeholder="Add a domain"
                aria-label="Add a domain"
              />
              <button type="button" className="btn btn--sm" disabled={!domain.trim()} onClick={addDomain}>
                Add
              </button>
            </span>
          )}
        </fieldset>
        <SaveBar dirty={!same(sso, sec.sso)} onReset={() => setSso(sec.sso)} onSave={() => void act({ type: "security.policy", section: "sso", value: sso })} />
      </Tile>

      <Tile id="sp-session" className="sp-span-6" title={<Head icon="clock">Sessions</Head>}>
        <div className="sp-timeline" role="img" aria-label={`Idle for ${warnAt} minutes shows a warning; ${session.idleMinutes} minutes signs out.`}>
          <div className="sp-timeline__track">
            <i className="sp-timeline__active" style={{ width: `${(warnAt / Math.max(1, session.idleMinutes)) * 100}%` }} />
            <i className="sp-timeline__warn" style={{ width: `${(Math.min(session.warnMinutes, session.idleMinutes) / Math.max(1, session.idleMinutes)) * 100}%` }} />
          </div>
          <div className="sp-timeline__legend">
            <span>
              <i className="is-active" aria-hidden="true" /> Active <b className="num">{warnAt} min</b>
            </span>
            <span>
              <i className="is-warn" aria-hidden="true" /> Warning <b className="num">{Math.min(session.warnMinutes, session.idleMinutes)} min</b>
            </span>
            <span className="sp-timeline__end">
              <Icon name="logout" size={12} /> Signed out at <b className="num">{session.idleMinutes} min</b>
            </span>
          </div>
        </div>
        <div className="sp-hours" role="img" aria-label={`Sessions end after ${session.absoluteHours} hours`}>
          {Array.from({ length: 24 }, (_, h) => (
            <i key={h} data-on={h < session.absoluteHours || undefined} data-long={h >= 12 || undefined} />
          ))}
          <span className="sp-hours__label">
            Longest session <b className="num">{session.absoluteHours} h</b>
          </span>
        </div>
        <div className="sp-fields">
          <Field label="Sign out when idle (min)">
            <NumberField className="input num" min={5} max={240} disabled={!edit} value={session.idleMinutes} onChange={(v) => setSession({ ...session, idleMinutes: v })} />
          </Field>
          <Field label="Warn before (min)">
            <NumberField className="input num" min={1} max={30} disabled={!edit} value={session.warnMinutes} onChange={(v) => setSession({ ...session, warnMinutes: v })} />
          </Field>
          <Field label="Longest session (hours)">
            <NumberField className="input num" min={1} max={24} disabled={!edit} value={session.absoluteHours} onChange={(v) => setSession({ ...session, absoluteHours: v })} />
          </Field>
        </div>
        <SaveBar dirty={!same(session, sec.session)} onReset={() => setSession(sec.session)} onSave={() => void act({ type: "security.policy", section: "session", value: session })} />
      </Tile>

      <Tile id="sp-lockout" className="sp-span-6" title={<Head icon="ban" hint="Too many failed sign-ins suspend the account and raise an alert.">Suspicious sign-ins</Head>}>
        <div className="sp-tries" role="img" aria-label={`${lockout.attempts} failed tries within ${lockout.windowMinutes} minutes locks the account`}>
          <div className="sp-tries__dots">
            {Array.from({ length: lockout.attempts }, (_, i) => (
              <i key={i} style={{ animationDelay: `${i * 40}ms` }} />
            ))}
            <span className="sp-tries__lock">
              <Icon name="lock" size={13} />
            </span>
          </div>
          <span className="sp-tries__label">
            <b className="num">{lockout.attempts}</b> failed tries in <b className="num">{lockout.windowMinutes}</b> min locks the account
          </span>
        </div>
        <div className="sp-fields">
          <Field label="Lock after failed tries">
            <NumberField className="input num" min={3} max={20} disabled={!edit} value={lockout.attempts} onChange={(v) => setLockout({ ...lockout, attempts: v })} />
          </Field>
          <Field label="Within (min)">
            <NumberField className="input num" min={5} max={120} disabled={!edit} value={lockout.windowMinutes} onChange={(v) => setLockout({ ...lockout, windowMinutes: v })} />
          </Field>
          <Field label="Flag inactive after (days)">
            <NumberField className="input num" min={30} max={365} disabled={!edit} value={idle} onChange={setIdle} />
          </Field>
        </div>
        <SaveBar
          dirty={!same(lockout, sec.lockout) || idle !== sec.inactivityDays}
          onReset={() => {
            setLockout(sec.lockout);
            setIdle(sec.inactivityDays);
          }}
          onSave={async () => {
            if (!same(lockout, sec.lockout)) await act({ type: "security.policy", section: "lockout", value: lockout });
            if (idle !== sec.inactivityDays) await act({ type: "security.policy", section: "inactivityDays", value: idle });
          }}
        />
      </Tile>
    </div>
  );
}

/* ---------- Access reviews ---------- */

function Reviews({ sec, starting, onDone }: { sec: SecurityPolicy; starting: boolean; onDone: () => void }) {
  const { data } = useConsole();
  const act = useAct();
  const [sel, setSel] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", population: "privileged" as "privileged" | "external" | "all", due: "" });
  const review = sec.reviews.find((r) => r.id === sel) ?? null;
  const running = sec.reviews.filter((r) => r.status !== "Complete");
  const overdue = sec.reviews.filter((r) => reviewOverdue(r, data.day)).length;
  const revoked = sec.reviews.reduce((n, r) => n + Object.values(r.decisions).filter((d) => d === "Revoke").length, 0);
  const pending = running.reduce((n, r) => n + r.accountIds.filter((a) => !r.decisions[a]).length, 0);
  return (
    <div className="sp-stack-y">
      <div className="sp-kpis">
        <Kpi label="Running" value={running.length} icon="refresh" />
        <Kpi label="Overdue" value={overdue} icon="clock" tone={overdue ? "danger" : undefined} />
        <Kpi label="Awaiting a decision" value={pending} icon="users" />
        <Kpi label="Access revoked" value={revoked} icon="user-minus" />
      </div>
      {sec.reviews.length ? (
        <ul className="sp-reviews">
          {sec.reviews.map((r) => {
            const done = r.accountIds.filter((a) => r.decisions[a]).length;
            const keep = r.accountIds.filter((a) => r.decisions[a] === "Keep").length;
            const total = Math.max(1, r.accountIds.length);
            const late = reviewOverdue(r, data.day);
            const left = daysBetween(data.day, r.due);
            return (
              <li key={r.id}>
                <button type="button" className="sp-review" data-late={late || undefined} onClick={() => setSel(r.id)}>
                  <span className="sp-review__top">
                    <Ring value={done / total} size={52} tone={r.status === "Complete" ? "ok" : late ? "danger" : undefined} label={`${done} of ${r.accountIds.length} decided`}>
                      <b className="num">{Math.round((done / total) * 100)}%</b>
                    </Ring>
                    <StatusPill value={late ? "Overdue" : r.status} />
                  </span>
                  <b className="sp-review__name">{r.name}</b>
                  <small className="sp-muted">{r.scope}</small>
                  <span className="sp-split" aria-label={`${keep} kept, ${done - keep} revoked, ${r.accountIds.length - done} undecided`}>
                    <i className="is-keep" style={{ flexGrow: keep }} />
                    <i className="is-revoke" style={{ flexGrow: done - keep }} />
                    <i style={{ flexGrow: r.accountIds.length - done }} />
                  </span>
                  <Icon name="arrow-up-right" size={14} className="sp-go" aria-hidden="true" />
                  <span className="sp-review__foot">
                    <span>
                      <Icon name="calendar" size={12} /> {fmtDate(r.due)}
                    </span>
                    <span className={late ? "is-danger" : undefined}>{r.status === "Complete" ? "Done" : late ? `${-left} days late` : left === 0 ? "Due today" : `${left} days left`}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="sp-empty">
          <span className="sp-empty__art" aria-hidden="true">
            <Icon name="users" size={26} />
          </span>
          <b>No access reviews yet</b>
          <small>Confirm who still needs access.</small>
        </div>
      )}
      <ReviewSheet review={review} onClose={() => setSel(null)} />
      <Sheet
        open={starting}
        onClose={onDone}
        title="Start an access review"
        footer={
          <>
            <button type="button" className="btn" onClick={onDone}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--dark"
              disabled={!f.name || !f.due}
              onClick={async () => {
                const r = await act({ type: "review.start", ...f });
                if (r.ok) {
                  setF({ name: "", population: "privileged", due: "" });
                  onDone();
                }
              }}
            >
              Start review
            </button>
          </>
        }
      >
        <div className="cmd-form-grid">
          <Field label="Name" wide>
            <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Q1 2027 access review" />
          </Field>
          <Field label="Who">
            <Select className="select" value={f.population} onChange={(v) => setF({ ...f, population: v as typeof f.population })}>
              <option value="privileged">Admins, temporary access and guests</option>
              <option value="external">Guests only</option>
              <option value="all">Everyone active</option>
            </Select>
          </Field>
          <Field label="Due">
            <DateField className="input" min={data.day} value={f.due} onChange={(v) => setF({ ...f, due: v })} />
          </Field>
        </div>
      </Sheet>
    </div>
  );
}

function Kpi({ label, value, icon, tone }: { label: string; value: ReactNode; icon: IconName; tone?: "danger" }) {
  return (
    <div className="sp-kpi" data-tone={tone}>
      <span className="sp-kpi__icon" aria-hidden="true">
        <Icon name={icon} size={15} />
      </span>
      <b className="sp-kpi__n num">{value}</b>
      <span className="sp-kpi__label">{label}</span>
    </div>
  );
}

function ReviewSheet({ review: r, onClose }: { review: AccessReview | null; onClose: () => void }) {
  const { data } = useConsole();
  const act = useAct();
  if (!r) return null;
  const open = r.status !== "Complete";
  return (
    <Sheet
      open
      wide
      onClose={onClose}
      title={r.name}
      sub={`Due ${fmtDate(r.due)} · reviewer ${data.people.find((p) => p.id === r.reviewerId)?.name ?? "—"}`}
      footer={
        open &&
        viewerCan(data.viewer, "security", "manage") && (
          <>
            <span className="cmd-count">Revoked accounts are suspended when you finish.</span>
            <button type="button" className="btn btn--dark" onClick={() => void act({ type: "review.complete", id: r.id })}>
              Finish review
            </button>
          </>
        )
      }
    >
      <div className="cmd-table-wrap">
        <table className="cmd-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Last sign-in</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
            {r.accountIds.map((id) => {
              const a = data.accounts?.find((x) => x.id === id);
              const d = r.decisions[id];
              return (
                <tr key={id}>
                  <td>
                    <b>{a?.name ?? id}</b>
                    <small className="cmd-muted block">{a?.roleNames.join(", ")}</small>
                  </td>
                  <td className="cmd-muted num">{fmtAgo(a?.lastLogin, data.now)}</td>
                  <td>
                    {open && viewerCan(data.viewer, "security", "edit") && id !== data.viewer.id ? (
                      <span className="cmd-inline">
                        <button type="button" className={`btn btn--sm${d === "Keep" ? " btn--dark" : ""}`} aria-pressed={d === "Keep"} onClick={() => void act({ type: "review.decide", id: r.id, accountId: id, decision: "Keep" }, true)}>
                          Keep
                        </button>
                        <button type="button" className={`btn btn--sm${d === "Revoke" ? " btn--danger" : ""}`} aria-pressed={d === "Revoke"} onClick={() => void act({ type: "review.decide", id: r.id, accountId: id, decision: "Revoke" }, true)}>
                          Revoke
                        </button>
                      </span>
                    ) : d ? (
                      <Pill tone={d === "Keep" ? "ok" : "danger"}>{d}</Pill>
                    ) : (
                      <Pill>{id === data.viewer.id ? "Someone else decides" : "Undecided"}</Pill>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Sheet>
  );
}

/* ---------- Privacy ---------- */

const DSR_ICON: Record<SubjectRequest["type"], IconName> = { Access: "eye", Correction: "pen", "Erasure or blocking": "trash", Objection: "ban", Portability: "download" };
const RISKS: PrivacyAssessment["risk"][] = ["High", "Medium", "Low"];

function Privacy({ sec, creating, onDone }: { sec: SecurityPolicy; creating: Creating; onDone: () => void }) {
  const { data } = useConsole();
  const act = useAct();
  const edit = viewerCan(data.viewer, "security", "edit");
  const [p, setP] = useState(sec.privacy);
  const [pia, setPia] = useState<(Partial<PrivacyAssessment> & { name: string }) | null>(null);
  const [dsr, setDsr] = useState({ type: "Access" as SubjectRequest["type"], subject: "", received: data.day });
  useEffect(() => setP(sec.privacy), [sec.privacy]);
  useEffect(() => {
    if (creating === "pia") setPia({ name: "", datasetId: data.catalog.datasets[0]?.id, risk: "Medium", status: "Draft", owner: data.viewer.id, measures: "" });
  }, [creating, data.catalog.datasets, data.viewer.id]);
  const closePia = () => {
    setPia(null);
    if (creating === "pia") onDone();
  };
  const noticeAge = p.noticeUpdated ? daysBetween(p.noticeUpdated, data.day) : null;
  return (
    <div className="sp-bento">
      <Tile id="sp-dpo" className="sp-span-12" title={<Head icon="shield" hint={COMPLIANCE}>Privacy office</Head>}>
        <div className="sp-dpo">
          <div className="sp-dpo__form">
            <div className="sp-fields sp-fields--2">
              <Field label="Contact">
                <input className="input" disabled={!edit} value={p.officer} onChange={(e) => setP({ ...p, officer: e.target.value })} />
              </Field>
              <Field label="Email">
                <input className="input" type="email" disabled={!edit} value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} />
              </Field>
              <Field label="Privacy notice updated">
                <DateField className="input" disabled={!edit} value={p.noticeUpdated} onChange={(v) => setP({ ...p, noticeUpdated: v })} />
              </Field>
              <Field
                label={
                  <>
                    Report breaches within (hours) <Hint text="72 hours supports the National Privacy Commission's notification timeline." />
                  </>
                }
              >
                <NumberField className="input num" min={1} max={72} disabled={!edit} value={p.breachHours} onChange={(v) => setP({ ...p, breachHours: v })} />
              </Field>
            </div>
            <SaveBar dirty={!same(p, sec.privacy)} onReset={() => setP(sec.privacy)} onSave={() => void act({ type: "security.policy", section: "privacy", value: p })} />
          </div>
          <div className="sp-dials">
            <div className="sp-dial">
              <Ring value={p.breachHours / 72} size={92} tone={p.breachHours <= 72 ? "ok" : "danger"} label={`Breaches reported within ${p.breachHours} of 72 hours`}>
                <b className="num">{p.breachHours}h</b>
              </Ring>
              <span>Breach clock</span>
              <small>NPC limit 72 h</small>
            </div>
            <div className="sp-dial">
              <Ring value={noticeAge === null ? 0 : 1 - clamp(noticeAge / 365)} size={92} tone={noticeAge === null || noticeAge > 365 ? "danger" : noticeAge > 300 ? "warn" : "ok"} label="Privacy notice freshness">
                <b className="num">{noticeAge === null ? "—" : `${Math.max(0, noticeAge)}d`}</b>
              </Ring>
              <span>Notice age</span>
              <small>Review yearly</small>
            </div>
          </div>
        </div>
      </Tile>

      <Tile id="sp-dsr" className="sp-span-7" title={<Head icon="inbox" hint="Requests to access, correct, erase, object to or move personal data. Respond within 30 days.">Data subject requests</Head>}>
        {sec.subjectRequests.length ? (
          <ul className="sp-dsrs">
            {sec.subjectRequests.map((r) => {
              const open = isOpenDsr(r);
              const span = Math.max(1, daysBetween(r.received, r.due));
              const used = clamp(daysBetween(r.received, data.day) / span);
              const late = open && r.due < data.day;
              const left = daysBetween(data.day, r.due);
              return (
                <li key={r.id} className="sp-dsr" data-late={late || undefined} data-closed={!open || undefined}>
                  <span className="sp-dsr__icon" aria-hidden="true">
                    <Icon name={DSR_ICON[r.type]} size={15} />
                  </span>
                  <span className="sp-dsr__main">
                    <b>{r.type}</b>
                    <small>{r.subject}</small>
                    {open && (
                      <span className="sp-bar sp-bar--thin" aria-label={late ? `${-left} days late` : `${left} days left`}>
                        <i style={{ width: `${used * 100}%` }} />
                      </span>
                    )}
                  </span>
                  <span className="sp-dsr__due">
                    {open ? <b className={late ? "is-danger num" : "num"}>{late ? `${-left}d late` : `${left}d left`}</b> : <span className="sp-muted">{fmtDate(r.due)}</span>}
                  </span>
                  <span className="sp-dsr__status">
                    {edit && open ? (
                      <Select className="select select--sm" value={r.status} aria-label={`Status of ${r.id}`} onChange={(v) => void act({ type: "dsr.update", id: r.id, status: v as SubjectRequest["status"] })}>
                        <option>Open</option>
                        <option>In progress</option>
                        <option>Fulfilled</option>
                        <option>Declined</option>
                      </Select>
                    ) : (
                      <StatusPill value={r.status} />
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyNote icon="inbox" title="No requests" />
        )}
      </Tile>

      <Tile id="sp-pia" className="sp-span-5" title={<Head icon="clipboard">Impact assessments</Head>}>
        {sec.assessments.length ? (
          <div className="sp-lanes">
            {RISKS.map((risk) => {
              const items = sec.assessments.filter((a) => a.risk === risk);
              return (
                <div key={risk} className="sp-lane" data-risk={risk.toLowerCase()}>
                  <div className="sp-lane__head">
                    <i aria-hidden="true" />
                    <span>{risk} risk</span>
                    <b className="num">{items.length}</b>
                  </div>
                  {items.map((a) => (
                    <button key={a.id} type="button" className="sp-pia" disabled={!edit} onClick={() => setPia(a)}>
                      <span className="sp-pia__text">
                        <b>{a.name}</b>
                        <small>{data.catalog.datasets.find((d) => d.id === a.datasetId)?.name}</small>
                      </span>
                      <StatusPill value={a.status} />
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyNote icon="clipboard" title="No assessments yet" />
        )}
      </Tile>

      <Sheet
        open={creating === "dsr"}
        onClose={onDone}
        title="Log a data subject request"
        footer={
          <>
            <button type="button" className="btn" onClick={onDone}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--dark"
              disabled={dsr.subject.trim().length < 4}
              onClick={async () => {
                const r = await act({ type: "dsr.create", request: dsr });
                if (r.ok) {
                  setDsr({ ...dsr, subject: "" });
                  onDone();
                }
              }}
            >
              Log request
            </button>
          </>
        }
      >
        <div className="cmd-form-grid">
          <Field label="Type">
            <Select className="select" value={dsr.type} onChange={(v) => setDsr({ ...dsr, type: v as SubjectRequest["type"] })}>
              {(["Access", "Correction", "Erasure or blocking", "Objection", "Portability"] as const).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </Select>
          </Field>
          <Field label="Received">
            <DateField className="input" max={data.day} value={dsr.received} onChange={(v) => setDsr({ ...dsr, received: v })} />
          </Field>
          <Field label="Who (describe, don't name)" wide>
            <input className="input" value={dsr.subject} onChange={(e) => setDsr({ ...dsr, subject: e.target.value })} placeholder="Alumnus, College of Nursing" />
          </Field>
        </div>
      </Sheet>

      <Sheet
        open={!!pia}
        onClose={closePia}
        title={pia?.id ? pia.name || "Assessment" : "New impact assessment"}
        footer={
          <>
            <button type="button" className="btn" onClick={closePia}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--dark"
              disabled={!pia?.name.trim()}
              onClick={async () => {
                if (!pia) return;
                const r = await act({ type: "pia.save", pia: { id: pia.id, name: pia.name, datasetId: pia.datasetId!, risk: pia.risk!, status: pia.status!, owner: pia.owner ?? data.viewer.id, measures: pia.measures ?? "" } });
                if (r.ok) closePia();
              }}
            >
              Save
            </button>
          </>
        }
      >
        {pia && (
          <div className="cmd-form-grid">
            <Field label="Name" wide>
              <input className="input" value={pia.name} onChange={(e) => setPia({ ...pia, name: e.target.value })} />
            </Field>
            <Field label="Dataset">
              <Select className="select" value={pia.datasetId} onChange={(v) => setPia({ ...pia, datasetId: v })}>
                {data.catalog.datasets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Risk">
              <Select className="select" value={pia.risk} onChange={(v) => setPia({ ...pia, risk: v as PrivacyAssessment["risk"] })}>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </Select>
            </Field>
            <Field label="Status">
              <Select className="select" value={pia.status} onChange={(v) => setPia({ ...pia, status: v as PrivacyAssessment["status"] })}>
                <option>Draft</option>
                <option>In review</option>
                <option>Approved</option>
              </Select>
            </Field>
            <Field label="Safeguards" wide>
              <textarea className="textarea" value={pia.measures} onChange={(e) => setPia({ ...pia, measures: e.target.value })} placeholder="How the data is minimized, protected, shared and disposed of" />
            </Field>
          </div>
        )}
      </Sheet>
    </div>
  );
}

/* ---------- Alerts and incidents ---------- */

const ESCALATE = ["University Data Protection Officer", "National Privacy Commission (through the DPO)", "University IT Services", "Office of the Secretary General"];
const STAGES: Incident["status"][] = ["Reported", "Investigating", "Escalated", "Contained", "Closed"];
const ALERT_ICON: Record<SecurityPolicy["alerts"][number]["kind"], IconName> = {
  "Suspicious sign-in": "user",
  "Repeated failed sign-ins": "ban",
  "Unusual export": "download",
  "Privilege change": "key",
  "Policy change": "settings",
};

function AlertsAndIncidents({ sec, reporting, onDone }: { sec: SecurityPolicy; reporting: boolean; onDone: () => void }) {
  const { data } = useConsole();
  const act = useAct();
  const edit = viewerCan(data.viewer, "security", "edit");
  const [view, setView] = useState<"Alerts" | "Incidents">("Alerts");
  const alerts = sec.alerts;
  const sev = (s: string) => sec.alerts.filter((a) => a.status === "Open" && a.severity === s).length;
  return (
    <div className="sp-bento">
      <Tile
        id="sp-monitoring"
        title={<Head icon={view === "Alerts" ? "bell" : "flag"}>{view}</Head>}
        aside={<Tabs label="Alerts and incidents" idBase="sp-monitoring-view" value={view} onChange={setView} tabs={["Alerts", "Incidents"]} />}
      >
        <TabPanel idBase="sp-monitoring-view" index={view === "Alerts" ? 0 : 1} className="sp-panel">
          {view === "Alerts" && <>
            <div className="sp-sev" aria-label="Open alerts by severity">
              {(["High", "Medium", "Low"] as const).map((s) => (
                <span key={s} className="sp-sev__item" data-sev={s.toLowerCase()}>
                  <i aria-hidden="true" />
                  {s}
                  <b className="num">{sev(s)}</b>
                </span>
              ))}
            </div>
            {alerts.length ? (
              <div className="cmd-table-wrap sp-monitoring-wrap">
                <table className="cmd-table sp-monitoring-table" aria-label="Security alerts">
                  <thead>
                    <tr>
                      <th scope="col">Alert</th>
                      <th scope="col">Time</th>
                      <th scope="col">Priority Level</th>
                      <th scope="col">Status</th>
                      <th scope="col">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((a) => (
                      <tr key={a.id} className="sp-monitoring-row" data-sev={a.severity.toLowerCase()} data-done={a.status === "Resolved" || undefined}>
                        <td>
                          <div className="sp-monitoring-title">
                            <span className="sp-alert__icon" aria-hidden="true">
                              <Icon name={ALERT_ICON[a.kind] ?? "alert"} size={15} />
                            </span>
                            <div className="sp-alert__main">
                              <b>{a.kind}</b>
                              <span className="sp-alert__detail">{a.detail}</span>
                              {a.accountId && <small className="sp-muted">{data.people.find((p) => p.id === a.accountId)?.name ?? a.accountId}</small>}
                            </div>
                          </div>
                        </td>
                        <td className="sp-monitoring-time"><time dateTime={a.at}>{fmtAgo(a.at, data.now)}</time></td>
                        <td><StatusPill value={a.severity} /></td>
                        <td><StatusPill value={a.status} /></td>
                        <td>
                          <div className="sp-alert__acts">
                            {(!edit || a.status === "Resolved") && <span className="sp-muted" aria-label="No actions available">—</span>}
                            {edit && a.status === "Open" && (
                              <button type="button" className="btn btn--sm" onClick={() => void act({ type: "alert.update", id: a.id, status: "Acknowledged" })}>
                                Acknowledge
                              </button>
                            )}
                            {edit && a.status !== "Resolved" && (
                              <button type="button" className="btn btn--sm btn--dark" onClick={() => void act({ type: "alert.update", id: a.id, status: "Resolved" })}>
                                Resolve
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="sp-empty sp-empty--calm">
                <span className="sp-empty__art" aria-hidden="true">
                  <Icon name="shield-check" size={26} />
                </span>
                <b>All quiet</b>
              </div>
            )}
          </>}
          <Incidents sec={sec} visible={view === "Incidents"} reporting={reporting} onDone={onDone} />
        </TabPanel>
      </Tile>
    </div>
  );
}

function Incidents({ sec, visible, reporting, onDone }: { sec: SecurityPolicy; visible: boolean; reporting: boolean; onDone: () => void }) {
  const { data } = useConsole();
  const act = useAct();
  const [sel, setSel] = useState<string | null>(null);
  const [f, setF] = useState({ title: "", severity: "Medium" as Incident["severity"], personalData: false, note: "" });
  const inc = sec.incidents.find((i) => i.id === sel) ?? null;
  const [u, setU] = useState({ status: "Investigating" as Incident["status"], note: "", escalatedTo: "" });
  useEffect(() => {
    if (inc) setU({ status: inc.status, note: "", escalatedTo: inc.escalatedTo ?? "" });
  }, [inc]);
  const edit = viewerCan(data.viewer, "security", "edit");
  return (
    <>
      {visible && <>
        {sec.incidents.length ? (
          <div className="cmd-table-wrap sp-monitoring-wrap">
            <table className="cmd-table sp-monitoring-table" aria-label="Security incidents">
              <thead>
                <tr>
                  <th scope="col">Incident</th>
                  <th scope="col">Time</th>
                  <th scope="col">Priority Level</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sec.incidents.map((i) => {
                  const at = STAGES.indexOf(i.status);
                  return (
                    <tr key={i.id} className="sp-monitoring-row" data-sev={i.severity.toLowerCase()} data-done={i.status === "Closed" || undefined}>
                      <td>
                        <div className="sp-alert__main">
                          <b>{i.title}</b>
                          {i.personalData && <span className="sp-tag"><Icon name="user" size={11} /> Personal data</span>}
                          {i.escalatedTo && <small className="sp-muted">→ {i.escalatedTo}</small>}
                        </div>
                      </td>
                      <td className="sp-monitoring-time"><time dateTime={i.reported}>{fmtAgo(i.reported, data.now)}</time></td>
                      <td><StatusPill value={i.severity} /></td>
                      <td>
                        <div className="sp-alert__main">
                          <StatusPill value={i.status} />
                          <span className="sp-stages" aria-label={`Stage: ${i.status}`}>
                            {STAGES.map((s, n) => (
                              <i key={s} data-done={n <= at || undefined} data-now={n === at || undefined} title={s} />
                            ))}
                          </span>
                        </div>
                      </td>
                      <td><button type="button" className="btn btn--sm" aria-label={`View incident: ${i.title}`} onClick={() => setSel(i.id)}>View</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="sp-empty sp-empty--calm">
            <span className="sp-empty__art" aria-hidden="true">
              <Icon name="flag" size={24} />
            </span>
            <b>No incidents</b>
          </div>
        )}
      </>}

      <Sheet
        open={reporting}
        onClose={onDone}
        title="Report an incident"
        sub={`Personal-data incidents are escalated within ${sec.privacy.breachHours} hours.`}
        footer={
          <>
            <button type="button" className="btn" onClick={onDone}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--dark"
              disabled={f.title.trim().length < 6}
              onClick={async () => {
                const r = await act({ type: "incident.report", ...f });
                if (r.ok) {
                  setF({ title: "", severity: "Medium", personalData: false, note: "" });
                  onDone();
                }
              }}
            >
              Report
            </button>
          </>
        }
      >
        <div className="cmd-form-grid">
          <Field label="What happened" wide>
            <input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Evidence file shared through a public link" />
          </Field>
          <Field label="Severity">
            <Select className="select" value={f.severity} onChange={(v) => setF({ ...f, severity: v as Incident["severity"] })}>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Critical</option>
            </Select>
          </Field>
          <label className="choice cmd-field--check">
            <input type="checkbox" checked={f.personalData} onChange={(e) => setF({ ...f, personalData: e.target.checked })} />
            Personal data may be involved
          </label>
          <Field label="Details" wide>
            <textarea className="textarea" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="When it was found, what is affected, what was done" />
          </Field>
        </div>
      </Sheet>

      <Sheet
        open={!!inc}
        onClose={() => setSel(null)}
        title={inc?.title ?? ""}
        sub={inc ? `${inc.severity}${inc.personalData ? " · personal data" : ""} · reported by ${data.people.find((p) => p.id === inc.reporterId)?.name ?? inc.reporterId}` : undefined}
        footer={
          inc &&
          edit && (
            <button
              type="button"
              className="btn btn--dark"
              disabled={u.note.trim().length < 3}
              onClick={async () => {
                const r = await act({ type: "incident.update", id: inc.id, status: u.status, note: u.note, escalatedTo: u.escalatedTo || undefined });
                if (r.ok) setU({ ...u, note: "" });
              }}
            >
              Add update
            </button>
          )
        }
      >
        {inc && (
          <>
            <ol className="sp-tracker" aria-label="Stages">
              {STAGES.map((s, n) => {
                const at = STAGES.indexOf(inc.status);
                return (
                  <li key={s} data-done={n <= at || undefined} data-now={n === at || undefined}>
                    <i aria-hidden="true">{n < at ? <Icon name="check" size={11} /> : n + 1}</i>
                    <span>{s}</span>
                  </li>
                );
              })}
            </ol>
            <ul className="cmd-timeline">
              {inc.timeline.map((t, i) => (
                <li key={i}>
                  <b>{t.note}</b>
                  <span>
                    {fmtDate(t.at, true)} · {data.people.find((p) => p.id === t.by)?.name ?? t.by}
                  </span>
                </li>
              ))}
            </ul>
            {edit && (
              <div className="cmd-form-grid">
                <Field label="Status">
                  <Select className="select" value={u.status} onChange={(v) => setU({ ...u, status: v as Incident["status"] })}>
                    {STAGES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Escalate to">
                  <Select className="select" value={u.escalatedTo} onChange={(v) => setU({ ...u, escalatedTo: v, status: v ? "Escalated" : u.status })}>
                    <option value="">Not escalated</option>
                    {ESCALATE.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Update" wide>
                  <textarea className="textarea" value={u.note} onChange={(e) => setU({ ...u, note: e.target.value })} />
                </Field>
              </div>
            )}
          </>
        )}
      </Sheet>
    </>
  );
}

/* ---------- Data protection: exports, sharing, keys and encryption ---------- */

type Rule = "Allowed" | "Approval" | "Blocked";
const LEVELS: { c: Classification; sub: string }[] = [
  { c: "Public", sub: "Published results" },
  { c: "Internal", sub: "Hub staff and units" },
  { c: "Confidential", sub: "Named people only" },
  { c: "Restricted", sub: "Never leaves the Hub" },
];

function Protection({ sec }: { sec: SecurityPolicy }) {
  const { data, confirm } = useConsole();
  const act = useAct();
  const edit = viewerCan(data.viewer, "security", "edit");
  const rotate = viewerCan(data.viewer, "security", "manage");
  const [x, setX] = useState(sec.exports);
  const [s, setS] = useState(sec.sharing);
  useEffect(() => {
    setX(sec.exports);
    setS(sec.sharing);
  }, [sec]);
  const ruleOf = (c: Classification): Rule => (x.blocked.includes(c) ? "Blocked" : x.approvalFor.includes(c) ? "Approval" : "Allowed");
  const setRule = (c: Classification, v: Rule) =>
    setX({
      ...x,
      blocked: v === "Blocked" ? [...new Set([...x.blocked, c])] : x.blocked.filter((b) => b !== c),
      approvalFor: v === "Approval" ? [...new Set([...x.approvalFor, c])] : x.approvalFor.filter((b) => b !== c),
    });
  return (
    <div className="sp-bento">
      <Tile id="sp-exports" className="sp-span-7" title={<Head icon="download">Exports by classification</Head>}>
        <ol className="sp-ladder">
          {LEVELS.map(({ c, sub }, i) => {
            const rule = ruleOf(c);
            const locked = !edit || c === "Restricted";
            return (
              <li key={c} className="sp-rung" data-rule={rule.toLowerCase()}>
                <span className="sp-rung__level" aria-hidden="true">
                  {LEVELS.map((_, n) => (
                    <i key={n} data-on={n <= i || undefined} />
                  ))}
                </span>
                <span className="sp-rung__text">
                  <b>{c}</b>
                  <small>{sub}</small>
                </span>
                {locked ? (
                  <span className="sp-rule" data-rule={rule.toLowerCase()}>
                    <Icon name={rule === "Blocked" ? "ban" : rule === "Approval" ? "check-circle" : "check"} size={12} /> {rule === "Approval" ? "Approval required" : rule}
                  </span>
                ) : (
                  <Segmented label={`Export rule for ${c}`} value={rule} onChange={(v) => setRule(c, v)} options={[{ value: "Allowed", label: "Allowed" }, { value: "Approval", label: "Approval" }, { value: "Blocked", label: "Blocked" }]} className="sp-seg" />
                )}
              </li>
            );
          })}
        </ol>
        <div className="sp-rows">
          <div className="sp-row">
            <span className="sp-row__icon" aria-hidden="true">
              <Icon name="tag" size={15} />
            </span>
            <span className="sp-row__text">
              <b>Watermark exports</b>
              <small>Adds the person and date to anything above Public</small>
            </span>
            <Switch checked={x.watermark} disabled={!edit} label="Watermark exports" onChange={(v) => setX({ ...x, watermark: v })} />
          </div>
        </div>
        <SaveBar dirty={!same(x, sec.exports)} onReset={() => setX(sec.exports)} onSave={() => void act({ type: "security.policy", section: "exports", value: x })} />
      </Tile>

      <Tile id="sp-sharing" className="sp-span-5" title={<Head icon="link">Sharing</Head>}>
        <div className="sp-rows">
          <div className="sp-row">
            <span className="sp-row__icon" data-warn={s.externalLinks || undefined} aria-hidden="true">
              <Icon name="globe" size={15} />
            </span>
            <span className="sp-row__text">
              <b>Public links to evidence files</b>
              <small>{s.externalLinks ? "Anyone with the link can open" : "Signed-in people only"}</small>
            </span>
            <Switch checked={s.externalLinks} disabled={!edit} label="Public links to evidence files" onChange={(v) => setS({ ...s, externalLinks: v })} />
          </div>
          <div className="sp-row">
            <span className="sp-row__icon" aria-hidden="true">
              <Icon name="download" size={15} />
            </span>
            <span className="sp-row__text">
              <b>Guests can download</b>
              <small>{s.guestDownloads ? "Guests keep copies" : "Guests view in the Hub"}</small>
            </span>
            <Switch checked={s.guestDownloads} disabled={!edit} label="Guests can download" onChange={(v) => setS({ ...s, guestDownloads: v })} />
          </div>
        </div>
        <SaveBar dirty={!same(s, sec.sharing)} onReset={() => setS(sec.sharing)} onSave={() => void act({ type: "security.policy", section: "sharing", value: s })} />
      </Tile>

      <Tile id="sp-keys" className="sp-span-7" title={<Head icon="key" hint={rotate ? undefined : "Only the Director and Ranking Specialists can rotate keys."}>Encryption keys</Head>}>
        {sec.keys.length ? (
          <ul className="sp-keys">
            {sec.keys.map((k) => {
              const next = nextRotation(k);
              const age = daysBetween(k.rotated, data.day);
              const late = next <= data.day;
              const left = daysBetween(data.day, next);
              return (
                <li key={k.id} className="sp-key" data-late={late || undefined}>
                  <Ring value={age / Math.max(1, k.rotationDays)} size={48} tone={late ? "danger" : left <= 14 ? "warn" : "ok"} label={`${age} of ${k.rotationDays} days since rotation`}>
                    <Icon name="key" size={14} />
                  </Ring>
                  <span className="sp-key__main">
                    <b>{k.name}</b>
                    <small>{k.algorithm}</small>
                    <small className="sp-muted">Rotated {fmtDate(k.rotated)}</small>
                  </span>
                  <span className="sp-key__next">
                    {late ? <Pill tone="danger">Overdue</Pill> : <b className="num">{left}d</b>}
                    <small className="sp-muted">{late ? fmtDate(next) : "to rotation"}</small>
                  </span>
                  {rotate && (
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={async () => {
                        const ok = await confirm({ title: `Rotate the ${k.name.toLowerCase()}?`, body: "A new key replaces the old one.", confirm: "Rotate" });
                        if (ok !== null) await act({ type: "key.rotate", id: k.id });
                      }}
                    >
                      <Icon name="refresh" size={14} /> Rotate
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyNote icon="key" title="No keys" />
        )}
      </Tile>

      <Tile id="sp-enc" className="sp-span-5" title={<Head icon="layers">Encryption</Head>}>
        <EncryptionStack sec={sec} />
      </Tile>
    </div>
  );
}
