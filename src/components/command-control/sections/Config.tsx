"use client";

/*
 * Command & Control › System Configuration, in the dashboard's own language: glass Tiles with the lit rim
 * (dashboard/Tile.tsx), the month rail from the Knowledge Base (dashboard/Deadlines.tsx),
 * big figures, family-colour dots and gold for what is next.
 * Styles: system-config.css (sc-*), on top of overview.css (ov-*) and knowledge-base.css (kb-*).
 */
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition, type CSSProperties } from "react";
import { checkDeadlinesNow } from "@/app/actions/deadlines";
import { fillUrl } from "@/lib/governance/deadline-read";
import type { ConsoleData } from "@/lib/governance/console-types";
import type { CycleConfig, FeatureFlag, NotificationTemplate } from "@/lib/governance/types";
import { viewerCan } from "@/lib/governance/viewer";
import { Tile } from "@/components/dashboard/Tile";
import { useViews } from "@/components/reference/ReferenceProvider";
import { Segmented, TabPanel } from "@/components/ui/interactive";
import { Icon, type IconName } from "@/components/ui/Icon";
import { DateField, NumberField, Select } from "@/components/ui/pickers";
import { UnitSelect } from "../parts";
import { Field, Hint, ReadOnly, Sheet, Switch, Tabs, fmtDate, useAct, useConsole } from "../ui";
import { usePending } from "@/components/ui/ButtonBusy";

type Cfg = NonNullable<ConsoleData["config"]>;
type TabKey = "rankings" | "deadlines" | "cycles" | "workspace" | "messages" | "features";
type Watch = "Read" | "Waiting" | "Failed" | "Manual";

const KEYS: TabKey[] = ["rankings", "deadlines", "cycles", "workspace", "messages", "features"];
const ID_BASE = "sc";
const DAY_MS = 86_400_000;
const WINDOW = 90;

const FILE_GROUPS: { name: string; types: string[] }[] = [
  { name: "Documents", types: ["PDF", "DOCX", "DOC", "TXT"] },
  { name: "Sheets", types: ["XLSX", "XLS", "CSV"] },
  { name: "Slides", types: ["PPTX"] },
  { name: "Images", types: ["PNG", "JPG", "JPEG"] },
  { name: "Archives", types: ["ZIP"] },
];

const WATCH: Record<Watch, { label: string; tone: string; icon: IconName }> = {
  Read: { label: "Read", tone: "ok", icon: "check" },
  Waiting: { label: "Waiting", tone: "revise", icon: "clock" },
  Failed: { label: "Failed", tone: "danger", icon: "alert" },
  Manual: { label: "By hand", tone: "missing", icon: "pen" },
};

const CHANNEL: Record<NotificationTemplate["channel"], IconName[]> = { Email: ["mail"], "In-app": ["bell"], "Email and in-app": ["mail", "bell"] };

const daysTo = (due: string, today: string) => Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
const dayMonth = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function ago(iso?: string) {
  if (!iso) return "never";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (m < 2) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

/** What several tabs read: which rankings are live, their colours, and what is due when. */
function useFacts() {
  const { data } = useConsole();
  const { families } = useViews();
  const c = data.config!;
  const today = data.day.slice(0, 10);
  return useMemo(() => {
    const bodyOn = new Set(c.bodies.filter((b) => b.enabled).map((b) => b.key));
    const colorOf = (family: string) => families[family]?.color ?? "var(--text-3)";
    const bodyColor = (key: string) => {
      const fam = c.rankingMeta.find((r) => r.body === key)?.family ?? Object.values(families).find((f) => f.body === key)?.key;
      return fam ? colorOf(fam) : "var(--text-3)";
    };
    const rows = c.rankingMeta.flatMap((meta) => {
      const rc = c.rankings.find((x) => x.slug === meta.slug);
      return rc ? [{ meta, rc, live: bodyOn.has(meta.body) && rc.enabled }] : [];
    });
    const live = rows.filter((r) => r.live);
    const upcoming = live
      .filter((r) => r.rc.deadline)
      .map((r) => ({ ...r, days: daysTo(r.rc.deadline, today), color: colorOf(r.meta.family) }))
      .filter((r) => r.days >= 0)
      .sort((a, b) => a.days - b.days);
    const watchOf = (s: Cfg["deadlineSources"][number]) => {
      const w = c.watch.find((x) => x.id === s.id);
      return { s, w, status: (s.kind === "manual" ? "Manual" : w?.status) as Watch | undefined };
    };
    return {
      today,
      colorOf,
      bodyColor,
      rows,
      upcoming,
      sources: c.deadlineSources.map(watchOf),
      waiting: c.findings.filter((f) => f.state === "New"),
      lastRun: c.watch.map((w) => w.checkedAt).sort().at(-1),
      warn: c.dashboard.deadlineWarningDays,
    };
  }, [c, families, today]);
}

/* ---------- Shell ---------- */

export function Config() {
  const { data, focus, notify, reload } = useConsole();
  const c = data.config!;
  const [tab, setTab] = useState<TabKey>(KEYS.includes(focus as TabKey) ? (focus as TabKey) : "rankings");
  const [adding, setAdding] = useState(false);
  const [checking, start] = useTransition();
  usePending(checking);
  const edit = viewerCan(data.viewer, "config", "edit");
  const waiting = c.findings.filter((f) => f.state === "New").length;

  const check = () =>
    start(async () => {
      const r = await checkDeadlinesNow();
      notify(r.message, r.ok ? "ok" : "error");
      if (r.ok) await reload();
    });

  const tabs = [
    { key: "rankings" as const, label: "Rankings" },
    { key: "deadlines" as const, label: "Deadlines", count: waiting || undefined, countTone: "alert" as const },
    { key: "cycles" as const, label: "Cycles" },
    { key: "workspace" as const, label: "Workspace" },
    { key: "messages" as const, label: "Messages" },
    { key: "features" as const, label: "Features" },
  ];

  const actions =
    tab === "rankings" && viewerCan(data.viewer, "config", "manage") ? (
      <button type="button" className="btn content-tabs__action" onClick={() => setAdding(true)}>
        <Icon name="plus" size={15} /> Add body
      </button>
    ) : tab === "deadlines" && edit ? (
      <button type="button" className="btn content-tabs__action" disabled={checking} onClick={check}>
        <Icon name="refresh" size={15} /> {checking ? "Checking…" : "Check now"}
      </button>
    ) : undefined;

  return (
    <div className="sc">
      <Tabs label="System configuration" idBase={ID_BASE} value={tab} onChange={setTab} tabs={tabs} actions={actions} />
      {!edit && <ReadOnly>View only.</ReadOnly>}
      <TabPanel idBase={ID_BASE} index={KEYS.indexOf(tab)} className="sc-view" key={tab}>
        {tab === "rankings" && <Rankings adding={adding} setAdding={setAdding} />}
        {tab === "deadlines" && <Deadlines />}
        {tab === "cycles" && <Cycles />}
        {tab === "workspace" && <Workspace />}
        {tab === "messages" && <Messages />}
        {tab === "features" && <Features />}
      </TabPanel>
    </div>
  );
}

/* ---------- Atoms ---------- */

function SaveRow({ dirty, onSave, onReset }: { dirty: boolean; onSave: () => void; onReset: () => void }) {
  if (!dirty) return null;
  return (
    <div className="sc-save">
      <button type="button" className="btn btn--sm" onClick={onReset}>
        Discard
      </button>
      <button type="button" className="btn btn--sm btn--dark" onClick={onSave}>
        Save
      </button>
    </div>
  );
}

function AddRow({ label, placeholder, onAdd }: { label: string; placeholder: string; onAdd: (value: string) => Promise<boolean> }) {
  const [v, setV] = useState("");
  return (
    <span className="sc-add">
      <input className="input input--sm" value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={label} />
      <button
        type="button"
        className="btn btn--sm"
        disabled={!v.trim()}
        onClick={async () => {
          if (await onAdd(v.trim())) setV("");
        }}
      >
        <Icon name="plus" size={14} /> Add
      </button>
    </span>
  );
}

function Days({ days, warn }: { days: number; warn: number }) {
  return (
    <span className="sc-days" data-tone={days < 0 ? "past" : days <= warn ? "soon" : undefined}>
      {days < 0 ? `${-days} d late` : days === 0 ? "Today" : `${days} d`}
    </span>
  );
}

/* ---------- Rankings ---------- */

function Rankings({ adding, setAdding }: { adding: boolean; setAdding: (v: boolean) => void }) {
  const { data } = useConsole();
  const act = useAct();
  const [add, setAdd] = useState({ name: "", short: "", website: "https://" });
  return (
    <div className="sc-bento">
      {data.config!.bodies.map((b) => (
        <Body key={b.key} body={b} />
      ))}
      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a ranking body"
        sub="It starts switched off."
        footer={
          <>
            <button type="button" className="btn" onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn--dark"
              disabled={add.name.trim().length < 2 || !add.short.trim()}
              onClick={async () => {
                const r = await act({ type: "config.bodyAdd", ...add });
                if (r.ok) {
                  setAdd({ name: "", short: "", website: "https://" });
                  setAdding(false);
                }
              }}
            >
              Add
            </button>
          </>
        }
      >
        <div className="cmd-form-grid">
          <Field label="Name">
            <input className="input" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} placeholder="Nature Index" />
          </Field>
          <Field label="Short name">
            <input className="input" value={add.short} onChange={(e) => setAdd({ ...add, short: e.target.value })} placeholder="Nature" />
          </Field>
          <Field label="Website" wide>
            <input className="input" value={add.website} onChange={(e) => setAdd({ ...add, website: e.target.value })} />
          </Field>
        </div>
      </Sheet>
    </div>
  );
}

function Body({ body: b }: { body: Cfg["bodies"][number] }) {
  const { data } = useConsole();
  const act = useAct();
  const f = useFacts();
  const edit = viewerCan(data.viewer, "config", "edit");
  const rows = f.rows.filter((r) => r.meta.body === b.key);
  const soonest = f.upcoming.find((u) => u.meta.body === b.key);
  return (
    <Tile
      id={`sc-body-${b.key}`}
      className="sc-body"
      title={
        <>
          <i className="sc-fam" style={{ background: f.bodyColor(b.key) }} aria-hidden="true" />
          {b.name}
        </>
      }
      aside={<Switch checked={b.enabled} disabled={!edit} label={`${b.name} ${b.enabled ? "on" : "off"}`} onChange={(v) => void act({ type: "config.body", key: b.key, enabled: v })} />}
    >
      {rows.length > 0 && soonest && (
        <p className="sc-body__due" data-off={!b.enabled || undefined}>
          {soonest.days === 0 ? "Next due today" : `Next due in ${soonest.days} ${soonest.days === 1 ? "day" : "days"}`}
        </p>
      )}
      {rows.length > 0 ? (
        <ul className="sc-ranks">
          <li className="sc-ranks__head" aria-hidden="true">
            <span />
            <span>Tracked</span>
            <span>Website</span>
            <span>Due</span>
          </li>
          {rows.map(({ meta: r, rc, live: on }) => (
            <li key={r.slug} data-off={!on || undefined}>
              <span className="sc-ranks__name">
                <b title={r.name}>{r.short}</b>
                {on && rc.deadline && <Days days={daysTo(rc.deadline, f.today)} warn={f.warn} />}
              </span>
              <Switch checked={rc.enabled} disabled={!edit || !b.enabled} label={`Track ${r.short}`} onChange={(v) => void act({ type: "config.ranking", slug: r.slug, enabled: v })} />
              <Switch checked={rc.public} disabled={!edit || !on} label={`Show ${r.short} on the website`} onChange={(v) => void act({ type: "config.ranking", slug: r.slug, public: v })} />
              <DateField className="input input--sm" disabled={!edit} value={rc.deadline} aria-label={`${r.short} due`} onChange={(v) => v !== rc.deadline && void act({ type: "config.ranking", slug: r.slug, deadline: v })} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="ov-none">No rankings yet.</p>
      )}
    </Tile>
  );
}

/* ---------- Deadlines ---------- */

function Deadlines() {
  const { data } = useConsole();
  const c = data.config!;
  const f = useFacts();
  const meta = (slug: string) => c.rankingMeta.find((r) => r.slug === slug);
  return (
    <div className="sc-bento dashboard-deadlines">
      <Tile id="sc-new" className="kb-next sc-new">
        <h2 id="sc-new" className="kb-next__eyebrow">
          New dates
        </h2>
        <p className="kb-next__count">
          <b>{f.waiting.length}</b>
          <span>{f.waiting.length ? "to review" : "all clear"}</span>
        </p>
        {f.waiting.length > 0 && (
          <ul className="sc-diffs">
            {f.waiting.map((w) => {
              const m = meta(w.slug);
              const was = w.target === "deadline" ? c.rankings.find((x) => x.slug === w.slug)?.deadline : c.calendar.find((e) => e.slug === w.slug && e.label === w.label)?.due;
              return (
                <li key={w.id}>
                  <Link href={`/admin/rankings/${w.slug}#deadlines`}>
                    <i style={{ background: m ? f.colorOf(m.family) : undefined }} aria-hidden="true" />
                    <span className="sc-diffs__what">
                      {m?.short ?? w.slug}
                      {w.target !== "deadline" && <small>{w.label}</small>}
                    </span>
                    <span className="sc-diffs__dates">
                      {was && <s>{dayMonth(was)}</s>}
                      <Icon name="arrow" size={12} />
                      <b>{dayMonth(w.due)}</b>
                    </span>
                    <Icon name="chevron" size={14} className="sc-diffs__go" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Tile>

      <Tile id="sc-sources" title="Sources" className="sc-sources" aside={<span className="kb-aside">Last run {ago(f.lastRun)}</span>}>
        <ul className="sc-list">
          {f.sources.map(({ s, w, status }) => {
            const news = f.waiting.filter((x) => x.sourceId === s.id).length;
            const tone = status ? WATCH[status] : null;
            return (
              <li key={s.id}>
                <span className="sc-mark" data-tone={tone?.tone ?? "missing"}>
                  <Icon name={tone?.icon ?? "minus"} size={14} />
                </span>
                <span className="sc-list__main">
                  <a href={fillUrl(s.page, new Date().toISOString().slice(0, 10))} target="_blank" rel="noopener noreferrer">
                    {s.name}
                    <Icon name="external" size={11} />
                  </a>
                  <span className="sc-list__chips">
                    {s.slugs.map((slug) => {
                      const m = meta(slug);
                      return (
                        <span key={slug}>
                          <i style={{ background: m ? f.colorOf(m.family) : undefined }} aria-hidden="true" />
                          {m?.short ?? slug}
                        </span>
                      );
                    })}
                  </span>
                  {status === "Failed" && w?.note && <small className="sc-list__note">{w.note}</small>}
                </span>
                <span className="sc-list__end">
                  {news > 0 && <span className="sc-new-count">{news} new</span>}
                  <span className="sc-list__when">{status === "Manual" ? "By hand" : status ? ago(w?.checkedAt) : "Not read"}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Tile>
    </div>
  );
}

/* ---------- Cycles ---------- */

function Cycles() {
  const { data } = useConsole();
  const act = useAct();
  const c = data.config!;
  const edit = viewerCan(data.viewer, "config", "edit");
  return (
    <div className="sc-bento">
      <Tile id="sc-cycles" title="Reporting cycles" className="sc-cycles" aside={<Hint text="Current and open cycles take submissions. Archived ones stay readable." />}>
        <ol className="sc-track">
          {[...c.cycles].reverse().map((cy) => (
            <li key={cy.id} data-status={cy.status}>
              <span className="sc-track__node" aria-hidden="true" />
              <b className="num">{cy.id}</b>
              {edit ? (
                <Select className="select select--sm" value={cy.status} aria-label={`Status of cycle ${cy.id}`} onChange={(v) => void act({ type: "config.cycle", id: cy.id, status: v as CycleConfig["status"] })}>
                  {(["Current", "Open", "Closed", "Archived"] as const).map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              ) : (
                <span className="sc-track__status">{cy.status}</span>
              )}
            </li>
          ))}
        </ol>
        {edit && <AddRow label="New cycle" placeholder="2027–2028" onAdd={async (id) => (await act({ type: "config.cycleAdd", id })).ok} />}
      </Tile>

      <Tile id="sc-years" title="Academic years" className="sc-years-tile">
        <ul className="sc-years">
          {c.academicYears.map((y) => (
            <li key={y.id} data-current={y.current || undefined}>
              <b className="num">{y.id}</b>
              {y.current ? (
                <span className="sc-years__tag">Current</span>
              ) : (
                edit && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => void act({ type: "config.year", id: y.id })}>
                    Make current
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
        {edit && <AddRow label="New academic year" placeholder="2027–2028" onAdd={async (id) => (await act({ type: "config.yearAdd", id })).ok} />}
      </Tile>
    </div>
  );
}

/* ---------- Workspace ---------- */

function Workspace() {
  return (
    <div className="sc-bento">
      <Uploads />
      <Dashboards />
    </div>
  );
}

function Uploads() {
  const { data } = useConsole();
  const act = useAct();
  const c = data.config!;
  const edit = viewerCan(data.viewer, "config", "edit");
  const [u, setU] = useState(c.uploads);
  useEffect(() => setU(c.uploads), [c.uploads]);
  return (
    <Tile id="sc-uploads" title="Uploads" className="sc-uploads" aside={<span className="kb-aside">Up to {(u.maxFileMB * u.maxFiles).toLocaleString("en-PH")} MB a submission</span>}>
      <p className="sc-workspace-copy">Set upload limits and choose the file formats contributors can submit.</p>
      <div className="sc-pair">
        <label className="sc-knob">
          <span>Largest file</span>
          <NumberField className="input num" min={1} max={200} suffix="MB" disabled={!edit} value={u.maxFileMB} onChange={(v) => setU({ ...u, maxFileMB: v })} aria-label="Largest file in MB" />
        </label>
        <label className="sc-knob">
          <span>Files a submission</span>
          <NumberField className="input num" min={1} max={50} disabled={!edit} value={u.maxFiles} onChange={(v) => setU({ ...u, maxFiles: v })} aria-label="Files per submission" />
        </label>
      </div>
      <fieldset className="sc-files">
        <legend className="sr-only">File types</legend>
        <div className="sc-files__heading" aria-hidden="true">
          <span>Allowed file types</span>
          <span>{u.types.length} selected</span>
        </div>
        {FILE_GROUPS.map((g) => (
          <fieldset key={g.name} className="sc-files__group">
            <legend className="sc-files__name">{g.name}</legend>
            <span className="sc-types">
              {g.types.map((t) => (
                <label key={t} className="choice sc-type">
                  <input type="checkbox" disabled={!edit} checked={u.types.includes(t)} onChange={(e) => setU({ ...u, types: e.target.checked ? [...u.types, t] : u.types.filter((x) => x !== t) })} />
                  <span className="sc-type__check" aria-hidden="true"><Icon name="check" size={13} /></span>
                  <span>{t}</span>
                </label>
              ))}
            </span>
          </fieldset>
        ))}
      </fieldset>
      <SaveRow dirty={JSON.stringify(u) !== JSON.stringify(c.uploads)} onReset={() => setU(c.uploads)} onSave={() => void act({ type: "config.uploads", value: u })} />
    </Tile>
  );
}

function Dashboards() {
  const { data } = useConsole();
  const act = useAct();
  const c = data.config!;
  const f = useFacts();
  const edit = viewerCan(data.viewer, "config", "edit");
  const [d, setD] = useState(c.dashboard);
  useEffect(() => setD(c.dashboard), [c.dashboard]);
  const near = f.upcoming.filter((u) => u.days <= WINDOW);
  const flagged = near.filter((u) => u.days <= d.deadlineWarningDays).length;
  return (
    <Tile id="sc-dash" title="Dashboards" className="sc-dash">
      <p className="sc-workspace-copy">Choose when deadlines need attention and what appears on dashboards.</p>
      <label className="sc-knob">
        <span>Flag deadlines within</span>
        <NumberField className="input num" min={3} max={90} suffix="days" disabled={!edit} value={d.deadlineWarningDays} onChange={(v) => setD({ ...d, deadlineWarningDays: v })} aria-label="Days ahead to flag deadlines" />
      </label>
      <div className="sc-window" role="img" aria-label={`${flagged} of ${near.length} deadlines in the next ${WINDOW} days are flagged`}>
        <span className="sc-window__fill" style={{ width: `${(d.deadlineWarningDays / WINDOW) * 100}%` }} />
        {near.map((u) => (
          <i key={u.meta.slug} style={{ left: `${(u.days / WINDOW) * 100}%`, "--c": u.color } as CSSProperties} data-in={u.days <= d.deadlineWarningDays || undefined} />
        ))}
      </div>
      <span className="sc-window__scale" aria-hidden="true">
        <span>Today</span>
        <span>30 d</span>
        <span>60 d</span>
        <span>90 d</span>
      </span>
      <div className="sc-line sc-clock">
        <span className="sc-clock__label"><span>Show date and time</span><small>Display the clock on workspace dashboards.</small></span>
        <Switch checked={d.showClock} disabled={!edit} label="Show date and time" onChange={(v) => setD({ ...d, showClock: v })} />
      </div>
      <SaveRow dirty={JSON.stringify(d) !== JSON.stringify(c.dashboard)} onReset={() => setD(c.dashboard)} onSave={() => void act({ type: "config.dashboard", value: d })} />
    </Tile>
  );
}

/* ---------- Messages ---------- */

const SAMPLE: Record<string, string> = {
  name: "Dr. J. Santiago",
  inviter: "Engr. Nestor R. Ong",
  unit: "Faculty of Engineering",
  role: "Coordinator",
  title: "Flood-resilience design studio",
  comment: "Please attach the barangay resolution.",
  count: "3",
  decision: "approved",
  approver: "Engr. Rodablas P. Nicolas",
  ranking: "UI GreenMetric",
  days: "10",
  open: "2",
  reason: "Five failed sign-ins.",
};
const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => SAMPLE[k] ?? `{${k}}`);

function Messages() {
  return (
    <div className="sc-bento">
      <Notice />
      <Templates />
    </div>
  );
}

function Notice() {
  const { data } = useConsole();
  const act = useAct();
  const s = data.config!.site;
  const edit = viewerCan(data.viewer, "config", "edit");
  const [text, setText] = useState(s.notice);
  useEffect(() => setText(s.notice), [s.notice]);
  return (
    <Tile
      id="sc-notice"
      title="Site notice"
      className="sc-notice"
      aside={<Switch checked={s.noticeOn} disabled={!edit || (!s.notice && !text)} label="Show the notice" onChange={(v) => void act({ type: "config.site", notice: text, noticeOn: v })} />}
    >
      <textarea className="textarea" disabled={!edit} value={text} maxLength={240} onChange={(e) => setText(e.target.value)} placeholder="Read-only on 30 October, 18:00–20:00, for maintenance." aria-label="Notice text" />
      <div className="sc-stage" aria-label="Preview">
        <span className="sc-pill" data-off={!s.noticeOn || undefined}>
          {text || "Your notice"}
        </span>
      </div>
      <SaveRow dirty={text !== s.notice} onReset={() => setText(s.notice)} onSave={() => void act({ type: "config.site", notice: text })} />
    </Tile>
  );
}

function Templates() {
  const { data } = useConsole();
  const act = useAct();
  const edit = viewerCan(data.viewer, "config", "edit");
  const templates = data.config!.templates;
  const [sel, setSel] = useState<NotificationTemplate | null>(null);
  const [f, setF] = useState({ subject: "", body: "" });
  useEffect(() => {
    if (sel) setF({ subject: sel.subject, body: sel.body });
  }, [sel]);
  return (
    <Tile id="sc-templates" title="Emails and alerts" className="sc-templates" aside={<span className="kb-aside">{templates.filter((t) => t.enabled).length} of {templates.length} on</span>}>
      <ul className="sc-msgs">
        {templates.map((t) => (
          <li key={t.id} data-off={!t.enabled || undefined}>
            <button type="button" className="sc-msgs__open" onClick={() => setSel(t)} aria-haspopup="dialog">
              <span className="sc-msgs__icons" aria-label={t.channel}>
                {CHANNEL[t.channel].map((i) => (
                  <Icon key={i} name={i} size={13} />
                ))}
              </span>
              <span className="sc-msgs__name">{t.name}</span>
            </button>
            <Switch checked={t.enabled} disabled={!edit} label={`${t.name} ${t.enabled ? "on" : "off"}`} onChange={(v) => void act({ type: "config.template", id: t.id, enabled: v })} />
          </li>
        ))}
      </ul>
      <Sheet
        open={!!sel}
        onClose={() => setSel(null)}
        title={sel?.name ?? ""}
        sub={sel ? `${sel.event} · ${sel.channel}` : undefined}
        footer={
          edit && (
            <>
              <button type="button" className="btn" onClick={() => setSel(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--dark"
                onClick={async () => {
                  const r = await act({ type: "config.template", id: sel!.id, ...f });
                  if (r.ok) setSel(null);
                }}
              >
                Save
              </button>
            </>
          )
        }
      >
        <Field label="Subject">
          <input className="input" value={f.subject} disabled={!edit} onChange={(e) => setF({ ...f, subject: e.target.value })} />
        </Field>
        <Field
          label={
            <>
              Message <Hint text="Words in {braces} are filled in when sent." />
            </>
          }
        >
          <textarea className="textarea" value={f.body} disabled={!edit} onChange={(e) => setF({ ...f, body: e.target.value })} />
        </Field>
        <div className="cmd-mail" aria-label="Preview">
          <b>{fill(f.subject)}</b>
          <p>{fill(f.body)}</p>
        </div>
      </Sheet>
    </Tile>
  );
}

/* ---------- Features ---------- */

const AREA_ICON: Record<string, IconName> = { "Contributor workspace": "contributions", "Office workspace": "building", "Public website": "globe" };

function Features() {
  const { data } = useConsole();
  const act = useAct();
  const c = data.config!;
  const edit = viewerCan(data.viewer, "config", "edit");
  const areas = [...new Set(c.features.map((f) => f.area))];
  return (
    <div className="sc-bento">
      {areas.map((a, i) => {
        const list = c.features.filter((f) => f.area === a);
        const on = list.filter((f) => f.enabled).length;
        return (
          <Tile
            key={a}
            id={`sc-area-${i}`}
            className="sc-area"
            title={
              <>
                <Icon name={AREA_ICON[a] ?? "grid"} size={16} />
                {a}
              </>
            }
            aside={
              <span className="kb-aside">
                {on}/{list.length}
              </span>
            }
          >
            <ul className="sc-toggles">
              {list.map((f) => (
                <li key={f.id} data-off={!f.enabled || undefined}>
                  <span>
                    {f.name} <Hint text={f.description} />
                  </span>
                  <Switch checked={f.enabled} disabled={!edit} label={`${f.name} ${f.enabled ? "on" : "off"}`} onChange={(v) => void act({ type: "config.feature", id: f.id, enabled: v })} />
                </li>
              ))}
            </ul>
          </Tile>
        );
      })}
      {c.flags.length > 0 && (
        <Tile
          id="sc-early"
          className="sc-early"
          title={
            <>
              <Icon name="flask" size={16} />
              Early access
            </>
          }
          aside={<Hint text="Try a feature with chosen units or people first. A unit includes everything beneath it." />}
        >
          <ul className="sc-toggles">
            {c.flags.map((f) => (
              <FlagRow key={f.id} f={f} />
            ))}
          </ul>
        </Tile>
      )}
    </div>
  );
}

const MODES: FeatureFlag["mode"][] = ["Off", "Selected", "Everyone"];

function FlagRow({ f }: { f: FeatureFlag }) {
  const { data } = useConsole();
  const act = useAct();
  const edit = viewerCan(data.viewer, "config", "edit");
  const [mode, setMode] = useState(f.mode);
  const [units, setUnits] = useState(f.units);
  const [accounts, setAccounts] = useState(f.accounts);
  useEffect(() => {
    setMode(f.mode);
    setUnits(f.units);
    setAccounts(f.accounts);
  }, [f]);
  const dirty = mode !== f.mode || units.join() !== f.units.join() || accounts.join() !== f.accounts.join();
  const unitName = (id: string) => data.units.find((u) => u.id === id)?.name ?? id;
  const person = (id: string) => data.people.find((p) => p.id === id)?.name ?? id;
  const chips = (ids: string[], name: (id: string) => string, set: (v: string[]) => void) => (
    <div className="cmd-chips">
      {ids.map((id) => (
        <span key={id} className="cmd-chip">
          {name(id)}
          {edit && (
            <button type="button" aria-label={`Remove ${name(id)}`} onClick={() => set(ids.filter((x) => x !== id))}>
              <Icon name="close" size={12} />
            </button>
          )}
        </span>
      ))}
    </div>
  );
  return (
    <li className="sc-flag">
      <span className="sc-flag__row">
        <span className="sc-flag__name">
          {f.name} <Hint text={f.description} />
        </span>
        {edit ? <Segmented options={MODES} value={mode} onChange={setMode} label={`${f.name}: who sees it`} className="sc-seg" /> : <span className="kb-aside">{mode}</span>}
      </span>
      {mode === "Selected" && (
        <div className="cmd-form-grid">
          <Field label="Units">
            {chips(units, unitName, setUnits)}
            {edit && <UnitSelect label="Add a unit" value="" placeholder="Add a unit…" filter={(u) => u.status === "Active" && !units.includes(u.id)} onChange={(id) => id && setUnits([...units, id])} />}
          </Field>
          <Field label="People">
            {chips(accounts, person, setAccounts)}
            {edit && (
              <Select className="select" value="" aria-label="Add a person" onChange={(v) => v && setAccounts([...accounts, v])}>
                <option value="">Add a person…</option>
                {data.people
                  .filter((p) => p.status === "Active" && !accounts.includes(p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
        </div>
      )}
      <SaveRow
        dirty={dirty}
        onReset={() => {
          setMode(f.mode);
          setUnits(f.units);
          setAccounts(f.accounts);
        }}
        onSave={() => void act({ type: "config.flag", id: f.id, mode, units, accounts })}
      />
    </li>
  );
}
