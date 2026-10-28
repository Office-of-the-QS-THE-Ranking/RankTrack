"use client";

/*
 * The responder footer's right side: the day and time in Manila, kept current, and the Hub's status. The time is
 * written after the page loads (the server's clock and the visitor's would disagree).
 */
import { useEffect, useState } from "react";

const DAY = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", day: "numeric", month: "long", year: "numeric" });
const TIME = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });

export function FootClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const tick = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(tick);
  }, []);
  return (
    <div className="fr-foot__now">
      <time dateTime={now?.toISOString()}>{now ? `${DAY.format(now)} · ${TIME.format(now)} PHT` : " "}</time>
      <span className="fr-foot__status">
        <i aria-hidden="true" />
        All Operational
      </span>
    </div>
  );
}
