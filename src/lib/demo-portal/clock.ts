/** Dates in the demo are relative to today, so deadlines and "submitted 3 days ago" always read naturally. */
export function demoDay(offset: number, from = new Date()): string {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate() + offset));
  return d.toISOString().slice(0, 10);
}

export const demoTime = (offset: number, hour = 9) => `${demoDay(offset)}T${String(hour).padStart(2, "0")}:00:00.000Z`;
