import { useEffect, useId, useState } from "react";
import { getPostAnalytics } from "@/app/actions/post-views";
import type { PostRow } from "@/lib/governance/hub-types";
import { postPictures } from "@/lib/governance/posts";
import { plainText } from "@/lib/rich-text";
import { Icon } from "@/components/ui/Icon";

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila" });
const NUMBER = new Intl.NumberFormat("en");
const date = (value?: string) => value && Number.isFinite(Date.parse(value)) ? DATE.format(new Date(value)) : "Not recorded";

/** Analytics describe the saved post; editing the composer does not change these figures until saved. */
export function PostAnalytics({ row }: { row: PostRow }) {
  const id = useId();
  const [analytics, setAnalytics] = useState(row.analytics);
  useEffect(() => {
    let active = true;
    setAnalytics(row.analytics);
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const next = await getPostAnalytics(row.slug);
        if (active && next) setAnalytics(next);
      } catch { /* Keep the last successfully loaded counts if the connection drops. */ }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [row.slug, row.analytics]);
  const words = plainText(row.body).trim().match(/\S+/g)?.length ?? 0;
  const pictures = postPictures(row).length;
  const peak = Math.max(1, ...analytics?.daily.map((day) => day.views) ?? []);
  return (
    <aside className="pc-analytics" aria-labelledby={`${id}-heading`}>
      <header className="pc-analytics__head">
        <h3 id={`${id}-heading`}>Analytics</h3>
        <p>Based on the saved post</p>
      </header>

      <section className="pc-analytics__section" aria-labelledby={`${id}-audience`}>
        <h4 id={`${id}-audience`}>Audience</h4>
        <dl className="pc-analytics__metrics pc-analytics__metrics--audience">
          <div><dt><Icon name="eye" size={15} /> Total views</dt><dd>{analytics ? NUMBER.format(analytics.totalViews) : "—"}</dd></div>
          <div><dt>Last 7 days</dt><dd>{analytics ? NUMBER.format(analytics.last7Days) : "—"}</dd></div>
          <div><dt>Last 30 days</dt><dd>{analytics ? NUMBER.format(analytics.last30Days) : "—"}</dd></div>
        </dl>
        {analytics && <figure className="pc-analytics__chart">
          <figcaption>Daily views · last 14 days</figcaption>
          <svg viewBox="0 0 280 96" role="img" aria-label={analytics.daily.map((day) => `${day.date}: ${day.views} views`).join("; ")}>
            <line x1="0" y1="90" x2="280" y2="90" className="pc-analytics__baseline" />
            {analytics.daily.map((day, index) => <rect key={day.date} x={index * 20 + 3} y={90 - day.views / peak * 78} width="14" height={day.views / peak * 78} rx="3"><title>{day.date}: {NUMBER.format(day.views)} views</title></rect>)}
          </svg>
          {analytics.totalViews === 0 && <p className="pc-analytics__note">No views recorded yet.</p>}
        </figure>}
        <p className="pc-analytics__note">{analytics ? `Tracking since ${date(analytics.trackingSince)}. ` : "View data is unavailable. "}Repeat visits in the same tab within 30 minutes count once. Counts refresh every 30 seconds.</p>
      </section>

      <section className="pc-analytics__section" aria-labelledby={`${id}-content`}>
        <h4 id={`${id}-content`}>Content overview</h4>
        <dl className="pc-analytics__metrics">
          <div><dt>Words</dt><dd>{NUMBER.format(words)}</dd></div>
          <div><dt>Reading time</dt><dd>{words ? Math.ceil(words / 200) : 0}<small> min</small></dd></div>
          <div><dt>Photos</dt><dd>{NUMBER.format(pictures)}</dd></div>
          <div><dt>SDGs tagged</dt><dd>{new Set(row.sdgs).size}</dd></div>
        </dl>
      </section>

      <section className="pc-analytics__section" aria-labelledby={`${id}-publication`}>
        <h4 id={`${id}-publication`}>Publication</h4>
        <dl className="pc-analytics__details">
          <div><dt>Status</dt><dd>{row.status}</dd></div>
          <div><dt>First posted</dt><dd>{date(row.postedAt)}</dd></div>
          <div><dt>Last updated</dt><dd>{date(row.updatedAt)}</dd></div>
          <div><dt>Posted by</dt><dd>{row.author.name}</dd></div>
          <div><dt>Unit</dt><dd>{row.author.unit}</dd></div>
        </dl>
      </section>
    </aside>
  );
}
