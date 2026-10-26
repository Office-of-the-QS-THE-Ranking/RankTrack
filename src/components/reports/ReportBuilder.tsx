"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  ACTION_PLAN,
  EVIDENCE_LEVELS,
  SDG_NAMES,
  type EvidenceStatus,
} from "@/lib/data";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Card, Direction, Empty, MeterRow, Notice, PlanStatus, Status, Swatch } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { useCan, useGovern, useHub, useRankings, useViewer } from "@/components/hub/HubProvider";
import { DateField, Select } from "@/components/ui/pickers";

/* Each report draws on governed datasets; their classification decides whether it can be exported. */
const REPORTS: { name: string; icon: IconName; note: string; datasets: string[] }[] = [
  { name: "Executive Reports", icon: "dashboard", note: "Positions, readiness and top risks for University leadership.", datasets: ["DS-RESULTS", "DS-INDICATORS"] },
  { name: "Management Review", icon: "flag", note: "Quarterly review of action-plan progress and decisions needed.", datasets: ["DS-INDICATORS"] },
  { name: "Ranking Performance", icon: "rankings", note: "Current and previous results with direction for every framework.", datasets: ["DS-RESULTS", "DS-INDICATORS"] },
  { name: "Evidence Readiness", icon: "evidence", note: "Evidence by status and quality, filtered as you choose.", datasets: ["DS-EVIDENCE"] },
  { name: "Unit Participation", icon: "units", note: "Assignments, completion and revisions by unit.", datasets: ["DS-EVIDENCE"] },
  { name: "Risk and Opportunity", icon: "alert", note: "Critical gaps and main opportunities by ranking.", datasets: ["DS-INDICATORS"] },
  { name: "Action Plan Progress", icon: "trend-up", note: "Improvement actions with KPI, owner, timeline and status.", datasets: ["DS-INDICATORS"] },
  { name: "Custom Report Builder", icon: "filter", note: "Combine every filter into one evidence report.", datasets: ["DS-EVIDENCE"] },
];

type Row = (string | number)[];

function toCsv(name: string, head: string[], rows: Row[], watermark?: string | null) {
  const esc = (c: string | number) => `"${String(c).replace(/"/g, '""')}"`;
  const csv = [...(watermark ? [[watermark]] : []), head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name.toLowerCase().replace(/\s+/g, "-")}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ReportBuilder() {
  const hub = useHub();
  const viewer = useViewer();
  const can = useCan();
  const RANKINGS = useRankings();
  const { run, pending } = useGovern();
  const EVIDENCE = hub?.evidence ?? [];
  const UNITS = hub?.units ?? [];
  const CYCLES = (hub?.cycles ?? []).filter((c) => c.status !== "Archived").map((c) => c.id);
  const [type, setType] = useState(REPORTS[3].name);
  const [ranking, setRanking] = useState("All rankings");
  const [cycle, setCycle] = useState(hub?.currentCycle ?? CYCLES[0] ?? "");
  const [blocked, setBlocked] = useState<{ datasetId: string; name: string } | null>(null);
  const [ask, setAsk] = useState({ until: "", why: "" });
  const [publish, setPublish] = useState<string | null>(null);
  const [unit, setUnit] = useState("All units");
  const [indicator, setIndicator] = useState("Any indicator");
  const [sdg, setSdg] = useState("Any SDG");
  const [status, setStatus] = useState("Any status");
  const [quality, setQuality] = useState("Any quality");
  const [plan, setPlan] = useState("Any plan status");

  const indicators = useMemo(() => {
    const list = RANKINGS.filter((r) => ranking === "All rankings" || r.short === ranking).flatMap((r) => r.indicators.map((i) => i.name));
    return ["Any indicator", ...new Set(list)];
  }, [ranking]);

  const evidence = EVIDENCE.filter(
    (e) =>
      (ranking === "All rankings" || e.mappedTo.some((m) => m.startsWith(ranking + " ·"))) &&
      (unit === "All units" || e.unit === unit) &&
      (indicator === "Any indicator" || e.mappedTo.some((m) => m.toLowerCase().includes(indicator.split(":")[0].toLowerCase()))) &&
      (status === "Any status" || e.status === (status as EvidenceStatus)) &&
      (sdg === "Any SDG" || e.sdgs.includes(Number(sdg.split(" ")[1]))) &&
      (quality === "Any quality" || EVIDENCE_LEVELS[e.level - 1] === quality),
  );
  const rankings = RANKINGS.filter((r) => ranking === "All rankings" || r.short === ranking);
  const units = UNITS.filter((u) => unit === "All units" || u.name === unit);
  const plans = ACTION_PLAN.filter((a) => plan === "Any plan status" || a.status === plan);

  const reset = () => {
    setRanking("All rankings");
    setUnit("All units");
    setIndicator("Any indicator");
    setSdg("Any SDG");
    setStatus("Any status");
    setQuality("Any quality");
    setPlan("Any plan status");
  };

  const filter = (label: string, value: string, set: (v: string) => void, opts: string[]) => (
    <label className="field">
      <span className="field__label">{label}</span>
      <Select className="select select--sm" value={value} onChange={set}>
        {opts.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </Select>
    </label>
  );

  // Preview table per report type
  let head: string[] = [];
  let rows: Row[] = [];
  let body: ReactNode = null;
  switch (type) {
    case "Executive Reports":
    case "Ranking Performance":
      head = ["Ranking", "Current", "Previous", "Direction", "Readiness", "Pending"];
      rows = rankings.map((r) => [r.short, r.current, r.previous, r.direction, `${r.readiness}%`, r.pending]);
      body = (
        <table className="table table--stack">
          <thead>
            <tr>
              <th>Ranking</th>
              <th>Current</th>
              <th>Previous</th>
              <th>Direction</th>
              <th className="table__meter">Readiness</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((r) => (
              <tr key={r.slug}>
                <td>
                  <span className="row nowrap table__primary" style={{ ["--gap" as string]: "8px" } as CSSProperties}>
                    <Swatch family={r.family} />
                    {r.short}
                  </span>
                </td>
                <td data-label="Current" className="num">
                  <b>{r.current}</b>
                </td>
                <td data-label="Previous" className="num text-2">
                  {r.previous}
                </td>
                <td data-label="Direction">
                  <Direction dir={r.direction} />
                </td>
                <td data-label="Readiness">
                  <MeterRow value={r.readiness} label={`${r.short} readiness`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
      break;
    case "Unit Participation":
      head = ["Unit", "Assigned", "Completed", "Validated", "Revisions", "Rankings served"];
      rows = units.map((u) => [u.name, u.assigned, u.completed, u.validated, u.revisions, u.rankingsServed]);
      body = (
        <table className="table table--stack">
          <thead>
            <tr>
              <th>Unit</th>
              <th className="table__meter">Completion</th>
              <th className="r">Validated</th>
              <th className="r">Revisions</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => (
              <tr key={u.slug}>
                <td className="table__primary">{u.name}</td>
                <td data-label="Completion">
                  <MeterRow value={(u.completed / u.assigned) * 100} label={`${u.name} completion`} />
                </td>
                <td data-label="Validated" className="r num">
                  {u.validated}
                </td>
                <td data-label="Revisions" className="r num">
                  {u.revisions}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
      break;
    case "Risk and Opportunity":
      head = ["Ranking", "Critical gaps", "Main opportunities"];
      rows = rankings.map((r) => [r.short, r.gaps.join("; "), r.opportunities.join("; ")]);
      body = (
        <table className="table table--stack">
          <thead>
            <tr>
              <th>Ranking</th>
              <th>Critical gaps</th>
              <th>Main opportunities</th>
            </tr>
          </thead>
          <tbody>
            {rankings.map((r) => (
              <tr key={r.slug}>
                <td className="table__primary nowrap">{r.short}</td>
                <td data-label="Gaps">
                  <ul className="bullets bullets--gap">
                    {r.gaps.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </td>
                <td data-label="Opportunities">
                  <ul className="bullets bullets--opp">
                    {r.opportunities.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
      break;
    case "Management Review":
    case "Action Plan Progress":
      head = ["Action", "KPI", "Owner", "Timeline", "Progress", "Status"];
      rows = plans.map((a) => [a.action, a.kpi, a.owner, a.timeline, `${a.progress}%`, a.status]);
      body = (
        <table className="table table--stack">
          <thead>
            <tr>
              <th>Improvement action</th>
              <th>Owner</th>
              <th className="table__meter">Progress</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((a) => (
              <tr key={a.action}>
                <td>
                  <span className="table__primary">{a.action}</span>
                  <span className="table__sub">{a.kpi}</span>
                </td>
                <td data-label="Owner" className="small text-2">
                  {a.owner}
                </td>
                <td data-label="Progress">
                  <MeterRow value={a.progress} tone="gold" label={`${a.action} progress`} />
                </td>
                <td data-label="Status">
                  <PlanStatus status={a.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
      break;
    default:
      head = ["Evidence", "ID", "Unit", "Period", "Quality", "Rankings", "Status"];
      rows = evidence.map((e) => [e.title, e.id, e.unit, e.period, EVIDENCE_LEVELS[e.level - 1], e.mappedTo.length, e.status]);
      body = (
        <table className="table table--stack">
          <thead>
            <tr>
              <th>Evidence</th>
              <th>Unit</th>
              <th>Quality</th>
              <th className="r">Used in</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {evidence.map((e) => (
              <tr key={e.id}>
                <td>
                  <span className="table__primary">{e.title}</span>
                  <span className="table__sub num">
                    {e.id} · {e.period}
                  </span>
                </td>
                <td data-label="Unit" className="small text-2">
                  {e.unit}
                </td>
                <td data-label="Quality" className="small">
                  {EVIDENCE_LEVELS[e.level - 1]}
                </td>
                <td data-label="Used in" className="r num">
                  {e.mappedTo.length}
                </td>
                <td data-label="Status">
                  <Status status={e.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
  }
  const current = REPORTS.find((r) => r.name === type)!;

  return (
    <div className="report-layout">
      <div className="stack" style={{ ["--gap" as string]: "16px" } as CSSProperties}>
        <Card title="Reports" icon="reports" bodyClass="card__body--flush report-menu-body">
          <ul className="report-menu" role="radiogroup" aria-label="Report type">
            {REPORTS.map((r) => (
              <li key={r.name}>
                <button type="button" role="radio" aria-checked={type === r.name} onClick={() => setType(r.name)}>
                  <Icon name={r.icon} size={17} />
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card
          title="Filters"
          icon="filter"
          tone="tint"
          actions={
            <button type="button" className="btn btn--ghost btn--sm" onClick={reset}>
              Reset
            </button>
          }
        >
          <div className="stack" style={{ ["--gap" as string]: "12px" } as CSSProperties}>
            {filter("Ranking", ranking, (v) => {
              setRanking(v);
              setIndicator("Any indicator");
            }, ["All rankings", ...RANKINGS.map((r) => r.short)])}
            {filter("Academic year", cycle, setCycle, CYCLES)}
            {filter("Unit", unit, setUnit, ["All units", ...UNITS.map((u) => u.name)])}
            {filter("Indicator", indicator, setIndicator, indicators)}
            {filter("SDG", sdg, setSdg, ["Any SDG", ...Object.keys(SDG_NAMES).map((n) => `SDG ${n}`)])}
            {filter("Submission status", status, setStatus, ["Any status", "Validated", "For review", "Needs revision", "Not yet submitted"])}
            {filter("Evidence quality", quality, setQuality, ["Any quality", ...EVIDENCE_LEVELS])}
            {filter("Action-plan status", plan, setPlan, ["Any plan status", "On track", "At risk", "Not started", "Complete"])}
          </div>
        </Card>
      </div>

      <Card
        title={current.name}
        sub={`${current.note} Cycle ${cycle}.`}
        icon={current.icon}
        bodyClass="card__body--flush"
        actions={
          <div className="btns-row">
            <button
              type="button"
              className="btn btn--sm"
              disabled={!rows.length || pending || !can("reports", "export")}
              title={can("reports", "export") ? undefined : "Your role cannot export reports"}
              onClick={async () => {
                const r = await run({ type: "report.export", report: current.name, cycle, rows: rows.length, datasets: current.datasets });
                if (!r.ok) {
                  if (r.needsApproval) setBlocked(r.needsApproval);
                  else toast(r.message, "error");
                  return;
                }
                setBlocked(null);
                const mark = (r.data as { watermark?: string | null } | undefined)?.watermark;
                toCsv(`${current.name} ${cycle}`, head, rows, mark);
                toast(r.message);
              }}
            >
              <Icon name="download" size={16} /> CSV
            </button>
            <button type="button" className="btn btn--dark btn--sm" onClick={() => window.print()}>
              <Icon name="reports" size={16} /> Print or PDF
            </button>
            {can("reports", "create") && (
              <button type="button" className="btn btn--sm" onClick={() => setPublish("")}>
                <Icon name="send" size={16} /> Request publication
              </button>
            )}
          </div>
        }
      >
        {blocked && (
          <div className="report-gate">
            <Notice tone="warn" icon="lock">
              <b>{blocked.name}</b> needs an approved data access request before it leaves the Hub. Ask for temporary export access; a University
              Administrator decides it, and the request and any export are kept in the audit log.
            </Notice>
            <form
              className="report-gate__form"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await run({
                  type: "request.create",
                  workflowId: "data-access",
                  payload: { kind: "data-access", accountId: viewer?.id ?? "", datasetId: blocked.datasetId, access: "Export", until: ask.until },
                  justification: ask.why,
                });
                toast(r.message, r.ok ? "ok" : "error");
                if (r.ok) {
                  setBlocked(null);
                  setAsk({ until: "", why: "" });
                }
              }}
            >
              <label className="field">
                <span className="field__label">Export access until</span>
                <DateField className="input input--sm" value={ask.until} onChange={(v) => setAsk({ ...ask, until: v })} required />
              </label>
              <label className="field">
                <span className="field__label">Who the report is for</span>
                <input className="input input--sm" value={ask.why} onChange={(e) => setAsk({ ...ask, why: e.target.value })} placeholder="Management review on 4 November" required />
              </label>
              <button type="submit" className="btn btn--dark btn--sm" disabled={pending}>
                Request export approval
              </button>
            </form>
          </div>
        )}
        {publish !== null && (
          <form
            className="report-gate report-gate__form"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await run({ type: "report.publish", report: current.name, cycle, justification: publish });
              toast(r.message, r.ok ? "ok" : "error");
              if (r.ok) setPublish(null);
            }}
          >
            <label className="field" style={{ flex: 1 }}>
              <span className="field__label">Publish {current.name} outside the Office: who is it for?</span>
              <input className="input input--sm" value={publish} onChange={(e) => setPublish(e.target.value)} placeholder="The Rector's council and the public Knowledge Center" required />
            </label>
            <button type="button" className="btn btn--sm" onClick={() => setPublish(null)}>
              Cancel
            </button>
            <button type="submit" className="btn btn--dark btn--sm" disabled={pending}>
              Send for approval
            </button>
          </form>
        )}
        <p className="report-scope">
          {[ranking, unit, indicator, sdg, status, quality, plan].filter((v) => !v.startsWith("Any") && !v.startsWith("All")).join(" · ") ||
            "All rankings and units"}
          <span className="muted"> · {rows.length} rows</span>
        </p>
        <div className="table-wrap">{rows.length ? body : <Empty icon="filter" title="Nothing matches these filters">Reset one filter to widen the report.</Empty>}</div>
      </Card>
      {!!hub?.publishedReports.length && (
        <Card title="Released outside the Office" sub="Reports that passed the publication workflow" icon="send">
          <ul className="list">
            {hub.publishedReports.map((r) => (
              <li key={r.id}>
                <span className="list__main">{r.title}</span>
                <span className="list__aside small muted num">{new Date(r.at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
