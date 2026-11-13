import type { CalendarItem } from "@/lib/calendar";
import { serverViews } from "@/lib/governance/server/views";
import { CycleCalendar, DeadlineCard, cycle } from "./Deadlines";

/** The next collection date and the selected cycle's full submission calendar. */
export async function NextDeadline({ id, calendar, href }: { id: string; calendar: CalendarItem[]; href: (slug: string) => string }) {
  const { families } = await serverViews();
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
export async function NextDeadlineTile({ id, calendar, href }: { id: string; calendar: CalendarItem[]; href: (slug: string) => string }) {
  const { families } = await serverViews();
  const { items, next } = cycle(calendar, families);
  const nextItem = next && calendar.find((item) => item.key === next.key);

  return (
    <div className="dashboard-deadlines ov-next-cell">
      <DeadlineCard id={id} next={next} after={next ? items.slice(items.indexOf(next) + 1, items.indexOf(next) + 3) : []} href={nextItem ? href(nextItem.slugs[0]) : undefined} />
    </div>
  );
}

/** The cycle's submission calendar on its own, across a full dashboard row. */
export async function SubmissionCalendar({ id, calendar }: { id: string; calendar: CalendarItem[] }) {
  const { families } = await serverViews();
  const { months, next, todayAt } = cycle(calendar, families);

  return (
    <div className="dashboard-deadlines">
      <CycleCalendar id={id} months={months} next={next} todayAt={todayAt} />
    </div>
  );
}
