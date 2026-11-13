"use client";

/*
 * Command & Control › Firewall: the Hub's own firewall (lib/firewall), so the Office inspects and filters traffic the
 * same way wherever the Hub is hosted. Overview is the live traffic picture, Requests the raw log, Rules what to
 * block or allow, Settings the operating mode and records. The page polls /api/firewall every 10 seconds while
 * Live is on and the tab is visible. Styles: firewall.css (fw-*), with the sp-* pieces from security.css.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { addFirewallRule, deleteFirewallRule, saveFirewallSettings, setFirewallRule } from "@/app/actions/firewall";
import { Tile } from "@/components/dashboard/Tile";
import { ChoiceCards } from "./ChoiceCards";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Segmented, TabPanel } from "@/components/ui/interactive";
import { NumberField, Select } from "@/components/ui/pickers";
import { DENIED, RANGES, type FirewallDesk, type FirewallMode, type FirewallRange, type FirewallRequest, type FirewallRule, type FirewallView, type RequestAction, type RequestFilter, type RuleAction, type RuleKind, type TopRow } from "@/lib/firewall/types";
import { EmptyNote, Field, Hint, KV, Pill, RowMenu, SearchField, Sheet, Switch, Tabs, fmtAgo, plural, useConsole } from "../ui";
import { usePending } from "@/components/ui/ButtonBusy";

type Tab = "Overview" | "Requests" | "Rules" | "Settings";
type Result = { ok: boolean; message: string; data?: FirewallDesk };
const TABS: Tab[] = ["Overview", "Requests", "Rules", "Settings"];
const POLL_MS = 10_000;

const regions = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;
const countryName = (code: string | null | undefined) => {
  if (!code) return "Unknown";
  try {
    return regions?.of(code) ?? code;
  } catch {
    return code;
  }
};
const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 10_000 ? `${Math.round(n / 1000)}K` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));
/** Manila wall-clock time, computed by hand so the server and browser agree. */
const manila = (iso: string, withDate = false) => {
  const d = new Date(Date.parse(iso) + 8 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  const time = `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
  if (!withDate) return time;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} · ${time}`;
};
const tick = (iso: string, stepMs: number) => {
  const d = new Date(Date.parse(iso) + 8 * 3_600_000);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const p = (n: number) => String(n).padStart(2, "0");
  return stepMs >= 86_400_000 ? `${d.getUTCDate()} ${months[d.getUTCMonth()]}` : stepMs >= 6 * 3_600_000 ? `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${p(d.getUTCHours())}h` : `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

/** "in 6 days", "in 3 hours", "in 12 minutes". */
const until = (iso: string, nowIso: string) => {
  const ms = Date.parse(iso) - Date.parse(nowIso);
  const m = Math.max(1, Math.round(ms / 60_000));
  if (m < 60) return `in ${plural(m, "minute")}`;
  const h = Math.round(m / 60);
  if (h < 48) return `in ${plural(h, "hour")}`;
  return `in ${plural(Math.round(h / 24), "day")}`;
};

/** Why nothing new is checked or recorded here: standing page context, so it stays inline. */
const OFF_NOTE: Record<NonNullable<FirewallDesk["source"]["off"]>, string> = {
  development: "The firewall is off on development servers.",
  "switched-off": "HUB_FIREWALL=off is set on this server, so nothing is checked or recorded. Remove it to turn the firewall back on.",
  "no-database": "This server has no Supabase address or secret key, so the firewall can't read its rules or record requests.",
};

const OUTCOME: Record<RequestAction, { label: string; tone: "ok" | "danger" | "revise" | "neutral" }> = {
  allow: { label: "Allowed", tone: "neutral" },
  log: { label: "Flagged", tone: "revise" },
  block: { label: "Blocked", tone: "danger" },
  rate_limit: { label: "Rate-limited", tone: "danger" },
  lockdown: { label: "Lockdown", tone: "danger" },
};
const MODE: Record<FirewallMode, { label: string; sub: string; icon: IconName }> = {
  off: { label: "Off", sub: "Nothing checked or recorded", icon: "lock-open" },
  log: { label: "Monitor", sub: "Record and flag, block nothing", icon: "eye" },
  on: { label: "Enforce", sub: "Block what the rules say", icon: "shield-check" },
};
const KIND: Record<RuleKind, { label: string; icon: IconName; placeholder: string; hint: string }> = {
  ip: { label: "Address or range", icon: "server", placeholder: "203.0.113.7 or 203.0.113.0/24", hint: "Enter an address like 203.0.113.7, or a range like 203.0.113.0/24." },
  country: { label: "Country", icon: "globe", placeholder: "PH", hint: "Enter a two-letter country code, like PH or US." },
  path: { label: "Path", icon: "link", placeholder: "/wp-login", hint: "Enter a path that starts with /." },
  agent: { label: "User agent", icon: "data", placeholder: "python-requests", hint: "Enter 3 to 120 characters of the user agent." },
};
const ACTION: Record<RuleAction, { label: string; sub: string; icon: IconName; tone: "danger" | "ok" | "revise" }> = {
  block: { label: "Block", sub: "Refuse with 403", icon: "ban", tone: "danger" },
  allow: { label: "Allow", sub: "Skip every other check", icon: "check-circle", tone: "ok" },
  log: { label: "Log", sub: "Let through, flag it", icon: "flag", tone: "revise" },
};
const EXPIRES = [
  { value: "never", label: "Never" },
  { value: "1h", label: "1 hour" },
  { value: "24h", label: "24 hours" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

export function Firewall({ initial }: { initial: FirewallDesk }) {
  const { notify, confirm } = useConsole();
  const [desk, setDesk] = useState(initial);
  const [tab, setTab] = useState<Tab>("Overview");
  const [live, setLive] = useState(true);
  const [busy, setBusy] = useState(false);
  usePending(busy);
  const [adding, setAdding] = useState<Partial<NewRule> | null>(null);
  const [inspect, setInspect] = useState<FirewallRequest | null>(null);
  const [q, setQ] = useState(initial.view.q);
  const view = useRef<FirewallView>(initial.view);

  const fetchDesk = useCallback(async (next: Partial<FirewallView> = {}) => {
    view.current = { ...view.current, ...next };
    const v = view.current;
    try {
      const res = await fetch(`/api/firewall?range=${v.range}&filter=${v.filter}&q=${encodeURIComponent(v.q)}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as FirewallDesk;
      // A later change of view may have overtaken this answer.
      if (data.view.range === view.current.range && data.view.filter === view.current.filter && data.view.q === view.current.q) setDesk(data);
    } catch {
      /* Offline for a moment: the next poll tries again. */
    }
  }, []);

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void fetchDesk();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [live, fetchDesk]);

  // Search as you type, a moment after the last key.
  useEffect(() => {
    if (q === view.current.q) return;
    const t = setTimeout(() => void fetchDesk({ q }), 300);
    return () => clearTimeout(t);
  }, [q, fetchDesk]);

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

  const block = (ip: string, expires: string) => act(addFirewallRule({ kind: "ip", value: ip, action: "block", expires, name: `Block ${ip}` }, view.current));
  const allow = (ip: string) => act(addFirewallRule({ kind: "ip", value: ip, action: "allow", expires: "never", name: `Allow ${ip}` }, view.current));
  const showIp = (ip: string) => {
    setTab("Requests");
    setQ(ip);
  };

  const denied = desk.summary.denied;
  const actions = (
    <>
      {tab === "Requests" && (
        <Segmented
          label="Which requests"
          value={desk.view.filter}
          onChange={(f: RequestFilter) => void fetchDesk({ filter: f })}
          options={[
            { value: "all", label: "All" },
            { value: "allowed", label: "Allowed" },
            { value: "flagged", label: "Flagged" },
            { value: "denied", label: "Refused" },
          ]}
          className="fw-filter"
        />
      )}
      {tab === "Rules" && desk.canEdit && (
        <button type="button" className="content-tabs__action" disabled={busy} onClick={() => setAdding({})}>
          <Icon name="plus" size={15} /> Add rule
        </button>
      )}
      <button type="button" className="content-tabs__action fw-live" aria-pressed={live} onClick={() => setLive(!live)}>
        <i className="fw-live__dot" aria-hidden="true" /> {live ? "Live" : "Paused"}
      </button>
    </>
  );

  return (
    <div className="sp fw" aria-busy={busy}>
      <Tabs
        label="Firewall"
        idBase="fw"
        value={tab}
        onChange={setTab}
        actions={actions}
        search={tab === "Requests" ? <SearchField value={q} onChange={setQ} placeholder="Search address, path or reason" label="Search requests" examples={["203.0.113.7", "/wp-login", "Scanner"]} shortcuts /> : undefined}
        tabs={[
          { key: "Overview", label: "Overview" },
          { key: "Requests", label: "Requests", count: denied || undefined, countTone: "alert" },
          { key: "Rules", label: "Rules", count: desk.rules.length + 2 },
          { key: "Settings", label: "Settings" },
        ]}
      />
      {desk.source.off && (
        <div className="fw-standing" data-kind={desk.source.off}>
          <Icon name={desk.source.off === "development" ? "info" : "alert"} size={14} />
          <span>{OFF_NOTE[desk.source.off]}</span>
          {desk.source.off === "development" &&
            (desk.canManage ? (
              <button type="button" className="btn btn--sm btn--dark fw-standing__act" disabled={busy} onClick={() => void act(saveFirewallSettings({ devEnabled: true }, view.current))}>
                <Icon name="play" size={13} /> Turn on here
              </button>
            ) : (
              <span className="fw-standing__act sp-muted">A Director can turn it on in Settings.</span>
            ))}
        </div>
      )}
      <TabPanel idBase="fw" index={TABS.indexOf(tab)} className="sp-panel">
        {tab === "Overview" && <Overview desk={desk} onRange={(r) => void fetchDesk({ range: r })} onBlock={block} onAllow={allow} onShow={showIp} onRules={() => setTab("Rules")} />}
        {tab === "Requests" && <Requests desk={desk} onOpen={setInspect} onRange={(r) => void fetchDesk({ range: r })} />}
        {tab === "Rules" && (
          <Rules
            desk={desk}
            busy={busy}
            save={(patch) => act(saveFirewallSettings(patch, view.current))}
            onAdd={() => setAdding({})}
            onToggle={(r, on) => void act(setFirewallRule(r.id, on, view.current))}
            onDelete={async (r) => {
              const ok = await confirm({ title: `Delete ${r.name}?`, body: "Requests it matched go back to the other checks.", confirm: "Delete", tone: "danger" });
              if (ok !== null) await act(deleteFirewallRule(r.id, view.current));
            }}
          />
        )}
        {tab === "Settings" && <Settings desk={desk} busy={busy} save={(patch) => act(saveFirewallSettings(patch, view.current))} />}
      </TabPanel>

      <RequestSheet
        req={inspect}
        desk={desk}
        onClose={() => setInspect(null)}
        onBlock={async (ip, exp) => (await block(ip, exp)) && setInspect(null)}
        onAllow={async (ip) => (await allow(ip)) && setInspect(null)}
        onShow={(ip) => {
          setInspect(null);
          showIp(ip);
        }}
      />
      <RuleSheet draft={adding} you={desk.you} onClose={() => setAdding(null)} onSave={async (r) => (await act(addFirewallRule(r, view.current))) && setAdding(null)} />
    </div>
  );
}

/* ---------- Overview ---------- */

function RangePick({ value, onChange, dark }: { value: FirewallRange; onChange: (r: FirewallRange) => void; dark?: boolean }) {
  return (
    <Segmented
      label="Time range"
      value={value}
      onChange={onChange}
      options={(Object.keys(RANGES) as FirewallRange[]).map((r) => ({ value: r, label: r === "1h" ? "1H" : r === "24h" ? "24H" : r.toUpperCase() }))}
      className={dark ? "fw-range fw-range--dark" : "fw-range"}
    />
  );
}

const TRAFFIC_SERIES = [
  { key: "allowed", label: "Allowed" },
  { key: "flagged", label: "Flagged" },
  { key: "denied", label: "Refused" },
] as const;
type TrafficPoint = FirewallDesk["summary"]["series"][number];

/** Shared time/count axes; straight segments keep sparse traffic and spikes honest. */
function TrafficChart({ points, step }: { points: TrafficPoint[]; step: number }) {
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

  const left = 38, right = width - 12, top = 16, bottom = 204;
  const peak = Math.max(0, ...points.map((p) => p.allowed + p.flagged + p.denied));
  const highest = Math.max(1, ...points.flatMap((p) => TRAFFIC_SERIES.map(({ key }) => p[key])));
  const roughStep = highest / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const interval = Math.max(1, Math.ceil(([1, 2, 2.5, 5, 10].find((n) => n * magnitude >= roughStep) ?? 10) * magnitude));
  const ceiling = interval * 4;
  const x = (i: number) => points.length <= 1 ? (left + right) / 2 : left + i / (points.length - 1) * (right - left);
  const y = (n: number) => bottom - n / ceiling * (bottom - top);
  const selectedIndex = active === null ? null : Math.min(active, points.length - 1);
  const selected = selectedIndex === null ? undefined : points[selectedIndex];
  const tickCount = width < 520 ? 3 : 6;
  const ticks = Array.from(new Set(Array.from({ length: tickCount }, (_, i) => Math.round(i * (points.length - 1) / (tickCount - 1))))).filter((i) => i >= 0);
  const bucketLabel = step >= 86_400_000 ? `${step / 86_400_000}d` : step >= 3_600_000 ? `${step / 3_600_000}h` : `${step / 60_000}m`;
  const describe = (p: TrafficPoint) => `${manila(p.t, true)}, Manila time. ${p.allowed} allowed, ${p.flagged} flagged, ${p.denied} refused.`;

  return (
    <figure className="fw-chart" aria-labelledby={`${id}-title`}>
      <figcaption className="fw-chart__heading">
        <span id={`${id}-title`}>Request traffic <small>per {bucketLabel}</small></span>
        <span className="fw-chart__timezone">Manila time · UTC+8</span>
      </figcaption>
      <div
        ref={plot}
        className="fw-chart__plot"
        role="slider"
        tabIndex={points.length ? 0 : -1}
        aria-label="Traffic over time"
        aria-describedby={`${id}-help`}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, points.length - 1)}
        aria-valuenow={selectedIndex ?? Math.max(0, points.length - 1)}
        aria-valuetext={selected ? describe(selected) : points.length ? describe(points[points.length - 1]) : "No requests in this range"}
        onPointerMove={(event) => {
          if (!points.length) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const position = (event.clientX - rect.left) / rect.width * width;
          setActive(Math.max(0, Math.min(points.length - 1, Math.round((position - left) / (right - left) * (points.length - 1)))));
        }}
        onPointerLeave={() => { if (document.activeElement !== plot.current) setActive(null); }}
        onFocus={() => setActive((current) => current ?? Math.max(0, points.length - 1))}
        onBlur={() => setActive(null)}
        onKeyDown={(event) => {
          if (!points.length || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Escape"].includes(event.key)) return;
          event.preventDefault();
          if (event.key === "Escape") { setActive(null); return; }
          const current = selectedIndex ?? points.length - 1;
          setActive(event.key === "Home" ? 0 : event.key === "End" ? points.length - 1 : Math.max(0, Math.min(points.length - 1, current + (["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1))));
        }}
      >
        <svg viewBox={`0 0 ${width} 238`} className="fw-chart__svg" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c6d5e5" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#c6d5e5" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 1, 2, 3, 4].map((n) => (
            <g key={n}>
              <line className={n === 0 ? "fw-chart__axis" : "fw-chart__guide"} x1={left} x2={right} y1={y(n * interval)} y2={y(n * interval)} />
              <text className="fw-chart__tick" x={left - 10} y={y(n * interval) + 4} textAnchor="end">{compact(n * interval)}</text>
            </g>
          ))}
          {TRAFFIC_SERIES.map(({ key }) => {
            if (!points.length || (key !== "allowed" && !points.some((p) => p[key] > 0))) return null;
            const line = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p[key])}`).join(" ");
            return (
              <g key={key} className={`fw-chart__series is-${key}`}>
                {key === "allowed" && <path d={`${line} L${x(points.length - 1)},${bottom} L${x(0)},${bottom} Z`} fill={`url(#${id}-fill)`} />}
                <path className="fw-chart__line" d={line} />
                {points.length === 1 && <circle cx={x(0)} cy={y(points[0][key])} r="3" fill="currentColor" />}
              </g>
            );
          })}
          {selected && selectedIndex !== null && (
            <g>
              <line className="fw-chart__crosshair" x1={x(selectedIndex)} x2={x(selectedIndex)} y1={top} y2={bottom} />
              {TRAFFIC_SERIES.filter(({ key }) => key === "allowed" || selected[key] > 0).map(({ key }) => (
                <circle key={key} className={`fw-chart__point is-${key}`} cx={x(selectedIndex)} cy={y(selected[key])} r="4" />
              ))}
            </g>
          )}
          {ticks.map((i, index) => points[i] && <text key={i} className="fw-chart__tick" x={x(i)} y="230" textAnchor={index === 0 ? "start" : index === ticks.length - 1 ? "end" : "middle"}>{tick(points[i].t, step)}</text>)}
        </svg>
        {peak === 0 && active === null && <div className="fw-chart__empty">No requests in this range</div>}
        {selected && selectedIndex !== null && (
          <div className="fw-chart__tooltip" aria-hidden="true" style={{ left: `clamp(100px, ${x(selectedIndex) / width * 100}%, calc(100% - 100px))` }}>
            <span>{manila(selected.t, true)}</span>
            {TRAFFIC_SERIES.map(({ key, label }) => <div key={key}><i className={`is-${key}`} />{label}<b>{selected[key].toLocaleString("en-US")}</b></div>)}
          </div>
        )}
      </div>
      <p id={`${id}-help`} className="sr-only">Use the arrow keys to inspect each time interval. Home and End jump to the first and last interval.</p>
      <div className="fw-legend">
        {TRAFFIC_SERIES.map(({ key, label }) => <span key={key}><i className={`is-${key}`} />{label}</span>)}
        <span className="fw-legend__peak">Peak <b className="num">{compact(peak)}</b><span className="sr-only"> requests per {bucketLabel}</span></span>
      </div>
    </figure>
  );
}

function Overview({ desk, onRange, onBlock, onAllow, onShow, onRules }: { desk: FirewallDesk; onRange: (r: FirewallRange) => void; onBlock: (ip: string, exp: string) => void; onAllow: (ip: string) => void; onShow: (ip: string) => void; onRules: () => void }) {
  const s = desk.summary;
  const mode = desk.settings.mode;
  const points = useMemo(() => {
    const out: { t: string; allowed: number; denied: number; flagged: number }[] = [];
    const start = Date.parse(desk.from);
    const end = Date.parse(desk.now);
    const by = new Map(s.series.map((p) => [Date.parse(p.t), p]));
    for (let t = start; t <= end; t += desk.step) {
      const p = by.get(t);
      out.push({ t: new Date(t).toISOString(), allowed: p?.allowed ?? 0, denied: p?.denied ?? 0, flagged: p?.flagged ?? 0 });
    }
    return out;
  }, [desk.from, desk.now, desk.step, s.series]);
  const refusedShare = s.total ? Math.round((s.denied / s.total) * 1000) / 10 : 0;

  return (
    <div className="sp-ov">
      <section className="fw-hero" data-mode={mode} aria-labelledby="fw-hero-title">
        <header className="fw-hero__head">
          <div className="fw-hero__state">
            <span className="fw-shield" aria-hidden="true">
              <Icon name={MODE[mode].icon} size={20} />
              <i />
            </span>
            <span>
              <span className="sp-eyebrow">
                <i className="sp-live" aria-hidden="true" /> Firewall
              </span>
              <h2 id="fw-hero-title" className="fw-hero__title">
                {mode === "on" ? "Enforcing" : mode === "log" ? "Monitoring" : "Off"}
                {desk.settings.lockdown && <span className="fw-badge">Lockdown</span>}
              </h2>
            </span>
          </div>
          <RangePick value={desk.view.range} onChange={onRange} dark />
        </header>
        <dl className="fw-metrics">
          {(
            [
              ["Requests", compact(s.total), null],
              ["Refused", compact(s.denied), s.total ? `${refusedShare}%` : null],
              ["Flagged", compact(s.flagged), null],
              ["Addresses", compact(s.ips), null],
              ["Countries", compact(s.countries), desk.source.geo || s.countries ? null : "No location data"],
            ] as const
          ).map(([k, v, sub]) => (
            <div key={k} data-k={k}>
              <dt>{k}</dt>
              <dd className="num">{v}</dd>
              {sub && <small>{sub}</small>}
            </div>
          ))}
        </dl>
        <TrafficChart key={desk.view.range} points={points} step={desk.step} />
      </section>

      <div className="sp-bento">
        <Tile id="fw-ips" className="sp-span-7" title={<Head icon="server">Top addresses</Head>}>
          {s.topIps.length ? (
            <ul className="fw-rows">
              {s.topIps.map((r) => (
                <li key={r.key} className="fw-row">
                  <button type="button" className="fw-ip fw-ip--link" onClick={() => onShow(r.key)} aria-label={`Requests from ${r.key}`}>
                    <span className="fw-cc" title={countryName(r.country)}>
                      {r.country ?? "··"}
                    </span>
                    <span className="fw-ip__text">
                      <b className="fw-mono">{r.key}</b>
                      <small>
                        {countryName(r.country)}
                        {r.last ? ` · ${fmtAgo(r.last, desk.now)}` : ""}
                      </small>
                    </span>
                  </button>
                  <Meter row={r} max={s.topIps[0].n} />
                  {desk.canEdit ? (
                    <RowMenu
                      label={`Actions for ${r.key}`}
                      items={[
                        { label: "Show requests", icon: "list", onSelect: () => onShow(r.key) },
                        r.key !== desk.you.ip && { label: "Block for 24 hours", icon: "clock", onSelect: () => onBlock(r.key, "24h"), danger: true },
                        r.key !== desk.you.ip && { label: "Block always", icon: "ban", onSelect: () => onBlock(r.key, "never"), danger: true },
                        { label: "Always allow", icon: "check-circle", onSelect: () => onAllow(r.key) },
                      ]}
                    />
                  ) : (
                    <button type="button" className="btn btn--sm" onClick={() => onShow(r.key)}>
                      Requests
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <Quiet icon="server" text="No traffic in this range" />
          )}
        </Tile>

        <Tile id="fw-paths" className="sp-span-5" title={<Head icon="link">Top paths</Head>}>
          {s.topPaths.length ? (
            <ul className="fw-rows">
              {s.topPaths.map((r) => (
                <li key={r.key} className="fw-row fw-row--two">
                  <b className="fw-mono fw-trunc" title={r.key}>
                    {r.key}
                  </b>
                  <Meter row={r} max={s.topPaths[0].n} />
                </li>
              ))}
            </ul>
          ) : (
            <Quiet icon="link" text="No paths yet" />
          )}
        </Tile>

        <Tile id="fw-countries" className="sp-span-4" title={<Head icon="globe">Countries</Head>}>
          {!desk.source.geo && !s.countries ? (
            <Quiet icon="globe" text="This host doesn’t send locations" />
          ) : s.topCountries.length ? (
            <ul className="fw-rows">
              {s.topCountries.map((r) => (
                <li key={r.key || "unknown"} className="fw-row fw-row--two">
                  <span className="fw-ip">
                    <span className="fw-cc">{r.key || "··"}</span>
                    <span className="fw-trunc">{countryName(r.key)}</span>
                  </span>
                  <Meter row={r} max={s.topCountries[0].n} />
                </li>
              ))}
            </ul>
          ) : (
            <Quiet icon="globe" text="No countries yet" />
          )}
        </Tile>

        <Tile id="fw-reasons" className="sp-span-4" title={<Head icon="ban">Why requests were stopped</Head>}>
          {s.reasons.length ? (
            <ul className="fw-reasons">
              {s.reasons.map((r) => (
                <li key={`${r.key}-${r.action}`} data-action={r.action}>
                  <i aria-hidden="true" />
                  <span className="fw-trunc" title={r.key}>
                    {r.key.replace(/ · [A-F0-9]{8}$/, "")}
                  </span>
                  <b className="num">{compact(r.n)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <Quiet icon="shield-check" text="Nothing stopped or flagged" ok />
          )}
        </Tile>

        <Tile id="fw-rulesum" className="sp-span-4" title={<Head icon="sliders">Protection</Head>} aside={<button type="button" className="btn btn--sm" onClick={onRules}>Rules</button>}>
          <ul className="fw-protect">
            <li data-on={desk.settings.blockScanners || undefined}>
              <Icon name="search" size={14} /> Scanners and probes <b>{desk.settings.blockScanners ? "Blocked" : "Off"}</b>
            </li>
            <li data-on={desk.settings.rateLimit > 0 || undefined}>
              <Icon name="activity" size={14} /> Rate limit <b className="num">{desk.settings.rateLimit ? `${compact(desk.settings.rateLimit)}/min` : "Off"}</b>
            </li>
            <li data-on={desk.rules.some((r) => r.enabled && r.action === "block") || undefined}>
              <Icon name="ban" size={14} /> Custom block rules <b className="num">{desk.rules.filter((r) => r.enabled && r.action === "block").length}</b>
            </li>
            <li data-on={desk.rules.some((r) => r.enabled && r.action === "allow") || undefined}>
              <Icon name="check-circle" size={14} /> Allow rules <b className="num">{desk.rules.filter((r) => r.enabled && r.action === "allow").length}</b>
            </li>
            <li data-on={desk.settings.lockdown || undefined} data-alert={desk.settings.lockdown || undefined}>
              <Icon name="lock" size={14} /> Lockdown <b>{desk.settings.lockdown ? "On" : "Off"}</b>
            </li>
          </ul>
        </Tile>

        <Tile id="fw-agents" className="sp-span-12" title={<Head icon="data">User agents</Head>}>
          {s.topAgents.length ? (
            <ul className="fw-rows fw-rows--grid">
              {s.topAgents.map((r) => (
                <li key={r.key || "none"} className="fw-row fw-row--two">
                  <span className="fw-mono fw-trunc fw-agent" title={r.key}>
                    {r.key || "No user agent"}
                  </span>
                  <Meter row={r} max={s.topAgents[0].n} />
                </li>
              ))}
            </ul>
          ) : (
            <Quiet icon="data" text="No user agents yet" />
          )}
        </Tile>
      </div>
    </div>
  );
}

const Head = ({ icon, children }: { icon: IconName; children: ReactNode }) => (
  <>
    <span className="sp-glyph" aria-hidden="true">
      <Icon name={icon} size={16} />
    </span>
    {children}
  </>
);

function Meter({ row, max }: { row: TopRow; max: number }) {
  const w = (row.n / Math.max(1, max)) * 100;
  const d = row.n ? (row.denied / row.n) * 100 : 0;
  return (
    <span className="fw-meter" aria-label={`${row.n} requests, ${row.denied} refused`}>
      <span className="fw-meter__bar">
        <i style={{ width: `${w}%` }}>
          <i style={{ width: `${d}%` }} />
        </i>
      </span>
      <b className="num">{compact(row.n)}</b>
      {row.denied > 0 && <small className="num">{compact(row.denied)} refused</small>}
    </span>
  );
}

function Quiet({ icon, text, ok }: { icon: IconName; text: string; ok?: boolean }) {
  return (
    <div className={`sp-empty${ok ? " sp-empty--calm" : ""}`}>
      <span className="sp-empty__art" aria-hidden="true">
        <Icon name={icon} size={22} />
      </span>
      <small>{text}</small>
    </div>
  );
}

/* ---------- Requests ---------- */

function Requests({ desk, onOpen, onRange }: { desk: FirewallDesk; onOpen: (r: FirewallRequest) => void; onRange: (r: FirewallRange) => void }) {
  return (
    <div className="sp-stack-y">
      <div className="fw-bar">
        <span className="fw-bar__count">
          {desk.requests.length >= 200 ? "Latest 200" : plural(desk.requests.length, "request")} · {RANGES[desk.view.range].label.toLowerCase()}
        </span>
        <RangePick value={desk.view.range} onChange={onRange} />
      </div>
      {desk.requests.length ? (
        <div className="cmd-table-wrap fw-log">
          <table className="cmd-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Address</th>
                <th>Request</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {desk.requests.map((r) => (
                <tr key={r.id} className="is-clickable" data-action={r.action} onClick={() => onOpen(r)}>
                  <td className="fw-mono fw-time">
                    <button type="button" className="fw-rowbtn" onClick={(e) => (e.stopPropagation(), onOpen(r))} aria-label={`Details of the request at ${manila(r.at)}`}>
                      {manila(r.at, desk.view.range !== "1h" && desk.view.range !== "24h")}
                    </button>
                  </td>
                  <td>
                    <span className="fw-ip">
                      <span className="fw-cc" title={countryName(r.country)}>
                        {r.country ?? "··"}
                      </span>
                      <span className="fw-ip__text">
                        <b className="fw-mono">{r.ip}</b>
                        {r.session && <small>Session</small>}
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className="fw-req">
                      <span className="fw-method" data-m={r.method}>
                        {r.method}
                      </span>
                      <span className="fw-mono fw-trunc" title={r.path}>
                        {r.path}
                      </span>
                    </span>
                  </td>
                  <td>
                    <Pill tone={OUTCOME[r.action].tone}>{OUTCOME[r.action].label}</Pill>
                    {r.reason && <small className="fw-reason">{r.reason.replace(/ · [A-F0-9]{8}$/, "")}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="sp-empty">
          <span className="sp-empty__art" aria-hidden="true">
            <Icon name="list" size={24} />
          </span>
          <b>No requests match</b>
          <small>Try a longer range or another filter.</small>
        </div>
      )}
    </div>
  );
}

function RequestSheet({ req, desk, onClose, onBlock, onAllow, onShow }: { req: FirewallRequest | null; desk: FirewallDesk; onClose: () => void; onBlock: (ip: string, exp: string) => void; onAllow: (ip: string) => void; onShow: (ip: string) => void }) {
  const [exp, setExp] = useState("24h");
  if (!req) return null;
  const rule = req.ruleId ? desk.rules.find((r) => r.id === req.ruleId) : undefined;
  const ref = req.reason?.match(/ · ([A-F0-9]{8})$/)?.[1];
  const mine = req.ip === desk.you.ip;
  return (
    <Sheet
      open
      onClose={onClose}
      title={`${req.method} ${req.path}`}
      sub={`${manila(req.at, true)} · ${OUTCOME[req.action].label}`}
      footer={
        <>
          <button type="button" className="btn" onClick={() => onShow(req.ip)}>
            All from this address
          </button>
          {desk.canEdit && !mine && (
            <>
              <button type="button" className="btn" onClick={() => onAllow(req.ip)}>
                Always allow
              </button>
              <span className="fw-blockgroup">
                <Select className="select select--sm" value={exp} onChange={setExp} aria-label="Block for">
                  {EXPIRES.map((e) => (
                    <option key={e.value} value={e.value}>
                      {e.value === "never" ? "Always" : `For ${e.label}`}
                    </option>
                  ))}
                </Select>
                <button type="button" className="btn btn--danger" onClick={() => onBlock(req.ip, exp)}>
                  Block address
                </button>
              </span>
            </>
          )}
        </>
      }
    >
      <div className="fw-detail" data-action={req.action}>
        <span className="fw-detail__icon" aria-hidden="true">
          <Icon name={DENIED.includes(req.action) ? "ban" : req.action === "log" ? "flag" : "check"} size={18} />
        </span>
        <span>
          <b>{OUTCOME[req.action].label}</b>
          <small>{req.reason?.replace(/ · [A-F0-9]{8}$/, "") ?? "No rule matched"}</small>
        </span>
      </div>
      <KV
        copyable
        rows={[
          ["Address", <span key="ip" className="fw-mono">{req.ip}{mine ? " (you)" : ""}</span>, req.ip],
          ["Location", [req.city, countryName(req.country)].filter(Boolean).join(", ")],
          ["Host", req.host ?? "—"],
          ["Path", <span key="p" className="fw-mono">{req.path}</span>, req.path],
          ["User agent", req.agent ?? "None", req.agent ?? ""],
          ["Came from", req.referrer ?? "Direct"],
          ["Session", req.session ? "Had a session cookie" : "Not signed in"],
          ...(rule ? ([["Rule", rule.name]] as [string, string][]) : []),
          ...(ref ? ([["Reference", <span key="r" className="fw-mono">{ref}</span>, ref]] as [string, ReactNode, string][]) : []),
        ]}
      />
    </Sheet>
  );
}

/* ---------- Rules ---------- */

interface NewRule {
  name: string;
  kind: RuleKind;
  value: string;
  action: RuleAction;
  expires: string;
  note: string;
}

function PolicyHeader({ desk, title, stats }: { desk: FirewallDesk; title: string; stats: [string, string | number][] }) {
  return (
    <header className="fw-hero fw-policy-hero" data-mode={desk.settings.mode}>
      <div className="fw-policy-hero__heading">
        <div>
          <span className="sp-eyebrow">Firewall control</span>
          <h2 className="fw-hero__title">{title}</h2>
        </div>
        <span className="fw-policy-mode">
          <i aria-hidden="true" />
          {MODE[desk.settings.mode].label} mode
        </span>
      </div>
      <dl className="fw-policy-stats">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd className="num">{value}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

function RuleStatus({ enabled }: { enabled: boolean }) {
  return (
    <span className="fw-rule-status" data-enabled={enabled || undefined}>
      <i aria-hidden="true" />
      {enabled ? "Enabled" : "Disabled"}
    </span>
  );
}

/** Keep edits local until submitted; a live poll with the same saved value never resets a draft. */
function NumberSetting({
  value,
  min,
  max,
  label,
  unit,
  showRange = true,
  disabled,
  busy,
  save,
}: {
  value: number;
  min: number;
  max: number;
  label: string;
  unit: string;
  showRange?: boolean;
  disabled: boolean;
  busy: boolean;
  save: (value: number) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const dirty = draft !== value;
  return (
    <form
      className="fw-number-setting"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && !busy && dirty) void save(draft);
      }}
    >
      <Field label={label}>
        <NumberField className="input num" aria-label={label} required min={min} max={max} step={1} value={draft} onChange={setDraft} disabled={disabled || busy} suffix={unit} />
      </Field>
      <div className="fw-edit-footer">
        <span>{dirty ? "Unsaved changes" : showRange ? `${min.toLocaleString("en-US")}–${max.toLocaleString("en-US")} ${unit}` : null}</span>
        {dirty && (
          <button type="button" className="btn btn--sm" disabled={disabled || busy} onClick={() => setDraft(value)}>
            Discard
          </button>
        )}
        <button type="submit" className="btn btn--sm btn--dark" disabled={disabled || busy || !dirty}>
          Save changes
        </button>
      </div>
    </form>
  );
}

function Rules({
  desk,
  busy,
  save,
  onAdd,
  onToggle,
  onDelete,
}: {
  desk: FirewallDesk;
  busy: boolean;
  save: (patch: Record<string, unknown>) => Promise<boolean>;
  onAdd: () => void;
  onToggle: (r: FirewallRule, on: boolean) => void;
  onDelete: (r: FirewallRule) => void;
}) {
  const order: Record<RuleAction, number> = { allow: 0, block: 1, log: 2 };
  const rules = desk.rules.slice().sort((a, b) => order[a.action] - order[b.action]);
  const expired = (r: FirewallRule) => !!r.expiresAt && r.expiresAt <= desk.now;
  const st = desk.settings;
  const builtinEnabled = Number(st.blockScanners) + Number(st.rateLimit > 0);
  const enabled = rules.filter((r) => r.enabled && !expired(r)).length + builtinEnabled;
  return (
    <div className="sp-stack-y fw-policy">
      <PolicyHeader
        desk={desk}
        title="Traffic rules"
        stats={[
          ["Enabled rules", enabled],
          ["Built-in rules", 2],
          ["Custom rules", rules.length],
        ]}
      />
      {st.mode !== "on" && (
        <p className="fw-policy-context">
          <Icon name="info" size={15} />
          {st.mode === "log" ? "Monitoring records rule matches without blocking requests." : "Rules are saved, but the firewall is off. Turn on Enforce mode in Settings to apply them."}
        </p>
      )}
      <div className="fw-section-heading">
        <h3>Built-in rules</h3>
      </div>
      <div className="sp-bento">
        <Tile id="fw-scanners" className="sp-span-6 fw-builtin" title={<Head icon="search">Scanners & probes</Head>} aside={<RuleStatus enabled={st.blockScanners} />}>
          <p className="fw-card-copy">Stop known attack tools and requests for sensitive files before they reach a page.</p>
          <ul className="fw-match-list" aria-label="Scanner matches">
            <li>
              <Icon name="check" size={14} />
              <span>Known scanner user agents</span>
            </li>
            <li>
              <Icon name="check" size={14} />
              <span>Requests without a user agent</span>
            </li>
            <li>
              <Icon name="check" size={14} />
              <span>
                Probe paths such as <code>/.env</code> and <code>/wp-login.php</code>
              </span>
            </li>
          </ul>
          <div className="fw-builtin__footer">
            <span>
              <b>Block matching requests</b>
              <small>Built-in rule</small>
            </span>
            <Switch checked={st.blockScanners} disabled={!desk.canEdit || busy} label="Scanners and probes rule" onChange={(v) => void save({ blockScanners: v })} />
          </div>
        </Tile>
        <Tile id="fw-rate-limit" className="sp-span-6 fw-builtin" title={<Head icon="activity">Rate limit</Head>} aside={<RuleStatus enabled={st.rateLimit > 0} />}>
          <p className="fw-card-copy">Limit requests from each address within a minute.</p>
          <NumberSetting
            key={st.rateLimit > 0 ? "enabled" : "disabled"}
            value={st.rateLimit || 600}
            min={60}
            max={100000}
            label="Requests per minute, per address"
            unit="requests"
            disabled={!desk.canEdit || st.rateLimit === 0}
            busy={busy}
            save={(rateLimit) => save({ rateLimit })}
          />
          <div className="fw-builtin__footer">
            <span>
              <b>Rate-limit excess requests</b>
              <small>Built-in rule</small>
            </span>
            <Switch checked={st.rateLimit > 0} disabled={!desk.canEdit || busy} label="Rate limit rule" onChange={(v) => void save({ rateLimit: v ? 600 : 0 })} />
          </div>
        </Tile>
      </div>
      <Tile id="fw-custom-rules" className="fw-custom-rules" title={<Head icon="sliders">Custom rules</Head>} aside={<span className="fw-card-hint">{plural(rules.length, "rule")}</span>}>
        {rules.length ? (
          <ul className="fw-rules">
            {rules.map((r) => (
              <li key={r.id} className="fw-rule" data-action={r.action} data-off={!r.enabled || expired(r) || undefined}>
                <span className="fw-rule__icon" aria-hidden="true">
                  <Icon name={KIND[r.kind].icon} size={16} />
                </span>
                <span className="fw-rule__main">
                  <span className="fw-rule__top">
                    <b>{r.name}</b>
                    <Pill tone={ACTION[r.action].tone}>{ACTION[r.action].label}</Pill>
                    {expired(r) ? <Pill>Expired</Pill> : !r.enabled && <Pill>Disabled</Pill>}
                  </span>
                  <span className="fw-rule__match">
                    <small>{KIND[r.kind].label}</small>
                    <code className="fw-mono">{r.kind === "country" ? `${r.value} · ${countryName(r.value)}` : r.value}</code>
                  </span>
                  <small className="sp-muted">
                    {plural(r.hits, "match", "matches")}
                    {r.lastHitAt ? `, last ${fmtAgo(r.lastHitAt, desk.now)}` : ""}
                    {r.expiresAt && !expired(r) ? ` · ends ${until(r.expiresAt, desk.now)}` : ""}
                    {r.createdBy ? ` · by ${r.createdBy}` : ""}
                  </small>
                  {r.note && <small className="fw-rule__note">{r.note}</small>}
                </span>
                <span className="fw-rule__acts">
                  <Switch checked={r.enabled} disabled={!desk.canEdit || busy} label={`${r.name} on`} onChange={(v) => onToggle(r, v)} />
                  {desk.canEdit && (
                    <RowMenu
                      label={`Actions for ${r.name}`}
                      items={[
                        {
                          label: "Delete",
                          icon: "trash",
                          onSelect: () => {
                            if (!busy) onDelete(r);
                          },
                          danger: true,
                        },
                      ]}
                    />
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="fw-rules-empty">
            <span className="sp-glyph" aria-hidden="true">
              <Icon name="sliders" size={20} />
            </span>
            <div>
              <b>Make room for your own rules</b>
            </div>
            {desk.canEdit && (
              <button type="button" className="btn btn--sm btn--dark" disabled={busy} onClick={onAdd}>
                <Icon name="plus" size={14} />
                Add rule
              </button>
            )}
          </div>
        )}
      </Tile>
      <Tile id="fw-rule-order" title={<Head icon="list">Execution order</Head>}>
        <p className="fw-card-copy">Allow rules bypass all other checks.</p>
        <ol className="fw-order" aria-label="How a request is checked">
          {(
            [
              ["Allow", true],
              ["Block", true],
              ["Scanners", st.blockScanners],
              ["Rate limit", st.rateLimit > 0],
              ["Lockdown", st.lockdown],
              ["Log", true],
            ] as const
          ).map(([label, on], i) => (
            <li key={label} data-off={!on || undefined}>
              <span className="fw-order__n num">{String(i + 1).padStart(2, "0")}</span>
              <span>{label}</span>
              {!on && <small>Off</small>}
            </li>
          ))}
        </ol>
      </Tile>
      {!desk.canEdit && <EmptyNote icon="eye" title="View only" />}
    </div>
  );
}

function RuleSheet({ draft, you, onClose, onSave }: { draft: Partial<NewRule> | null; you: FirewallDesk["you"]; onClose: () => void; onSave: (r: NewRule) => void }) {
  const [r, setR] = useState<NewRule>({ name: "", kind: "ip", value: "", action: "block", expires: "never", note: "" });
  useEffect(() => {
    if (draft) setR({ name: "", kind: "ip", value: "", action: "block", expires: "never", note: "", ...draft });
  }, [draft]);
  if (!draft) return null;
  const k = KIND[r.kind];
  return (
    <Sheet
      open
      onClose={onClose}
      title="Add a firewall rule"
      sub={`You are ${you.ip}${you.country ? ` · ${countryName(you.country)}` : ""}`}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="fw-rule-form" className="btn btn--dark">
            Add rule
          </button>
        </>
      }
    >
      <form
        id="fw-rule-form"
        className="fw-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(r);
        }}
      >
        <fieldset className="sp-fieldset">
          <legend>What it does</legend>
          <ChoiceCards
            name="fw-action"
            label="What the rule does"
            value={r.action}
            chosen="Selected"
            options={(Object.keys(ACTION) as RuleAction[]).map((a) => ({ value: a, label: ACTION[a].label, sub: ACTION[a].sub, icon: ACTION[a].icon, tone: ACTION[a].tone === "revise" ? "warn" : ACTION[a].tone }))}
            onChange={(a) => setR({ ...r, action: a })}
          />
        </fieldset>
        <div className="cmd-form-grid">
          <Field label="Match">
            <Select className="select" value={r.kind} onChange={(v) => setR({ ...r, kind: v as RuleKind, value: "" })}>
              {(Object.keys(KIND) as RuleKind[]).map((x) => (
                <option key={x} value={x}>
                  {KIND[x].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={k.label} hint={r.kind === "country" && /^[a-z]{2}$/i.test(r.value) ? countryName(r.value.toUpperCase()) : undefined}>
            <input
              className="input fw-mono"
              required
              value={r.value}
              onChange={(e) => {
                e.currentTarget.setCustomValidity("");
                setR({ ...r, value: e.target.value });
              }}
              onInvalid={(e) => {
                if (e.currentTarget.validity.patternMismatch) e.currentTarget.setCustomValidity(k.hint);
              }}
              placeholder={k.placeholder}
              pattern={r.kind === "country" ? "[A-Za-z]{2}" : r.kind === "path" ? "/?\\S{1,199}" : r.kind === "agent" ? ".{3,120}" : "[0-9A-Fa-f:.\\[\\]/]{2,60}"}
              data-missing={k.hint}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label="Ends">
            <Select className="select" value={r.expires} onChange={(v) => setR({ ...r, expires: v })}>
              {EXPIRES.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.value === "never" ? "Never" : `After ${e.label}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Name">
            <input className="input" value={r.name} maxLength={80} onChange={(e) => setR({ ...r, name: e.target.value })} placeholder="Optional" />
          </Field>
          <Field label="Note" wide>
            <input className="input" value={r.note} maxLength={300} onChange={(e) => setR({ ...r, note: e.target.value })} placeholder="Why, for whoever reads this later" />
          </Field>
        </div>
      </form>
    </Sheet>
  );
}

/* ---------- Settings ---------- */

function Settings({ desk, busy, save }: { desk: FirewallDesk; busy: boolean; save: (patch: Record<string, unknown>) => Promise<boolean> }) {
  const { confirm } = useConsole();
  const st = desk.settings;
  const setMode = async (m: FirewallMode) => {
    if (m === st.mode || busy) return;
    if (m !== "on") {
      const ok = await confirm({
        title: m === "off" ? "Turn the firewall off?" : "Switch to monitoring?",
        body: m === "off" ? "Nothing will be checked or recorded until it is back on." : "Requests are recorded and flagged, but nothing is blocked.",
        confirm: m === "off" ? "Turn off" : "Monitor",
        tone: m === "off" ? "danger" : "default",
      });
      if (ok === null) return;
    }
    await save({ mode: m });
  };

  return (
    <div className="sp-stack-y fw-policy">
      <PolicyHeader
        desk={desk}
        title="Firewall settings"
        stats={[
          ["Operating mode", MODE[st.mode].label],
          ["Record retention", `${st.retentionDays} days`],
          ["Lockdown", st.lockdown ? "Enabled" : "Disabled"],
        ]}
      />
      <div className="sp-bento">
        <Tile id="fw-mode" className="sp-span-12 fw-mode-card" title={<Head icon="shield">Operating mode</Head>} aside={!desk.canManage ? <span className="fw-card-hint">Management access required</span> : undefined}>
          <ChoiceCards
            name="fw-mode"
            label="Firewall mode"
            value={st.mode}
            disabled={!desk.canManage || busy}
            locked={busy ? "Saving" : "Restricted"}
            options={(["on", "log", "off"] as FirewallMode[]).map((m) => ({ value: m, label: MODE[m].label, sub: MODE[m].sub, icon: MODE[m].icon, tone: m === "on" ? "ok" : m === "log" ? "warn" : "neutral" }))}
            onChange={(m) => void setMode(m)}
          />
        </Tile>
        <Tile id="fw-access" className="sp-span-7 fw-settings-controls" title={<Head icon="lock">Access & environments</Head>}>
          <div className="fw-settings-list" role="group" aria-label="Access and environment controls">
            <div className="fw-setting-row" data-danger={st.lockdown || undefined}>
              <span className="sp-row__icon" aria-hidden="true">
                <Icon name="lock" size={16} />
              </span>
              <div className="fw-setting-content">
                <b className="fw-setting-label">
                  Lockdown <Hint label="About lockdown" text="In Enforce mode, temporarily close public pages and forms. Signed-in people and sign-in routes can still get through." />
                </b>
              </div>
              <Switch
                checked={st.lockdown}
                disabled={!desk.canManage || busy}
                label="Lockdown"
                onChange={async (v) => {
                  const ok = await confirm({
                    title: v ? "Lock the Hub down?" : "End the lockdown?",
                    body: v ? "The public site and forms close to anyone who isn’t signed in, until you turn this off." : "The public site opens to everyone again.",
                    confirm: v ? "Lock down" : "End lockdown",
                    tone: v ? "danger" : "default",
                  });
                  if (ok !== null) await save({ lockdown: v });
                }}
              />
            </div>
            <div className="fw-setting-row">
              <span className="sp-row__icon" aria-hidden="true">
                <Icon name="server" size={16} />
              </span>
              <div className="fw-setting-content">
                <b className="fw-setting-label">
                  Development servers <Hint label="About development servers" text="Apply the firewall on local servers too. Their requests appear in the same log as production traffic." />
                </b>
              </div>
              <Switch checked={st.devEnabled} disabled={!desk.canManage || busy} label="Run on development servers" onChange={(v) => void save({ devEnabled: v })} />
            </div>
          </div>
          {!desk.canManage && <p className="fw-card-hint">Your role can view these controls. Management access is needed to change them.</p>}
        </Tile>
        <Tile
          id="fw-records"
          className="sp-span-5"
          title={
            <Head icon="clock">
              Request records <Hint label="About request records" text="Keep the traffic history you need for review. Older records are deleted automatically." />
            </Head>
          }
        >
          <NumberSetting value={st.retentionDays} min={1} max={365} label="Keep records for" unit="days" showRange={false} disabled={!desk.canEdit} busy={busy} save={(retentionDays) => save({ retentionDays })} />
        </Tile>
        <Tile id="fw-you" className="sp-span-12" title={<Head icon="user">Your connection</Head>}>
          <div className="fw-connection">
            <div className="fw-you">
              <span className="fw-cc fw-cc--lg">{desk.you.country ?? "··"}</span>
              <span>
                <b className="fw-mono">{desk.you.ip}</b>
                <small>{countryName(desk.you.country)}</small>
              </span>
            </div>
            <dl className="fw-connection__facts">
              <div>
                <dt>Address source</dt>
                <dd>{desk.source.ipHeader ?? "Forwarded-for"}</dd>
              </div>
              <div>
                <dt>Location data</dt>
                <dd>{desk.source.geo ? "Available from host" : "Not provided by host"}</dd>
              </div>
              <div>
                <dt>Firewall on this server</dt>
                <dd>
                  {desk.source.off === "development"
                    ? "Off · development server"
                    : desk.source.off === "switched-off"
                      ? "Off · server override"
                      : desk.source.off
                        ? "Off · database unavailable"
                        : st.mode === "off"
                          ? "Off · operating mode"
                          : MODE[st.mode].label}
                </dd>
              </div>
            </dl>
          </div>
        </Tile>
      </div>
      {!desk.canEdit && <EmptyNote icon="eye" title="View only" />}
    </div>
  );
}
