import Link from "next/link";
import type { CSSProperties } from "react";
import {
  ACTIONS as ALL_ACTIONS,
  AS_OF_LABEL,
  DIMENSION_SCORES,
  SUMMARY,
  daysUntil,
  formatDate,
} from "@/lib/data";
import { hub } from "@/lib/governance/server/hub";
import { getViewer } from "@/lib/governance/server/session";
import { viewerCan } from "@/lib/governance/viewer";
import { Icon } from "@/components/ui/Icon";
import { InfoTooltip } from "@/components/ui/interactive";
import { Due, RankingName, Status } from "@/components/ui/primitives";
import { ReadinessChart } from "@/components/dashboard/ReadinessChart";
import { RankingsOverview } from "@/components/rankings/Overview";

export const metadata = {
  title: {
    absolute: "Executive dashboard · Office workspace · UST Rankings Hub",
  },
};

const pct = (a: number, b: number) => Math.round((a / b) * 100);

const VIEWS = [
  { key: "submissions", label: "Submissions overview", href: "/admin" },
  { key: "rankings", label: "Rankings overview", href: "/admin?view=rankings" },
] as const;

export default async function ExecutiveDashboard({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const h = hub();
  const viewer = await getViewer();
  // System Configuration sets which view opens first; the switch below still changes it.
  const asked = (await searchParams).view;
  const view = asked === "rankings" || asked === "submissions" ? asked : h.dashboard.officeView;
  const RANKINGS = h.rankings;
  const EVIDENCE = h.evidence.filter((e) => viewerCan(viewer, "evidence", "view", { unitId: e.unitSlug }));
  const ACTIONS = ALL_ACTIONS.filter((a) => h.isActive(a.ranking));
  const next = [...RANKINGS].sort((a, b) => a.deadline.localeCompare(b.deadline))[0] ?? h.rankings[0];
  const soon = (iso: string) => daysUntil(iso) <= h.dashboard.deadlineWarningDays;
  const days = daysUntil(next.deadline);
  const up = RANKINGS.filter((r) => r.direction === "up").length;
  const down = RANKINGS.filter((r) => r.direction === "down").length;
  const pending = RANKINGS.reduce((n, r) => n + r.pending, 0);
  const count = (s: string) => EVIDENCE.filter((e) => e.status === s).length;
  const validated = count("Validated");
  const evidenceStats = [
    { k: "Validated", v: validated },
    { k: "For review", v: count("For review") },
    { k: "Revisions", v: count("Needs revision") },
    { k: "Not sent", v: count("Not yet submitted") },
  ];
  const dimNow = Math.round(
    DIMENSION_SCORES.reduce((n, d) => n + d.current, 0) /
      DIMENSION_SCORES.length,
  );
  const dimTarget = Math.round(
    DIMENSION_SCORES.reduce((n, d) => n + d.target, 0) /
      DIMENSION_SCORES.length,
  );
  const unitPct = pct(SUMMARY.unitsEngaged, SUMMARY.unitsTotal);
  const actions = [...ACTIONS]
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(0, 6);

  const kpis = [
    {
      label: "Rankings tracked",
      value: RANKINGS.length,
      chip: `${up} up${down ? ` · ${down} down` : ""}`,
      tone: "up",
      href: "/admin?view=rankings",
    },
    {
      label: "Items pending",
      value: pending,
      chip: `${SUMMARY.missing} missing`,
      tone: "flat",
      href: "/admin/contribute",
    },
    {
      label: "Open actions",
      value: SUMMARY.actionsRequired,
      chip: `${SUMMARY.revisions} revisions`,
      tone: "down",
      href: "#actions",
    },
    {
      label: "Next deadline",
      value: `${days}d`,
      chip: next.short,
      tone: soon(next.deadline) ? "down" : "flat",
      href: `/admin/rankings/${next.slug}`,
    },
  ];

  return (
    <div className="ov">
      <header className="ov__head">
        <div className="ov__title-row">
          <h1 className="ov__title">Dashboard</h1>
          <InfoTooltip>As of {AS_OF_LABEL}</InfoTooltip>
        </div>
      </header>

      <div className="ov__toolbar">
        <nav className="ov-switch" aria-label="Dashboard view">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={v.href}
              className="ov-switch__opt"
              aria-current={view === v.key ? "page" : undefined}
              scroll={false}
            >
              {v.label}
            </Link>
          ))}
        </nav>
        <div className="ov__actions">
          <Link href="/admin/reports" className="btn btn--sm">
            <Icon name="download" size={16} /> Report
          </Link>
          {viewer?.workspaces.includes("portal") && viewerCan(viewer, "evidence", "submit") && h.feature("submit-evidence") && (
            <Link href="/portal/submit" className="btn btn--primary btn--sm">
              <Icon name="upload" size={16} /> Submit evidence
            </Link>
          )}
        </div>
      </div>

      {view === "rankings" ? (
        <div className="ov-rankings">
          <RankingsOverview mode="internal" embedded rankings={RANKINGS} evidence={EVIDENCE} />
        </div>
      ) : (
        <>
          {/* KPI strip */}
          <div className="ov-kpis">
            {kpis.map((k) => (
              <Link key={k.label} href={k.href} className="card ov-kpi">
                <span className="ov-kpi__label">{k.label}</span>
                <span className="ov-kpi__row">
                  <span className="ov-kpi__value num">{k.value}</span>
                  <span className={`ov-chip ov-chip--${k.tone}`}>
                    {k.tone !== "flat" && (
                      <Icon
                        name={k.tone === "up" ? "arrow-up-right" : "arrow-down"}
                        size={12}
                      />
                    )}
                    {k.chip}
                  </span>
                </span>
              </Link>
            ))}
          </div>

          {/* Analytics bento */}
          <div className="ov-bento">
            <section
              className="card ov-tile ov-ready"
              aria-labelledby="ov-ready"
            >
              <div className="ov-tile__head">
                <h2 id="ov-ready" className="ov-tile__title">
                  Submission readiness
                </h2>
                <Link
                  href="/admin?view=rankings"
                  className="ov-iconbtn"
                  aria-label="Compare rankings"
                >
                  <Icon name="filter" size={18} />
                </Link>
              </div>
              <p className="ov-big num">
                {SUMMARY.readiness}
                <small>%</small>
              </p>
              <p className="ov-sub">Evidence in place, all frameworks</p>
              <div
                className="ov-progress"
                role="progressbar"
                aria-valuenow={SUMMARY.readiness}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Overall readiness"
              >
                <span
                  className="ov-progress__fill"
                  style={{ width: `${SUMMARY.readiness}%` }}
                />
                <span
                  className="ov-progress__goal"
                  style={{ left: "80%" }}
                  title="80% goal"
                />
              </div>
              <p className="ov-sub ov-sub--row">
                <span>Goal 80%</span>
                <span className="num">{80 - SUMMARY.readiness} pts to go</span>
              </p>
              <dl className="ov-stats">
                {evidenceStats.map((s) => (
                  <div key={s.k}>
                    <dt>{s.k}</dt>
                    <dd className="num">{s.v}</dd>
                  </div>
                ))}
              </dl>
              <div className="ov-tile__btns">
                <Link href="/admin/contribute" className="btn btn--sm">
                  Review queue
                </Link>
                <Link href="/admin/reports" className="btn btn--dark btn--sm">
                  Build report
                </Link>
              </div>
            </section>

            <div className="ov-stack">
              <section className="card ov-tile" aria-labelledby="ov-dim">
                <h2 id="ov-dim" className="ov-tile__title">
                  Dimension index
                </h2>
                <div className="ov-dim">
                  <p className="ov-mid num">
                    {dimNow}
                    <small>/100</small>
                  </p>
                  <div
                    className="ov-dim__bars"
                    role="img"
                    aria-label={DIMENSION_SCORES.map(
                      (d) =>
                        `${d.dimension} ${d.current} of target ${d.target}`,
                    ).join("; ")}
                  >
                    {DIMENSION_SCORES.map((d) => (
                      <span
                        key={d.dimension}
                        title={`${d.dimension}: ${d.current} / ${d.target}`}
                        style={
                          {
                            ["--h" as string]: `${d.current}%`,
                            ["--t" as string]: `${d.target}%`,
                          } as CSSProperties
                        }
                      />
                    ))}
                  </div>
                </div>
                <p className="ov-note">
                  <Icon name="info" size={14} /> Target {dimTarget} ·{" "}
                  {DIMENSION_SCORES.length} dimensions
                </p>
              </section>

              <section className="card ov-tile" aria-labelledby="ov-units">
                <div className="ov-tile__head">
                  <h2 id="ov-units" className="ov-tile__title">
                    Units engaged
                  </h2>
                  <Link href="/admin/units" className="btn btn--sm">
                    Details
                  </Link>
                </div>
                <p className="ov-line">
                  <b className="num">{SUMMARY.unitsEngaged}</b> of{" "}
                  {SUMMARY.unitsTotal} contributing
                  <span className="ov-chip ov-chip--up">{unitPct}%</span>
                </p>
                <div
                  className="ov-ticks"
                  role="img"
                  aria-label={`${SUMMARY.unitsEngaged} of ${SUMMARY.unitsTotal} units engaged`}
                >
                  {Array.from({ length: SUMMARY.unitsTotal }, (_, i) => (
                    <i
                      key={i}
                      className={i < SUMMARY.unitsEngaged ? "is-on" : undefined}
                    />
                  ))}
                </div>
              </section>
            </div>

            <section className="card ov-tile" aria-labelledby="ov-rk">
              <div className="ov-tile__head">
                <h2 id="ov-rk" className="ov-tile__title">
                  By ranking
                </h2>
                <Link href="/admin?view=rankings" className="btn btn--sm">
                  See all
                </Link>
              </div>
              <div className="ov-rkhead">
                <RankingName slug={next.slug} />
                <span className="ov-sub num">
                  due {formatDate(next.deadline)} · {next.readiness}%
                </span>
              </div>
              <ReadinessChart />
              <p className="ov-note">
                <Icon name="info" size={14} /> Line marks the 80% readiness goal
              </p>
            </section>
          </div>

          {/* Action table */}
          <section
            className="card ov-table"
            id="actions"
            aria-labelledby="ov-act"
          >
            <div className="ov-tile__head ov-table__head">
              <h2 id="ov-act" className="ov-tile__title">
                Open actions <span className="count">{ACTIONS.length}</span>
              </h2>
              <Link href="/admin/contribute" className="btn btn--sm">
                View all <Icon name="arrow" size={14} />
              </Link>
            </div>
            <div className="table-wrap">
              <table className="table table--hover table--stack">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Ranking</th>
                    <th>Due</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((a) => (
                    <tr key={a.id}>
                      <td className="table__primary">
                        {a.action}
                        <span className="table__sub">{a.unit}</span>
                      </td>
                      <td data-label="Ranking">
                        <Link
                          href={`/admin/rankings/${a.ranking}`}
                          className="rowlink"
                        >
                          <RankingName slug={a.ranking} />
                        </Link>
                      </td>
                      <td data-label="Due" className="num">
                        <Due iso={a.due} withDays />
                      </td>
                      <td data-label="Status">
                        <Status status={a.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
