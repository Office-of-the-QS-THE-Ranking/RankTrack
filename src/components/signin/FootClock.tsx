"use client";

import { useEffect, useState } from "react";

const DATE = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });
const TIME = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });

/**
 * The date and a ticking clock in the sign-in sidebar's foot, by the viewer's own clock.
 * They come in after mount, so the server's time never shows; until
 * then each line holds its height.
 */
export function FootClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let timer = 0;
    // tick on the second, so the clock turns over with the viewer's own
    const tick = () => {
      const at = new Date();
      setNow(at);
      timer = window.setTimeout(tick, 1000 - at.getMilliseconds());
    };
    tick();
    return () => window.clearTimeout(timer);
  }, []);

  const stamp = now?.toISOString();
  return (
    <>
      <time dateTime={stamp?.slice(0, 10)}>{now ? DATE.format(now) : " "}</time>
      <time className="signin__clock" dateTime={stamp}>
        {now ? TIME.format(now) : " "}
      </time>
    </>
  );
}
