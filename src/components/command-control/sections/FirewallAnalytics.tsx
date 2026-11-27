"use client";

/*
 * Firewall › Analytics: the Hub's own cookieless page analytics (lib/web-analytics), inside the Firewall page. The
 * Analytics tab is the onyx hero (visitors, page views, bounce rate over time) over a bento of pages, referrers,
 * countries, devices, browsers and events, then the latest events; Firewall › Settings carries its collection,
 * retention and privacy controls. useAnalytics polls /api/web-analytics every 15 seconds while the Firewall's Live is
 * on and the tab is visible. Styles: web-analytics.css (wa-*), on top of firewall.css (fw-*) and security.css (sp-*).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { clearWebAnalytics, saveWebAnalyticsSettings } from "@/app/actions/web-analytics";
import { Tile } from "@/components/dashboard/Tile";
import { usePending } from "@/components/ui/ButtonBusy";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/interactive";
import { AREAS, RANGES, type WaAreaFilter, type WaDesk, type WaPoint, type WaRange, type WaRow, type WaView } from "@/lib/web-analytics/types";
import { Hint, Switch, plural, useConsole } from "../ui";
import { Head, NumberSetting, Quiet, compact, countryName, manila, tick } from "./Firewall";

type Metric = "visitors" | "pageviews" | "bounce";
type Result = { ok: boolean; message: string; data?: WaDesk };
const POLL_MS = 15_000;

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
const METRIC: Record<Metric, { label: string; short: string }> = {
  visitors: { label: "Visitors", short: "visitors" },
  pageviews: { label: "Page views", short: "page views" },
  bounce: { label: "Bounce rate", short: "bounce rate" },
};
const DEVICE: Record<string, { label: string; icon: IconName }> = {
  desktop: { label: "Desktop", icon: "monitor" },
  mobile: { label: "Mobile", icon: "smartphone" },
  tablet: { label: "Tablet", icon: "tablet" },
};

export type Analytics = ReturnType<typeof useAnalytics>;

/** The analytics desk, its polling and its settings actions; the Firewall page owns Live and the tab. */
export function useAnalytics(initial: WaDesk, live: boolean, polling: boolean) {
  const { notify, confirm } = useConsole();
  const [desk, setDesk] = useState(initial);
  const [busy, setBusy] = useState(false);
  usePending(busy);
  const view = useRef<WaView>(initial.view);

  const fetchDesk = useCallback(async (next: Partial<WaView> = {}) => {
    view.current = { ...view.current, ...next };
    const v = view.current;
    try {
      const res = await fetch(`/api/web-analytics?range=${v.range}&area=${v.area}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as WaDesk;
      // A later change of view may have overtaken this answer.
      if (data.view.range === view.current.range && data.view.area === view.current.area) setDesk(data);
    } catch {
      /* Offline for a moment: the next poll tries again. */
    }
  }, []);

  useEffect(() => {
    if (!live || !polling || !desk.settings.enabled) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void fetchDesk();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [live, polling, desk.settings.enabled, fetchDesk]);

  const act = async (work: Promise<Result>) => {
    setBusy(true);
    try {
      const r = await work;
      notify(r.message, r.ok ? "ok" : "error");
      if (r.ok && r.data) setDesk(r.data);
      return r.ok;
    } catch {
      notify("The server could not be reached. Nothing was changed.", "error");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const save = (patch: Record<string, unknown>) => act(saveWebAnalyticsSettings(patch, view.current));
  const clear = async () => {
    const ok = await confirm({ title: "Delete every analytics record?", body: "Visitors, page views and events recorded so far are deleted for good. Collection carries on.", confirm: "Delete records", tone: "danger" });
    if (ok !== null) await act(clearWebAnalytics(view.current));
  };
  const turnOff = async () => {
    const ok = await confirm({ title: "Stop counting visits?", body: "Nothing new is recorded until it is back on. Records already kept stay until their retention ends.", confirm: "Stop counting", tone: "danger" });
    if (ok !== null) await save({ enabled: false });
  };
  return { desk, busy, fetchDesk, save, clear, turnOff };
}

/** The tab row's area switch, while the Analytics tab is open and counting. */
export function AnalyticsArea({ a }: { a: Analytics }) {
  if (!a.desk.settings.enabled) return null;
  return (
    <Segmented
      label="Part of the Hub"
      value={a.desk.view.area}
      onChange={(area: WaAreaFilter) => void a.fetchDesk({ area })}
      options={(Object.keys(AREAS) as WaAreaFilter[]).map((k) => ({ value: k, label: AREAS[k] }))}
      className="fw-filter wa-area"
    />
  );
}

/** Firewall › Analytics. */
export function AnalyticsPanel({ a, onSettings }: { a: Analytics; onSettings: () => void }) {
  const { desk, busy } = a;
  const onRange = (range: WaRange) => void a.fetchDesk({ range });
  if (!desk.settings.enabled) return <Intro desk={desk} busy={busy} onEnable={() => void a.save({ enabled: true })} onPrivacy={onSettings} />;
  return (
    <div className="sp-stack-y">
      {desk.source.off && (
        <div className="fw-standing" data-kind={desk.source.off === "development" ? "development" : undefined}>
          <Icon name={desk.source.off === "development" ? "info" : "alert"} size={14} />
          <span>{desk.source.off === "development" ? "Visits on development servers aren’t counted." : "This server has no Supabase address or secret key, so visits aren’t recorded."}</span>
          {desk.source.off === "development" &&
            (desk.canManage ? (
              <button type="button" className="btn btn--sm btn--dark fw-standing__act" disabled={busy} onClick={() => void a.save({ devEnabled: true })}>
                <Icon name="play" size={13} /> Count them
              </button>
            ) : (
              <span className="fw-standing__act sp-muted">A Director can change this in Settings.</span>
            ))}
        </div>
      )}
      <Overview desk={desk} onRange={onRange} />
      <EventLog desk={desk} />
    </div>
  );
}

/* ---------- Shared pieces ---------- */

function RangePick({ value, onChange, dark }: { value: WaRange; onChange: (r: WaRange) => void; dark?: boolean }) {
  return (
    <Segmented
      label="Time range"
      value={value}
      onChange={onChange}
      options={(Object.keys(RANGES) as WaRange[]).map((r) => ({ value: r, label: RANGES[r].short }))}
      className={dark ? "fw-range fw-range--dark" : "fw-range"}
    />
  );
}

/** Every step of the range, with the empty ones filled in, so the line covers the whole period. */
function fill(desk: WaDesk): WaPoint[] {
  const out: WaPoint[] = [];
  const by = new Map(desk.summary.series.map((p) => [Date.parse(p.t), p]));
  for (let t = Date.parse(desk.from); t <= Date.parse(desk.now); t += desk.step) {
    const p = by.get(t);
    out.push({ t: new Date(t).toISOString(), visitors: p?.visitors ?? 0, pageviews: p?.pageviews ?? 0, arrived: p?.arrived ?? 0, bounced: p?.bounced ?? 0 });
  }
  return out;
}

/** A change against the period before, as a chip: percent for counts, points for the bounce rate. */
function Delta({ now, before, points, inverse }: { now: number; before: number; points?: boolean; inverse?: boolean }) {
  if (points) {
    const d = now - before;
    const tone = d === 0 ? "flat" : d > 0 === !inverse ? "up" : "down";
    return (
      <span className="wa-delta num" data-tone={tone} title="Against the period before">
        {d > 0 ? "+" : ""}
        {d} pts
      </span>
    );
  }
  if (!before) return <span className="wa-delta" data-tone={now ? "up" : "flat"} title="Against the period before">{now ? "New" : "0%"}</span>;
  const d = Math.round(((now - before) / before) * 100);
  const tone = d === 0 ? "flat" : d > 0 === !inverse ? "up" : "down";
  return (
    <span className="wa-delta num" data-tone={tone} title="Against the period before">
      {d > 0 ? "+" : ""}
      {d}%
    </span>
  );
}

/* ---------- Hero: metric tabs over one chart ---------- */

function Hero({ desk, points, demo, onRange, head }: { desk: WaDesk; points: WaPoint[]; demo?: boolean; onRange?: (r: WaRange) => void; head?: ReactNode }) {
  const [metric, setMetric] = useState<Metric>("visitors");
  const s = desk.summary;
  const totals = demo
    ? { visitors: points.reduce((a, p) => a + p.visitors, 0), pageviews: points.reduce((a, p) => a + p.pageviews, 0), bounce: 49, prevV: 0, prevP: 0, prevB: 47 }
    : { visitors: s.visitors, pageviews: s.pageviews, bounce: pct(s.bounced, s.visitors), prevV: s.prevVisitors, prevP: s.prevPageviews, prevB: pct(s.prevBounced, s.prevVisitors) };
  return (
    <section className="fw-hero wa-hero" data-demo={demo || undefined} aria-label="Traffic">
      {head}
      <div className="wa-metrics" role="radiogroup" aria-label="Chart shows">
        {(
          [
            ["visitors", compact(totals.visitors), <Delta key="d" now={totals.visitors} before={totals.prevV} />],
            ["pageviews", compact(totals.pageviews), <Delta key="d" now={totals.pageviews} before={totals.prevP} />],
            ["bounce", `${totals.bounce}%`, <Delta key="d" now={totals.bounce} before={totals.prevB} points inverse />],
          ] as const
        ).map(([key, value, delta]) => (
          <button key={key} type="button" role="radio" aria-checked={metric === key} className="wa-metric" data-fx="off" onClick={() => setMetric(key)}>
            <span className="wa-metric__label">{METRIC[key].label}</span>
            <span className="wa-metric__row">
              <b className="num">{value}</b>
              {demo ? (
                <span className="wa-delta num" data-tone="flat">
                  {key === "bounce" ? "+2 pts" : "0%"}
                </span>
              ) : (
                delta
              )}
            </span>
          </button>
        ))}
        {onRange && (
          <div className="wa-metrics__range">
            <RangePick value={desk.view.range} onChange={onRange} dark />
          </div>
        )}
      </div>
      <WaChart key={`${desk.view.range}-${metric}`} points={points} step={desk.step} metric={metric} demo={demo} />
    </section>
  );
}

function niceScale(highest: number, percent: boolean) {
  if (percent) return { interval: 25, ceiling: 100 };
  const roughStep = Math.max(1, highest) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const interval = Math.max(1, Math.ceil(([1, 2, 2.5, 5, 10].find((n) => n * magnitude >= roughStep) ?? 10) * magnitude));
  return { interval, ceiling: interval * 4 };
}

/** One series on the Firewall chart's axes; bounce rate leaves gaps where nobody arrived. */
function WaChart({ points, step, metric, demo }: { points: WaPoint[]; step: number; metric: Metric; demo?: boolean }) {
  const id = useId();
  const plot = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    if (!plot.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(plot.current);
    return () => observer.disconnect();
  }, []);

  const percent = metric === "bounce";
  const value = (p: WaPoint): number | null => (metric === "bounce" ? (p.arrived ? pct(p.bounced, p.arrived) : null) : p[metric]);
  const values = points.map(value);
  const peak = Math.max(0, ...values.map((v) => v ?? 0));
  const { interval, ceiling } = niceScale(peak, percent);
  const left = 40, right = width - 12, top = 16, bottom = 204;
  const x = (i: number) => (points.length <= 1 ? (left + right) / 2 : left + (i / (points.length - 1)) * (right - left));
  const y = (n: number) => bottom - (n / ceiling) * (bottom - top);
  // Straight segments; a missing value lifts the pen.
  let line = "";
  let area = "";
  let run: number[] = [];
  const flush = () => {
    if (!run.length) return;
    const seg = run.map((i, k) => `${k ? "L" : "M"}${x(i)},${y(values[i] as number)}`).join(" ");
    line += seg + " ";
    area += `${seg} L${x(run[run.length - 1])},${bottom} L${x(run[0])},${bottom} Z `;
    run = [];
  };
  values.forEach((v, i) => (v === null ? flush() : run.push(i)));
  flush();
  const sel = active === null ? null : Math.min(active, points.length - 1);
  const selected = sel === null ? undefined : points[sel];
  const tickCount = width < 520 ? 3 : Math.min(8, points.length);
  const ticks = Array.from(new Set(Array.from({ length: tickCount }, (_, i) => Math.round((i * (points.length - 1)) / Math.max(1, tickCount - 1))))).filter((i) => i >= 0);
  const fmt = (v: number | null) => (v === null ? "—" : percent ? `${v}%` : v.toLocaleString("en-US"));
  const when = (p: WaPoint) => (step >= 86_400_000 ? manila(p.t, true).replace(/ · .*/, "") : manila(p.t, true).slice(0, -3));
  const describe = (i: number) => `${when(points[i])}: ${fmt(values[i])} ${METRIC[metric].short}.`;

  return (
    <figure className="fw-chart wa-chart" aria-labelledby={`${id}-title`}>
      <figcaption className="sr-only" id={`${id}-title`}>
        {METRIC[metric].label} over time{demo ? ", demo data" : ""}
      </figcaption>
      <div
        ref={plot}
        className="fw-chart__plot"
        role="slider"
        tabIndex={points.length && !demo ? 0 : -1}
        aria-label={`${METRIC[metric].label} over time`}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, points.length - 1)}
        aria-valuenow={sel ?? Math.max(0, points.length - 1)}
        aria-valuetext={points.length ? describe(sel ?? points.length - 1) : "No visits in this range"}
        onPointerMove={(event) => {
          if (!points.length || demo) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const position = ((event.clientX - rect.left) / rect.width) * width;
          setActive(Math.max(0, Math.min(points.length - 1, Math.round(((position - left) / (right - left)) * (points.length - 1)))));
        }}
        onPointerLeave={() => {
          if (document.activeElement !== plot.current) setActive(null);
        }}
        onFocus={() => setActive((c) => c ?? Math.max(0, points.length - 1))}
        onBlur={() => setActive(null)}
        onKeyDown={(event) => {
          if (!points.length || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Escape"].includes(event.key)) return;
          event.preventDefault();
          if (event.key === "Escape") return setActive(null);
          const current = sel ?? points.length - 1;
          setActive(event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : Math.max(0, Math.min(points.length - 1, current + (["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1))));
        }}
      >
        <svg viewBox={`0 0 ${width} 238`} className="fw-chart__svg" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c6d5e5" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#c6d5e5" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3, 4].map((n) => (
            <g key={n}>
              <line className={n === 0 ? "fw-chart__axis" : "fw-chart__guide"} x1={left} x2={right} y1={y(n * interval)} y2={y(n * interval)} />
              <text className="fw-chart__tick" x={left - 10} y={y(n * interval) + 4} textAnchor="end">
                {percent ? `${n * interval}%` : compact(n * interval)}
              </text>
            </g>
          ))}
          <g className="fw-chart__series is-allowed">
            {area && <path d={area} fill={`url(#${id}-fill)`} />}
            {line && <path className="fw-chart__line" d={line} />}
            {points.length === 1 && values[0] !== null && <circle cx={x(0)} cy={y(values[0])} r="3" fill="currentColor" />}
          </g>
          {selected && sel !== null && (
            <g>
              <line className="fw-chart__crosshair" x1={x(sel)} x2={x(sel)} y1={top} y2={bottom} />
              {values[sel] !== null && <circle className="fw-chart__point is-allowed" cx={x(sel)} cy={y(values[sel] as number)} r="4" />}
            </g>
          )}
          {ticks.map(
            (i, index) =>
              points[i] && (
                <text key={i} className="fw-chart__tick" x={x(i)} y="230" textAnchor={index === 0 ? "start" : index === ticks.length - 1 ? "end" : "middle"}>
                  {tick(points[i].t, step)}
                </text>
              )
          )}
        </svg>
        {demo ? <div className="wa-demo">Demo data</div> : peak === 0 && active === null && <div className="fw-chart__empty">No visits in this range yet</div>}
        {selected && sel !== null && (
          <div className="fw-chart__tooltip wa-tooltip" aria-hidden="true" style={{ left: `clamp(100px, ${(x(sel) / width) * 100}%, calc(100% - 100px))` }}>
            <span>{when(selected)}</span>
            <div>
              Visitors<b>{selected.visitors.toLocaleString("en-US")}</b>
            </div>
            <div>
              Page views<b>{selected.pageviews.toLocaleString("en-US")}</b>
            </div>
            <div>
              Bounce rate<b>{selected.arrived ? `${pct(selected.bounced, selected.arrived)}%` : "—"}</b>
            </div>
          </div>
        )}
      </div>
    </figure>
  );
}

/* ---------- Off: what turning it on gives ---------- */

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: "chart", title: "Live traffic", text: "Top pages, referrers and visitor countries, refreshed as people browse." },
  { icon: "spark", title: "Events that matter", text: "Downloads and links out are counted on their own; add any action with track()." },
  { icon: "shield-check", title: "Respects privacy", text: "No cookies and no addresses kept. A visitor’s ID resets every day." },
  { icon: "layers", title: "Every part of the Hub", text: "Split the public site, the portals, forms and sign-in with one switch." },
];

/** A made-up week, only to show the shape of the chart while collection is off. */
function demoPoints(desk: WaDesk): WaPoint[] {
  const shape = [2120, 2290, 2930, 2770, 2060, 1510, 1560, 2010];
  const day = 86_400_000;
  const end = Math.floor((Date.parse(desk.now) + 8 * 3_600_000) / day) * day - 8 * 3_600_000;
  return shape.map((v, i) => ({ t: new Date(end - (shape.length - 1 - i) * day).toISOString(), visitors: v, pageviews: Math.round(v * 3), arrived: v, bounced: Math.round(v * 0.49) }));
}

function Intro({ desk, busy, onEnable, onPrivacy }: { desk: WaDesk; busy: boolean; onEnable: () => void; onPrivacy: () => void }) {
  const rail = useRef<HTMLUListElement>(null);
  const points = useMemo(() => demoPoints(desk), [desk]);
  const scroll = (dir: 1 | -1) => rail.current?.scrollBy({ left: dir * (rail.current.clientWidth * 0.8), behavior: "smooth" });
  return (
    <div className="sp-ov">
      <section className="fw-hero wa-intro" aria-labelledby="wa-intro-title">
        <div className="wa-intro__lead">
          <span className="fw-shield" aria-hidden="true">
            <Icon name="chart" size={20} />
            <i />
          </span>
          <h2 id="wa-intro-title" className="fw-hero__title">
            Web Analytics
          </h2>
          <p>See which pages people visit and where they come from.</p>
          <div className="wa-intro__acts">
            {desk.canManage ? (
              <button type="button" className="btn wa-enable" disabled={busy} onClick={onEnable}>
                Enable
              </button>
            ) : (
              <span className="wa-intro__note">A Director or Ranking Specialist can turn it on.</span>
            )}
            <button type="button" className="wa-link" onClick={onPrivacy}>
              Settings <Icon name="arrow" size={13} />
            </button>
          </div>
        </div>
        <div className="wa-intro__rail">
          <ul ref={rail} className="wa-features" aria-label="What Web Analytics shows">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <Icon name={f.icon} size={16} />
                <b>{f.title}</b>
                <span>{f.text}</span>
              </li>
            ))}
          </ul>
          <div className="wa-features__nav">
            <button type="button" className="wa-round" aria-label="Previous" onClick={() => scroll(-1)}>
              <Icon name="chevron-left" size={15} />
            </button>
            <button type="button" className="wa-round" aria-label="Next" onClick={() => scroll(1)}>
              <Icon name="chevron" size={15} />
            </button>
          </div>
        </div>
      </section>
      <Hero desk={{ ...desk, step: 86_400_000, view: { ...desk.view, range: "7d" } }} points={points} demo />
    </div>
  );
}

/* ---------- Overview ---------- */

/** A ranked list with the share drawn behind each row, like the Firewall's meters but lighter. */
function Ranked({ rows, total, label, empty, render }: { rows: WaRow[]; total?: number; label: string; empty: ReactNode; render?: (r: WaRow) => ReactNode }) {
  if (!rows.length) return <>{empty}</>;
  const max = Math.max(1, ...rows.map((r) => r.visitors));
  return (
    <div className="wa-ranked">
      <div className="wa-ranked__head" aria-hidden="true">
        <span>{label}</span>
        <span>Visitors</span>
      </div>
      <ul className="wa-list">
        {rows.map((r) => (
          <li key={r.key || "none"} style={{ ["--w" as string]: `${(r.visitors / max) * 100}%` }}>
            <span className="wa-list__key">{render ? render(r) : <span className="fw-mono fw-trunc" title={r.key}>{r.key || "—"}</span>}</span>
            <span className="wa-list__n num" title={`${r.n.toLocaleString("en-US")} page views`}>
              {compact(r.visitors)}
              {total ? <small>{pct(r.visitors, total)}%</small> : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Overview({ desk, onRange }: { desk: WaDesk; onRange: (r: WaRange) => void }) {
  const s = desk.summary;
  const points = useMemo(() => fill(desk), [desk]);
  const [pages, setPages] = useState<"pages" | "routes" | "hosts">("pages");
  const [sources, setSources] = useState<"referrers" | "utm">("referrers");
  const [tech, setTech] = useState<"browsers" | "os">("browsers");
  const referrers: WaRow[] = s.direct ? [{ key: "", visitors: s.direct, n: 0 }, ...s.referrers] : s.referrers;
  const deviceTotal = s.devices.reduce((a, d) => a + d.visitors, 0);

  const head = (
    <header className="fw-hero__head">
      <div className="fw-hero__state">
        <span className="fw-shield" aria-hidden="true">
          <Icon name="chart" size={20} />
          <i />
        </span>
        <span>
          <span className="sp-eyebrow">
            <i className="sp-live" aria-hidden="true" /> Analytics{desk.view.area !== "all" ? ` · ${AREAS[desk.view.area]}` : ""}
          </span>
          <h2 className="fw-hero__title">
            {RANGES[desk.view.range].label}
            <span className="wa-online" title="Visitors with a page view in the last 5 minutes">
              <i aria-hidden="true" />
              <b className="num">{s.online}</b> online
            </span>
          </h2>
        </span>
      </div>
    </header>
  );

  return (
    <div className="sp-ov">
      <Hero desk={desk} points={points} onRange={onRange} head={head} />

      <div className="sp-bento">
        <Tile
          id="wa-pages"
          className="sp-span-7"
          title={<Head icon="link">Pages</Head>}
          aside={<Segmented label="Group pages by" value={pages} onChange={setPages} options={[{ value: "pages", label: "Pages" }, { value: "routes", label: "Routes" }, { value: "hosts", label: "Hostnames" }]} className="fw-range wa-switch" />}
        >
          <Ranked
            rows={pages === "pages" ? s.pages : pages === "routes" ? s.routes : s.hosts}
            label={pages === "pages" ? "Page" : pages === "routes" ? "Route" : "Hostname"}
            empty={<Quiet icon="link" text="No page views yet" />}
          />
        </Tile>

        <Tile
          id="wa-sources"
          className="sp-span-5"
          title={<Head icon="arrow-up-right">Sources</Head>}
          aside={<Segmented label="Show sources as" value={sources} onChange={setSources} options={[{ value: "referrers", label: "Referrers" }, { value: "utm", label: "UTM" }]} className="fw-range wa-switch" />}
        >
          {sources === "referrers" ? (
            <Ranked
              rows={referrers}
              label="Referrer"
              empty={<Quiet icon="arrow-up-right" text="No referrers yet" />}
              render={(r) =>
                r.key ? (
                  <span className="wa-ref">
                    <i aria-hidden="true">{r.key.charAt(0).toUpperCase()}</i>
                    <span className="fw-trunc">{r.key}</span>
                  </span>
                ) : (
                  <span className="wa-ref wa-ref--direct">
                    <i aria-hidden="true">
                      <Icon name="arrow" size={11} />
                    </i>
                    <span>Direct</span>
                  </span>
                )
              }
            />
          ) : (
            <Ranked rows={s.utm} label="Source · medium · campaign" empty={<Quiet icon="tag" text="No tagged links yet" />} />
          )}
        </Tile>

        <Tile id="wa-countries" className="sp-span-4" title={<Head icon="globe">Countries</Head>}>
          {!desk.source.geo && !s.countries.some((c) => c.key) ? (
            <Quiet icon="globe" text="This host doesn’t send locations" />
          ) : (
            <Ranked
              rows={s.countries}
              total={s.visitors}
              label="Country"
              empty={<Quiet icon="globe" text="No countries yet" />}
              render={(r) => (
                <span className="fw-ip">
                  <span className="fw-cc">{r.key || "··"}</span>
                  <span className="fw-trunc">{countryName(r.key || null)}</span>
                </span>
              )}
            />
          )}
        </Tile>

        <Tile id="wa-devices" className="sp-span-4" title={<Head icon="monitor">Devices</Head>}>
          {deviceTotal ? (
            <div className="wa-devices">
              <div className="wa-split" role="img" aria-label={s.devices.map((d) => `${DEVICE[d.key]?.label ?? d.key} ${pct(d.visitors, deviceTotal)}%`).join(", ")}>
                {s.devices.map((d) => (
                  <i key={d.key} data-k={d.key} style={{ flexGrow: d.visitors }} />
                ))}
              </div>
              <ul className="wa-devices__list">
                {(["desktop", "mobile", "tablet"] as const).map((k) => {
                  const d = s.devices.find((x) => x.key === k);
                  return (
                    <li key={k} data-k={k}>
                      <Icon name={DEVICE[k].icon} size={15} />
                      <span>{DEVICE[k].label}</span>
                      <b className="num">{pct(d?.visitors ?? 0, deviceTotal)}%</b>
                      <small className="num">{compact(d?.visitors ?? 0)}</small>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <Quiet icon="monitor" text="No devices yet" />
          )}
        </Tile>

        <Tile
          id="wa-tech"
          className="sp-span-4"
          title={<Head icon="data">{tech === "browsers" ? "Browsers" : "Operating systems"}</Head>}
          aside={<Segmented label="Show" value={tech} onChange={setTech} options={[{ value: "browsers", label: "Browsers" }, { value: "os", label: "OS" }]} className="fw-range wa-switch" />}
        >
          <Ranked rows={tech === "browsers" ? s.browsers : s.os} total={s.visitors} label={tech === "browsers" ? "Browser" : "System"} empty={<Quiet icon="data" text="Nothing yet" />} render={(r) => <span className="fw-trunc">{r.key}</span>} />
        </Tile>

        <Tile
          id="wa-events"
          className="sp-span-12"
          title={<Head icon="spark">Events</Head>}
          aside={<Hint label="Sending events" text={'Downloads and links to other sites are counted on their own. To count another action, call track("Name", { key: "value" }) from lib/web-analytics/track.ts.'} />}
        >
          {s.events.length ? (
            <ul className="fw-rows fw-rows--grid">
              {s.events.slice(0, 8).map((e) => (
                <li key={e.key} className="fw-row fw-row--two">
                  <span className="fw-trunc wa-event">{e.key}</span>
                  <span className="fw-meter">
                    <span className="fw-meter__bar">
                      <i style={{ width: `${(e.n / Math.max(1, s.events[0].n)) * 100}%` }} />
                    </span>
                    <b className="num">{compact(e.n)}</b>
                    <small className="num wa-muted">{plural(e.visitors, "visitor")}</small>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Quiet icon="spark" text="No events yet: downloads and links out appear here" />
          )}
        </Tile>
      </div>
    </div>
  );
}

/* ---------- Latest events ---------- */

function EventLog({ desk }: { desk: WaDesk }) {
  if (!desk.recent.length) return null;
  const props = (p: Record<string, unknown> | null) =>
    p
      ? Object.entries(p)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" · ")
      : "—";
  return (
    <>
      <div className="fw-section-heading">
        <h3>Latest events</h3>
      </div>
      <div className="cmd-table-wrap fw-log">
        <table className="cmd-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Event</th>
              <th>Page</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {desk.recent.slice(0, 50).map((e) => (
              <tr key={e.id}>
                <td className="fw-mono fw-time">{manila(e.at, desk.view.range !== "24h")}</td>
                <td>
                  <span className="fw-ip">
                    <span className="fw-cc" title={countryName(e.country)}>
                      {e.country ?? "··"}
                    </span>
                    <b className="wa-event">{e.name}</b>
                  </span>
                </td>
                <td>
                  <span className="fw-mono fw-trunc wa-path" title={e.path}>
                    {e.path}
                  </span>
                </td>
                <td className="wa-props">{props(e.props)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ---------- In Firewall › Settings ---------- */

const PRIVACY: [IconName, string][] = [
  ["lock", "No cookies or browser storage"],
  ["server", "No addresses kept"],
  ["refresh", "Visitor ID resets every day"],
  ["filter", "Query strings dropped, except UTM tags"],
  ["key", "Form links kept as /f/[code]"],
  ["ban", "Bots and link previews ignored"],
];

export function AnalyticsSettings({ a }: { a: Analytics }) {
  const { desk, busy } = a;
  const st = desk.settings;
  return (
    <>
      <div className="fw-section-heading">
        <h3>Analytics</h3>
      </div>
      <div className="sp-bento">
        <Tile id="wa-collect" className="sp-span-7 fw-settings-controls" title={<Head icon="chart">Page analytics</Head>} aside={!desk.canManage ? <span className="fw-card-hint">Management access required</span> : undefined}>
          <div className="fw-settings-list" role="group" aria-label="Analytics controls">
            <div className="fw-setting-row">
              <span className="sp-row__icon" aria-hidden="true">
                <Icon name="activity" size={16} />
              </span>
              <div className="fw-setting-content">
                <b className="fw-setting-label">
                  Count visits <Hint label="About counting visits" text="Record a page view for every page people open, on the public site, the portals, forms and sign-in. Separate from the request log." />
                </b>
              </div>
              <Switch checked={st.enabled} disabled={!desk.canManage || busy} label="Count visits" onChange={(v) => (v ? void a.save({ enabled: true }) : void a.turnOff())} />
            </div>
            <div className="fw-setting-row">
              <span className="sp-row__icon" aria-hidden="true">
                <Icon name="server" size={16} />
              </span>
              <div className="fw-setting-content">
                <b className="fw-setting-label">
                  Count development servers <Hint label="About counting development servers" text="Count visits on local servers too. They land in the same records as the live Hub." />
                </b>
              </div>
              <Switch checked={st.devEnabled} disabled={!desk.canManage || busy} label="Count development servers" onChange={(v) => void a.save({ devEnabled: v })} />
            </div>
          </div>
        </Tile>
        <Tile
          id="wa-records"
          className="sp-span-5"
          title={
            <Head icon="clock">
              Analytics records <Hint label="About analytics records" text="Page views and events. Older records are deleted automatically, once an hour." />
            </Head>
          }
        >
          <NumberSetting value={st.retentionDays} min={7} max={730} label="Keep records for" unit="days" showRange={false} disabled={!desk.canEdit} busy={busy} save={(retentionDays) => a.save({ retentionDays })} />
          {desk.canManage && (
            <button type="button" className="btn btn--sm btn--danger wa-clear" disabled={busy} onClick={() => void a.clear()}>
              <Icon name="trash" size={13} /> Delete all records
            </button>
          )}
        </Tile>
        <Tile id="wa-privacy" className="sp-span-12" title={<Head icon="shield-check">Analytics privacy</Head>}>
          <ul className="fw-protect wa-privacy">
            {PRIVACY.map(([icon, text]) => (
              <li key={text} data-on>
                <Icon name={icon} size={14} /> {text}
              </li>
            ))}
          </ul>
        </Tile>
      </div>
    </>
  );
}
