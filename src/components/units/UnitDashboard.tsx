import Link from "next/link";
import type { ReactNode } from "react";
import { ACTIONS, RECOGNITION, STAGES, daysUntil, formatDate, type EvidenceStatus } from "@/lib/data";
import type { PortalContext } from "@/lib/governance/server/portal";
import { flag } from "@/lib/governance/viewer";
import { achievementsOf, metalOf, rankingsOf, seasonOf, seasonsOf } from "@/lib/merit";
import { Icon } from "@/components/ui/Icon";
import { Due, Empty, Notice, RankingName, SdgList, Status, cx } from "@/components/ui/primitives";
import { PipelineFlow } from "@/components/contributions/PipelineFlow";
import { QueueArt } from "@/components/contributions/QueueArt";
import { StatusMix, TickMeter } from "@/components/dashboard/Gauges";
import { NextDeadline } from "@/components/dashboard/NextDeadline";
import { Standings, standingOf } from "@/components/dashboard/Standings";
import { Tile } from "@/components/dashboard/Tile";
import { Welcome, count, nextClose } from "@/components/dashboard/Welcome";
import { HonourDial, Medal } from "@/components/units/profile/Medal";
import { UnitMark } from "./UnitMark";

/** Rows on the Next up tile. */
const SHOWN = 5;

/**
 * The coordinator's dashboard (proposal §12), on the Office dashboard's tiles: the welcome, the unit's place
 * among its category, readiness, the next deadline, what is due, where its submissions stand, its honours,
 * and the rankings and goals its validated evidence counts in.
 */
export function UnitDashboard({ ctx }: { ctx: PortalContext }) {
  const { viewer, hub: h, unit, evidence, requirements, can, scopeNote } = ctx;
  const rankings = h.rankings;
  const tracked = new Set(rankings.map((r) => r.short));
  const accepted = evidence
    .filter((e) => e.status === "Validated")
    .map((e) => ({ ...e, mappedTo: e.mappedTo.filter((m) => tracked.has(m.split(" · ")[0]) || !rankings.length) }));
  const revisions = evidence.filter((e) => e.status === "Needs revision");
  const reqs = requirements.filter((r) => h.isActive(r.ranking));
  // Readiness counts the unit's requirements, else its own submissions.
  const items: { status: EvidenceStatus }[] = reqs.length ? reqs : evidence.filter((e) => e.status !== "Not applicable");
  const ready = items.filter((x) => x.status === "Validated").length;
  const pct = items.length ? Math.round((ready / items.length) * 100) : 0;
  const open = reqs.filter((r) => r.status !== "Validated").sort((a, b) => a.due.localeCompare(b.due));
  const actions = reqs.length ? [] : ACTIONS.filter((a) => a.unit === unit.name && h.isActive(a.ranking) && a.status !== "Validated");
  const owned = rankings.flatMap((r) => r.indicators.filter((i) => i.owner === unit.name).map((i) => ({ r, i })));
  const served = rankings.filter((r) => reqs.some((q) => q.ranking === r.slug) || owned.some((o) => o.r.slug === r.slug));
  const deadlines = served.length ? served : rankings;
  const standing = standingOf(unit, h.activeUnits.filter((u) => u.kind === unit.kind));
  const { line: due } = nextClose(deadlines);

  const reviewing = evidence.filter((e) => e.status === "For review").length;
  const work = revisions.length
    ? `${count(revisions.length, "item", "items")} back for revision.`
    : open.length
      ? `${count(open.length, "requirement", "requirements")} open.`
      : reviewing
        ? `${count(reviewing, "submission", "submissions")} with reviewers.`
        : "You’re all caught up.";
  const { mine, rows, category } = standing;

  // Next up: revisions first, then requirements (or, without any, the unit's actions) soonest first. Each is
  // answered with evidence, so it opens Submit evidence.
  const answer = can.submit ? "/portal/submit" : "/portal/history";
  const todo: { key: string; what: string; status: EvidenceStatus | "Not started"; meta: ReactNode; due?: string; href: string }[] = [
    ...revisions.map((e) => ({
      key: e.id,
      what: e.title,
      status: e.status,
      meta: <span>{e.comments[0] ? `${e.comments[0].by} · ${formatDate(e.comments[0].date)}` : rankingsOf(e)[0]}</span>,
      href: "/portal/feedback",
    })),
    ...open.map((r) => ({ key: r.id, what: r.title, status: r.status, meta: <RankingName slug={r.ranking} />, due: r.due, href: answer })),
    ...actions.map((a) => ({ key: a.id, what: a.action, status: a.status, meta: <RankingName slug={a.ranking} />, due: a.due, href: answer })),
  ];

  // Submissions by the furthest stage each has reached.
  const sent = evidence.filter((e) => e.status !== "Not yet submitted" && e.status !== "Not applicable");
  const steps = STAGES.map((step, k) => ({ step: k === 3 ? "Included" : step, count: sent.filter((e) => e.stage >= k).length }));

  const recognition = RECOGNITION.filter((r) => r.unit === unit.name);
  const season = seasonOf(h.currentCycle, evidence);
  const badges = achievementsOf(seasonsOf(h.cycles.map((c) => c.id), evidence), recognition.length, h.currentCycle);
  const earned = badges.filter((b) => b.tier > 0).sort((a, b) => b.tier - a.tier);
  const ahead = badges.filter((b) => b.goal && b.tier === 0).sort((a, b) => b.count / b.goal! - a.count / a.goal!);
  const medals = [...earned, ...ahead].slice(0, 5);

  const reach = rankings
    .map((r) => ({ r, n: accepted.filter((e) => e.mappedTo.some((m) => m.split(" · ")[0] === r.short)).length }))
    .filter((x) => x.n)
    .sort((a, b) => b.n - a.n);
  const most = Math.max(1, ...reach.map((x) => x.n));
  const sdgs = [...new Set(accepted.flatMap((e) => e.sdgs))].sort((a, b) => a - b);
  const reused = flag(viewer, "reuse-insights") ? accepted.filter((e) => rankingsOf(e).length > 1).length : 0;
  const impact = rankings.find((r) => r.slug === "the-impact" && r.current);
  const helped = impact ? accepted.filter((e) => e.mappedTo.some((m) => m.startsWith(impact.short))).length : 0;

  return (
    <div className="ov ud">
      <header className="ov__head">
        <div className="ov__title-row">
          <h1 className="ov__title">Dashboard</h1>
          <span className="ud-unit">
            <UnitMark emblem={unit.emblem ?? null} code={unit.code} className="ud-unit__mark" />
            {unit.name}
          </span>
        </div>
        <div className="ov__actions">
          {h.feature("assistance") && (
            <Link href="/portal/assistance" className="btn btn--sm">
              <Icon name="help" size={16} /> Assistance
            </Link>
          )}
          {can.submit && unit.status === "Active" && (
            <Link href="/portal/submit" className="btn btn--sm btn--primary">
              <Icon name="upload" size={16} /> Submit evidence
            </Link>
          )}
        </div>
      </header>

      {scopeNote && (
        <Notice tone="plain" icon="lock">
          {scopeNote}
        </Notice>
      )}
      {unit.status === "Archived" && (
        <Notice tone="warn" icon="archive">
          {unit.mergedIntoName ? `Merged into ${unit.mergedIntoName}. ` : "Archived. "}
          {unit.archivedReason}
        </Notice>
      )}

      <Welcome
        name={viewer.name}
        line={due ? `${work} ${due}` : work}
        action={
          revisions.length && can.respond
            ? { href: "/portal/feedback", label: "Respond to feedback" }
            : open.length && can.submit
              ? { href: "/portal/submit", label: "Submit evidence" }
              : undefined
        }
        badge={
          mine && (
            <a href="#ud-standings" className="ov-welcome__badge">
              <Icon name="recognition" size={15} />
              {mine.rank ? (
                <>
                  <b>#{mine.rank}</b> of {rows.length} {category}
                </>
              ) : (
                <>Not on the {category} board yet</>
              )}
            </a>
          )
        }
      />

      <div className="ov-bento ud-bento">
        <Standings id="ud-standings" standing={standing} />

        <Tile id="ud-ready" title="Submission-ready" className="ud-ready">
          <div className="ov-figrow">
            <p className="ov-value ud-big">
              {pct}
              <small>%</small>
            </p>
            <p className="ov-stat">
              <span>To go</span>
              <b>{items.length - ready}</b>
            </p>
          </div>
          <TickMeter value={pct} label="Submission-ready" />
          <StatusMix items={items} />
        </Tile>

        <NextDeadline id="ud-next" rankings={deadlines} href={() => "/portal/workspace/knowledge"} />

        <Tile
          id="ud-todo"
          title={
            <>
              Next up {todo.length > 0 && <span className="count">{todo.length}</span>}
            </>
          }
          className="ov-acts ud-todo"
        >
          {todo.length ? (
            <ul className="ov-acts__list">
              {todo.slice(0, SHOWN).map((t) => (
                <li key={t.key}>
                  <Link href={t.href} className="ov-act">
                    <span className="ov-act__what">{t.what}</span>
                    <Status status={t.status} />
                    <span className="ov-act__meta">{t.meta}</span>
                    {t.due && (
                      <span className={cx("ov-act__due", daysUntil(t.due) <= h.dashboard.deadlineWarningDays && "is-soon")}>
                        <Due iso={t.due} />
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="ud-clear">
              <QueueArt kind="clear" />
              <p>All caught up</p>
            </div>
          )}
        </Tile>

        <Tile id="ud-honours" className="ud-hon">
          <header className="ov-tile__head">
            <h2 id="ud-honours" className="ov-tile__title">
              Honours
            </h2>
            <span className="ud-aside">{season.cycle}</span>
          </header>
          <div className="ud-hon__main">
            <HonourDial
              numeral={season.honour.numeral}
              progress={season.progress}
              size={112}
              label={`${season.honour.name}${season.next ? `, ${Math.round(season.progress * 100)}% of the way to ${season.next.name}` : ""}`}
            />
            <div className="ud-hon__text">
              <p className="ud-hon__name">{season.honour.name}</p>
              <p className="ud-hon__merit">
                <b>{season.merit.toLocaleString("en-PH")}</b> merit
              </p>
              {season.next && (
                <p className="ud-hon__next">
                  <b>{(season.next.at - season.merit).toLocaleString("en-PH")}</b> to {season.next.name}
                </p>
              )}
            </div>
          </div>
          <ul className="ud-hon__medals" aria-label="Achievements">
            {recognition.map((r) => (
              <li key={r.award} data-tip={r.award}>
                <Medal icon="recognition" metal="gold" size={46} />
                <span className="sr-only">{r.award}</span>
              </li>
            ))}
            {medals.slice(0, Math.max(0, 5 - recognition.length)).map((b) => (
              <li key={b.id} data-tip={b.tier ? b.name : `${b.name} · ${b.count} of ${b.goal}`}>
                {b.tier ? (
                  <Medal icon={b.icon} metal={metalOf(b, b.tier)} tier={b.goals.length > 1 ? b.tier : undefined} size={46} />
                ) : (
                  <Medal icon={b.icon} progress={b.count / b.goal!} size={46} />
                )}
                <span className="sr-only">{b.tier ? `${b.name}, earned` : `${b.name}, ${b.count} of ${b.goal}`}</span>
              </li>
            ))}
          </ul>
        </Tile>

        <Tile id="ud-flow" title="Your submissions" className="ud-flow" aside={<span className="ud-aside">{count(sent.length, "sent", "sent")}</span>}>
          <PipelineFlow steps={steps} label="Your submissions by stage" />
        </Tile>

        <Tile id="ud-reach" title="Where it counts" className="ud-reach">
          {reach.length ? (
            <ul className="ov-bars">
              {reach.map(({ r, n }) => (
                <li key={r.slug} className="ov-bars__row">
                  <RankingName slug={r.slug} />
                  <span className="ov-bars__track">
                    <span className="ov-bars__fill" style={{ width: `${(n / most) * 100}%` }} />
                  </span>
                  <span className="ov-bars__value">{n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="layers" title="Nothing validated yet" />
          )}
          {(sdgs.length > 0 || reused > 0 || helped > 0 || owned.length > 0) && (
            <dl className="ud-reach__more">
              {sdgs.length > 0 && (
                <div>
                  <dt>SDGs</dt>
                  <dd>
                    <SdgList sdgs={sdgs} />
                  </dd>
                </div>
              )}
              {impact && helped > 0 && (
                <div>
                  <dt>{impact.short}</dt>
                  <dd className="ud-reach__helped">
                    <b>{impact.current}</b>
                    {impact.direction === "up" && <Icon name="arrow-up" size={14} strokeWidth={2.4} />}
                    <span>{count(helped, "item", "items")} from you</span>
                  </dd>
                </div>
              )}
              {reused > 0 && (
                <div>
                  <dt>Reused</dt>
                  <dd>
                    <b>{reused}</b> in 2+ rankings
                  </dd>
                </div>
              )}
              {owned.length > 0 && (
                <div>
                  <dt>You own</dt>
                  <dd className="ud-reach__owned">
                    {owned.map(({ r, i }) => (
                      <span key={r.slug + i.name} className="chip chip--outline" title={`${r.short}: ${i.status}`}>
                        {i.name}
                      </span>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          )}
        </Tile>
      </div>
    </div>
  );
}
