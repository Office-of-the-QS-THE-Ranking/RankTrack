"use client";

import type { CSSProperties } from "react";
import type { CalendarItem } from "@/lib/calendar";
import { daysUntil } from "@/lib/data";
import type { Family } from "@/lib/reference";
import { Tile } from "@/components/dashboard/Tile";
import { Icon } from "@/components/ui/Icon";
import { cx } from "@/components/ui/primitives";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const monthDays = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

export type Deadline = {
  key: string;
  /** The rankings it closes for, and what closes. */
  lead: string;
  rest: string;
  color: string | null;
  year: number;
  month: number;
  day: number;
  iso: string;
  days: number;
};

export type CycleMonth = { key: string; year: number; month: number; items: Deadline[] };

/** The calendar (lib/calendar.ts) on a rail of months, with today's place on it and the next date to come. */
export function cycle(calendar: CalendarItem[], families: Record<string, Family>, today = new Date().toISOString().slice(0, 10)) {
  const items: Deadline[] = calendar.map((it) => ({
    key: it.key,
    lead: it.lead,
    rest: it.label,
    color: families[it.family]?.color ?? null,
    year: Number(it.due.slice(0, 4)),
    month: Number(it.due.slice(5, 7)) - 1,
    day: Number(it.due.slice(8, 10)),
    iso: it.due,
    days: daysUntil(it.due, today),
  }));
  const thisYear = Number(today.slice(0, 4));

  // Every month from the first deadline to the last, so the rail keeps its proportions.
  const months: CycleMonth[] = [];
  const ord = (d: { year: number; month: number }) => d.year * 12 + d.month;
  for (let k = items.length ? ord(items[0]) : 0; items.length && k <= ord(items[items.length - 1]); k++) {
    const year = Math.floor(k / 12);
    const month = k % 12;
    months.push({ key: `${year}-${month}`, year, month, items: items.filter((d) => ord(d) === k) });
  }
  const tm = Number(today.slice(5, 7)) - 1;
  const at = months.findIndex((m) => m.year === thisYear && m.month === tm);
  const todayAt = at < 0 ? null : (at + (Number(today.slice(8, 10)) - 0.5) / monthDays(thisYear, tm)) / months.length;
  return { months, items, next: items.find((d) => d.days >= 0) ?? null, todayAt };
}

const span = (months: CycleMonth[]) =>
  months.length ? `${MONTHS[months[0].month]} ${months[0].year} – ${MONTHS[months[months.length - 1].month]} ${months[months.length - 1].year}` : "";

/** A tear-off calendar page for the day the next deadline falls on. */
function CalendarPage({ month, day }: { month?: string; day?: number | null }) {
  return (
    <span className="kc-page" aria-hidden="true">
      <span className="kc-page__rings">
        <i />
        <i />
      </span>
      <span className="kc-page__month">{month ?? "—"}</span>
      <span className="kc-page__day">{day ?? "–"}</span>
    </span>
  );
}

/** The deadline closest ahead: its date as a calendar page and the days left, on onyx. */
export function NextDeadline({ next, after }: { next: Deadline | null; after: Deadline[] }) {
  return (
    <Tile id="kc-next-h" className="kc-next">
      <h2 id="kc-next-h" className="kc-next__eyebrow">
        Next deadline
      </h2>
      <div className="kc-next__body">
        <CalendarPage month={next ? MONTHS[next.month] : undefined} day={next?.day} />
        {next ? (
          <p className="kc-next__count">
            {next.days === 0 ? (
              <b>Today</b>
            ) : (
              <>
                <b>{next.days}</b>
                <span>{next.days === 1 ? "day left" : "days left"}</span>
              </>
            )}
          </p>
        ) : (
          <p className="kc-next__count kc-next__count--none">
            <span>None ahead</span>
          </p>
        )}
      </div>
      {next && (
        <p className="kc-next__what">
          {next.color && <i style={{ background: next.color }} aria-hidden="true" />}
          <span>
            {next.lead && <b>{next.lead} </b>}
            {next.rest}
          </span>
        </p>
      )}
      {after.length > 0 && (
        <ul className="kc-next__then" aria-label="After that">
          {after.map((d) => (
            <li key={d.key}>
              <time dateTime={d.iso}>
                {d.day} {MONTHS[d.month]}
              </time>
              {d.color && <i style={{ background: d.color }} aria-hidden="true" />}
              <span>{d.lead || d.rest}</span>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}

/** The cycle's months on one rail, each deadline a dot in its family's colour, with today marked. */
export function CycleCalendar({ months, next, todayAt }: { months: CycleMonth[]; next: Deadline | null; todayAt: number | null }) {
  return (
    <Tile id="calendar" title="Submission calendar" className="kc-cal-tile" aside={<span className="kc-aside">{span(months)}</span>}>
      {months.length ? (
        <div className="kc-cal-scroll">
          <div className="kc-cal" style={{ ["--n" as string]: months.length } as CSSProperties}>
            {todayAt !== null && (
              <>
                <span className="kc-cal__done" style={{ width: `${todayAt * 100}%` }} aria-hidden="true" />
                <span className="kc-cal__today" style={{ left: `${todayAt * 100}%` }}>
                  <span>Today</span>
                </span>
              </>
            )}
            <ol className="kc-cal__months">
              {months.map((m, i) => (
                <li key={m.key} className="kc-cal__month" style={{ ["--i" as string]: i } as CSSProperties}>
                  <span className="kc-cal__rail" aria-hidden="true">
                    {m.items.map((d) => (
                      <i
                        key={d.key}
                        className={cx("kc-cal__dot", d.days < 0 && "is-past", d === next && "is-next")}
                        style={{ left: `${(d.day - 0.5) / monthDays(d.year, d.month) * 100}%`, ["--c" as string]: d.color ?? "var(--text-3)" } as CSSProperties}
                      />
                    ))}
                  </span>
                  <span className="kc-cal__name">
                    {MONTHS[m.month]}
                    {(i === 0 || m.month === 0) && <small>{m.year}</small>}
                  </span>
                  {m.items.length > 0 && (
                    <ul className="kc-cal__items">
                      {m.items.map((d) => (
                        <li key={d.key} className={cx("kc-due", d.days < 0 && "is-past", d === next && "is-next")} style={{ ["--c" as string]: d.color ?? "var(--text-3)" } as CSSProperties}>
                          <time dateTime={d.iso} className="kc-due__date">
                            {d.days < 0 && <Icon name="check" size={11} strokeWidth={2.8} />}
                            {d.day} {MONTHS[d.month]}
                          </time>
                          {d.lead && <b className="kc-due__lead">{d.lead}</b>}
                          <span className="kc-due__rest">{d.rest}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : (
        <p className="kc-quiet">No deadlines set.</p>
      )}
    </Tile>
  );
}
