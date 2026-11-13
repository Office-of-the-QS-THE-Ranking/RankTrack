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

const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const weekday = (iso: string) => WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];

/** The deadline closest ahead, set out like a notice: what closes, the days remaining and the date in full, then what follows. */
export function DeadlineCard({ id, next, after, href }: { id: string; next: Deadline | null; after: Deadline[]; href?: string }) {
  return (
    <Tile glow id={id} className="kb-next" href={href}>
      <h2 id={id} className="kb-next__eyebrow">
        Next deadline
      </h2>
      {next ? (
        <>
          <p className="kb-next__title" style={{ ["--c" as string]: next.color ?? "rgb(255 255 255 / 0.28)" } as CSSProperties}>
            <b>{next.lead || next.rest}</b>
            {next.lead && <span>{next.rest}</span>}
          </p>
          <div className="kb-next__when">
            <b className="kb-next__left">{next.days === 0 ? "Today" : next.days}</b>
            <span className="kb-next__date">
              {next.days > 0 && <span>{next.days === 1 ? "day remaining" : "days remaining"}</span>}
              <time dateTime={next.iso}>
                {next.days > 0 ? "until " : ""}
                {weekday(next.iso)}, {next.day} {MONTHS_LONG[next.month]} {next.year}
              </time>
            </span>
          </div>
        </>
      ) : (
        <p className="kb-next__none">No deadline ahead.</p>
      )}
      {after.length > 0 && (
        <div className="kb-next__later">
          <h3>Upcoming</h3>
          <ul>
            {after.map((d) => (
              <li key={d.key}>
                <span>
                  {d.color && <i style={{ background: d.color }} aria-hidden="true" />}
                  {d.lead || d.rest}
                </span>
                <time dateTime={d.iso}>
                  {d.day} {MONTHS[d.month]} {d.year}
                </time>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tile>
  );
}

/** The cycle's months on one rail, each deadline a dot in its family's colour, with today marked. */
export function CycleCalendar({ id, months, next, todayAt }: { id: string; months: CycleMonth[]; next: Deadline | null; todayAt: number | null }) {
  return (
    <Tile glow id={id} title="Submission calendar" className="kb-cal-tile" aside={<span className="kb-aside">{span(months)}</span>}>
      {months.length ? (
        <div className="kb-cal-scroll">
          <div className="kb-cal" style={{ ["--n" as string]: months.length } as CSSProperties}>
            {todayAt !== null && (
              <>
                <span className="kb-cal__done" style={{ width: `${todayAt * 100}%` }} aria-hidden="true" />
                <span className="kb-cal__today" style={{ left: `${todayAt * 100}%` }}>
                  <span>Today</span>
                </span>
              </>
            )}
            <ol className="kb-cal__months">
              {months.map((m, i) => (
                <li key={m.key} className="kb-cal__month" style={{ ["--i" as string]: i } as CSSProperties}>
                  <span className="kb-cal__rail" aria-hidden="true">
                    {m.items.map((d) => (
                      <i
                        key={d.key}
                        className={cx("kb-cal__dot", d.days < 0 && "is-past", d === next && "is-next")}
                        style={{ left: `${(d.day - 0.5) / monthDays(d.year, d.month) * 100}%`, ["--c" as string]: d.color ?? "var(--text-3)" } as CSSProperties}
                      />
                    ))}
                  </span>
                  <span className="kb-cal__name">
                    {MONTHS[m.month]}
                    {(i === 0 || m.month === 0) && <small>{m.year}</small>}
                  </span>
                  {m.items.length > 0 && (
                    <ul className="kb-cal__items">
                      {m.items.map((d) => (
                        <li key={d.key} className={cx("kb-due", d.days < 0 && "is-past", d === next && "is-next")} style={{ ["--c" as string]: d.color ?? "var(--text-3)" } as CSSProperties}>
                          <time dateTime={d.iso} className="kb-due__date">
                            {d.days < 0 && <Icon name="check" size={11} strokeWidth={2.8} />}
                            {d.day} {MONTHS[d.month]}
                          </time>
                          {d.lead && <b className="kb-due__lead">{d.lead}</b>}
                          <span className="kb-due__rest">{d.rest}</span>
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
        <p className="kb-quiet">No deadlines set.</p>
      )}
    </Tile>
  );
}
