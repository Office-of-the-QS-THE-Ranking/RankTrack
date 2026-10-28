"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { EVIDENCE as ALL_EVIDENCE, type EvidenceItem, type Ranking } from "@/lib/data";
import { GlowingEffect } from "@/components/ui/GlowingEffect";
import { Icon } from "@/components/ui/Icon";
import { Card, Direction, MeterRow, PageHeader, Status, Swatch } from "@/components/ui/primitives";
import { DimensionMatrix } from "./DimensionMatrix";
import { useViews } from "@/components/reference/ReferenceProvider";
import { useHub } from "@/components/hub/HubProvider";
import { calendarMonths } from "@/lib/calendar";

/** Rankings landing page (proposal §3): how the eight rankings relate to UST's institutional goals. */
/** `embedded` drops the page header when the overview sits inside the executive dashboard. */
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

export function RankingsOverview({
  mode,
  embedded,
  rankings: given,
  evidence = ALL_EVIDENCE,
}: {
  mode: "internal" | "public";
  embedded?: boolean;
  /** The rankings System Configuration tracks (internal) or shows (public). */
  rankings?: Ranking[];
  evidence?: EvidenceItem[];
}) {
  const { calendar: defaultCalendar, dictionary, families, groups, rankings } = useViews();
  const hub = useHub();
  // The governed calendar: each ranking's deadline and the dates the Office keeps for it.
  const calendar = hub ? calendarMonths(hub.calendar) : defaultCalendar;
  const internal = mode === "internal";
  const RANKINGS = given ?? rankings;
  const EVIDENCE = evidence;
  const rankingsInGroup = (label: string) => (groups.find((g) => g.label === label)?.slugs ?? []).flatMap((s) => RANKINGS.filter((r) => r.slug === s));
  const base = internal ? "/admin/rankings" : "/rankings";
  const knowledge = internal ? "/admin/workspace/knowledge" : "/knowledge";
  const mapped = EVIDENCE.filter((e) => e.status !== "Not applicable" && e.mappedTo.filter((m) => RANKINGS.some((r) => m.startsWith(r.short + " ·"))).length > 1);
  const cols = rankings.filter((r) => RANKINGS.some((x) => x.slug === r.slug)).map((r) => r.short);

  return (
    <>
      {!embedded && (
        <PageHeader
          title={`How the ${WORDS[RANKINGS.length] ?? RANKINGS.length} rankings relate to UST`}
          lede="What each framework measures, where UST stands, and which evidence serves several rankings at once."
        />
      )}

      <Card title="Current UST positions" sub={internal ? undefined : "Published results, latest edition"} icon="rankings" bodyClass="card__body--flush" glow={embedded}>
        <div className="table-wrap">
          <table className="table table--hover table--stack">
            <thead>
              <tr>
                <th>Ranking</th>
                <th>Current</th>
                <th>Previous</th>
                {internal && <th>Target</th>}
                <th>Direction</th>
                {internal && <th className="table__meter">Readiness</th>}
                <th>Strategic message</th>
              </tr>
            </thead>
            <tbody>
              {RANKINGS.map((r) => (
                <tr key={r.slug}>
                  <td>
                    <Link href={`${base}/${r.slug}`} className="rowlink row nowrap" style={{ ["--gap" as string]: "8px" } as CSSProperties}>
                      <Swatch family={r.family} />
                      {r.short}
                    </Link>
                  </td>
                  <td data-label="Current" className="num">
                    <b>{r.current}</b>
                  </td>
                  <td data-label="Previous" className="num text-2">
                    {r.previous}
                  </td>
                  {internal && (
                    <td data-label="Target" className="num text-2">
                      {r.target}
                    </td>
                  )}
                  <td data-label="Direction">
                    <Direction dir={r.direction} />
                  </td>
                  {internal && (
                    <td data-label="Readiness">
                      <MeterRow value={r.readiness} label={`${r.short} readiness`} />
                    </td>
                  )}
                  <td data-label="Message" className="small text-2">
                    {r.message}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <section aria-label="Rankings portfolio map" className="portfolio">
        {groups.filter((g) => rankingsInGroup(g.label).length).map((g) => (
          <div key={g.label} className="card portfolio__group">
            {embedded && <GlowingEffect />}
            <h2 className="portfolio__title">
              <Swatch family={rankingsInGroup(g.label)[0].family} bar />
              {g.label}
            </h2>
            <ul>
              {rankingsInGroup(g.label).map((r) => (
                <li key={r.slug}>
                  <Link href={`${base}/${r.slug}`} className="portfolio__item" aria-label={`${r.name}: ${r.current}`}>
                    <span className="portfolio__name">{r.short}</span>
                    <span className="portfolio__now">{r.current}</span>
                    <Icon name="chevron" size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <DimensionMatrix base={base} slugs={RANKINGS.map((r) => r.slug)} glow={embedded} />

      <div className="grid cols-2 grid--stretch">
        <Card
          title="Common institutional indicators"
          sub="One definition, several rankings"
          icon="target"
          glow={embedded}
          foot={
            <Link href={knowledge} className="link">
              Open the indicator dictionary <Icon name="arrow" size={14} />
            </Link>
          }
        >
          <ul className="list">
            {dictionary.slice(0, 6).map((d) => {
              const names = [...new Set(d.links.map((l) => l.ranking))];
              return (
                <li key={d.term}>
                  <Link href={`${knowledge}?q=${encodeURIComponent(d.term)}`} className="list__main">
                    {d.term}
                  </Link>
                  <span className="list__aside count" style={{ background: "var(--surface-3)", color: "var(--text-2)" }}>
                    {names.length}
                  </span>
                  <span className="list__sub">{names.join(" · ")}</span>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title="Annual submission calendar" sub="When each ranking body collects data" icon="calendar" tone="dark" glow={embedded}>
          <ol className="cal">
            {calendar.map((c) => (
              <li key={c.month}>
                <b>{c.month}</b>
                <span>
                  {c.items.map((i) => (
                    <span key={i}>{i}</span>
                  ))}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      {internal && (
        <Card
          title="Multi-ranking evidence map"
          sub="Validated and in-review evidence that counts in more than one ranking"
          icon="layers"
          bodyClass="card__body--flush"
          glow={embedded}
        >
          <div className="table-wrap">
            <table className="table matrix evmap">
              <thead>
                <tr>
                  <th>Evidence</th>
                  {cols.map((c) => {
                    const r = RANKINGS.find((x) => x.short === c)!;
                    return (
                      <th key={c} className="c">
                        <span className="matrix__col">
                          <Swatch family={r.family} bar />
                          {c}
                        </span>
                      </th>
                    );
                  })}
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {mapped.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/admin/contributions?item=${e.id}`} className="rowlink">
                        {e.title}
                      </Link>
                      <span className="table__sub">{e.unit}</span>
                    </td>
                    {cols.map((c) => {
                      const hit = e.mappedTo.find((m) => m.startsWith(c + " ·"));
                      const r = RANKINGS.find((x) => x.short === c)!;
                      return (
                        <td key={c} className="c">
                          {hit ? (
                            <span className="evmap__dot" style={{ background: families[r.family].band }} title={hit}>
                              <span className="sr-only">{hit}</span>
                            </span>
                          ) : (
                            <span className="sr-only">Not used</span>
                          )}
                        </td>
                      );
                    })}
                    <td>
                      <Status status={e.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
