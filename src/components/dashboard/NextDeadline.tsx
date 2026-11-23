import type { CalendarItem } from "@/lib/calendar";
import type { Family } from "@/lib/reference";
import { CycleCalendar, DeadlineCard, cycle } from "./Deadlines";

/** The next collection date and the selected cycle's full submission calendar. */
export function NextDeadline({ id, calendar, families, href }: { id: string; calendar: CalendarItem[]; families: Record<string, Family>; href: (slug: string) => string }) {
  const { months, items, next, todayAt } = cycle(calendar, families);
  const nextItem = next && calendar.find((item) => item.key === next.key);

  return (
    <div className="kb-bento dashboard-deadlines">
      <DeadlineCard id={id} next={next} after={next ? items.slice(items.indexOf(next) + 1, items.indexOf(next) + 3) : []} href={nextItem ? href(nextItem.slugs[0]) : undefined} />
      <CycleCalendar id={`${id}-calendar`} months={months} next={next} todayAt={todayAt} />
    </div>
  );
}

/** The next-deadline card on its own, for a dashboard that sets it in a row of other tiles. */
export function NextDeadlineTile({ id, calendar, families, href }: { id: string; calendar: CalendarItem[]; families: Record<string, Family>; href: (slug: string) => string }) {
  const { items, next } = cycle(calendar, families);
  const nextItem = next && calendar.find((item) => item.key === next.key);

  return (
    <div className="dashboard-deadlines ov-next-cell">
      <DeadlineCard id={id} next={next} after={next ? items.slice(items.indexOf(next) + 1, items.indexOf(next) + 3) : []} href={nextItem ? href(nextItem.slugs[0]) : undefined} />
    </div>
  );
}

/** The cycle's submission calendar on its own, across a full dashboard row. */
export function SubmissionCalendar({ id, calendar, families }: { id: string; calendar: CalendarItem[]; families: Record<string, Family> }) {
  const { months, next, todayAt } = cycle(calendar, families);

  return (
    <div className="dashboard-deadlines">
      <CycleCalendar id={id} months={months} next={next} todayAt={todayAt} />
    </div>
  );
}
