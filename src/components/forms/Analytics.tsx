"use client";

/*
 * A form's analytics, drawn from lib/forms/analytics.ts: how many responses and how lately (one hero figure and
 * the last 30 days as columns), where the review stands, then a card per question in the shape its module reads
 * best. Thin ink bars with the value at the tip; a budget's split puts the Community Service Fund in gold and the
 * counterparts in grey, every part labelled; SDGs carry the goals' own icons rather than seventeen colours.
 * Values are always written out, so nothing hides behind a hover; the Responses tab is the table behind them.
 */
import { useMemo } from "react";
import { useViews } from "@/components/reference/ReferenceProvider";
import { Icon } from "@/components/ui/Icon";
import { analyze, type FieldStat } from "@/lib/forms/analytics";
import { nounFor, num, peso, plural } from "@/lib/forms/format";
import { STATUS_LABEL, STATUSES } from "@/lib/forms/review";
import type { FormItem, SentResponse, FormsDesk } from "@/lib/governance/hub-types";
import { FormArt } from "./art";

const MONTH = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const monthLabel = (m: string) => MONTH.format(new Date(`${m}-01T00:00:00Z`));
const dayShort = (d: string) => DAY.format(new Date(`${d}T00:00:00Z`));
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

/** Horizontal bars, one series: each row a label, an ink bar from the baseline, and its value at the tip. */
function HBars({ rows, of, unit = "", money = false }: { rows: { key: string; label: React.ReactNode; text: string; value: number }[]; of?: number; unit?: string; money?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="fm-hbars">
      {rows.map((r) => (
        <li key={r.key} className="fm-hbars__row" title={`${r.text}: ${money ? peso(r.value) : num(r.value)}${of ? ` (${pct(r.value, of)}%)` : ""}`}>
          <span className="fm-hbars__label">{r.label}</span>
          <span className="fm-hbars__track">
            <span className="fm-hbars__bar" style={{ width: `${(r.value / max) * 100}%` }} data-zero={r.value ? undefined : ""} />
            <span className="fm-hbars__value">
              {money ? peso(r.value, true) : num(r.value)}
              {unit}
              {of ? <em>{pct(r.value, of)}%</em> : null}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Columns over time, one series, the tallest labelled; each column's count on hover and in the hidden table. */
function Columns({ data, caption }: { data: { key: string; label: string; value: number }[]; caption: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const top = data.reduce((best, d) => (d.value > best.value ? d : best), data[0] ?? { key: "", label: "", value: 0 });
  return (
    <figure className="fm-cols">
      <div className="fm-cols__plot" aria-hidden="true">
        {data.map((d) => (
          <span key={d.key} className="fm-cols__col" title={`${d.label}: ${plural(d.value, "response")}`}>
            {d.value > 0 && d.key === top.key && <span className="fm-cols__top">{num(d.value)}</span>}
            <span className="fm-cols__bar" style={{ height: `${(d.value / max) * 100}%` }} data-zero={d.value ? undefined : ""} />
          </span>
        ))}
      </div>
      <figcaption className="fm-cols__axis" aria-hidden="true">
        <span>{data[0]?.label}</span>
        <span>{data.at(-1)?.label}</span>
      </figcaption>
      <table className="sr-only">
        <caption>{caption}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.label}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Part to whole in one bar, a 2px gap between parts, with a legend that writes every value. */
function Split({ parts, money = false }: { parts: { key: string; label: string; value: number; tone: string }[]; money?: boolean }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div className="fm-split2">
      <span className="fm-split2__bar" aria-hidden="true">
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <i key={p.key} data-tone={p.tone} style={{ flexGrow: p.value }} title={`${p.label}: ${money ? peso(p.value) : num(p.value)}`} />
          ))}
      </span>
      <ul className="fm-legend">
        {parts.map((p) => (
          <li key={p.key} data-tone={p.tone}>
            <i aria-hidden="true" />
            <span>{p.label}</span>
            <b>{money ? peso(p.value, true) : num(p.value)}</b>
            <em>{pct(p.value, total)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Card({ stat, children, wide = false }: { stat: FieldStat; children: React.ReactNode; wide?: boolean }) {
  return (
    <section className={`fm-acard${wide ? " fm-acard--wide" : ""}`} aria-labelledby={`stat-${stat.id}`}>
      <header className="fm-acard__head">
        <h4 id={`stat-${stat.id}`}>{stat.label}</h4>
        <span>
          {stat.answered} of {stat.shown} answered
        </span>
      </header>
      {stat.answered ? children : <p className="fm-acard__none">No answers yet</p>}
    </section>
  );
}

/** The answers in words of a section, as how many people gave them, and the latest of each on hover. */
function Written({ stats }: { stats: FieldStat[] }) {
  return (
    <section className="fm-acard fm-acard--written" aria-label="Answers in words">
      <header className="fm-acard__head">
        <h4>Answers in words</h4>
        <span>Read them in Responses</span>
      </header>
      <ul className="fm-written">
        {stats.map((s) => (
          <li key={s.id} title={s.kind === "text" && s.latest[0] ? `Latest: ${s.latest[0]}` : undefined}>
            <Icon name="quote" size={14} />
            <span className="fm-written__label">{s.label}</span>
            <span className="fm-written__meter" aria-hidden="true">
              <i style={{ width: `${s.shown ? (s.answered / s.shown) * 100 : 0}%` }} />
            </span>
            <b>
              {s.answered} of {s.shown}
            </b>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatCard({ stat }: { stat: FieldStat }) {
  const { sdgNames, sdgIcons } = useViews();
  switch (stat.kind) {
    case "bars": {
      const rows = stat.bars.length > 2 ? [...stat.bars].sort((a, b) => b.count - a.count) : stat.bars;
      return (
        <Card stat={stat}>
          <HBars rows={rows.slice(0, 10).map((b) => ({ key: b.key, label: b.label, text: b.label, value: b.count }))} of={stat.answered} />
        </Card>
      );
    }
    case "sdgs":
      return (
        <Card stat={stat}>
          <HBars
            rows={stat.sdgs.map((s) => ({
              key: String(s.n),
              text: `SDG ${s.n} ${sdgNames[s.n] ?? ""}`,
              label: (
                <span className="fm-hbars__sdg">
                  <img src={sdgIcons[s.n]} alt="" width={466} height={466} loading="lazy" />
                  <span>
                    <b>SDG {s.n}</b> {sdgNames[s.n]}
                  </span>
                </span>
              ),
              value: s.count,
            }))}
            of={stat.answered}
          />
        </Card>
      );
    case "numbers":
      return (
        <Card stat={stat}>
          <div className="fm-figs">
            <span>
              <em>{stat.money ? "Total" : "Sum"}</em>
              <b>{stat.money ? peso(stat.sum, true) : num(stat.sum)}</b>
            </span>
            <span>
              <em>Average</em>
              <b>{stat.money ? peso(stat.mean, true) : num(stat.mean)}</b>
            </span>
            <span>
              <em>Range</em>
              <b>
                {stat.money ? peso(stat.min, true) : num(stat.min)}–{stat.money ? peso(stat.max, true) : num(stat.max)}
              </b>
            </span>
          </div>
        </Card>
      );
    case "counts":
      return (
        <Card stat={stat}>
          <p className="fm-acard__fig">
            <b>{num(stat.sum)}</b> in all
          </p>
          <HBars rows={[...stat.rows].sort((a, b) => b.sum - a.sum).map((r) => ({ key: r.id, label: r.label, text: r.label, value: r.sum }))} of={stat.sum} />
        </Card>
      );
    case "budget": {
      // The first source is what the office funds: it leads in gold, the counterparts follow in grey. A theoretical
      // value funds nothing, so it has no lead.
      const tones = stat.theoretical ? ["ink", "soft", "soft"] : ["lead", "ink", "soft", "soft"];
      return (
        <Card stat={stat} wide>
          <div className="fm-figs">
            <span>
              <em>{stat.theoretical ? "Theoretical value" : "Total budgeted"}</em>
              <b>{peso(stat.sum, true)}</b>
            </span>
            <span>
              <em>Average per response</em>
              <b>{peso(stat.mean, true)}</b>
            </span>
            {!stat.theoretical && stat.sources[0] && (
              <span>
                <em>{stat.sources[0].label} requested</em>
                <b>{peso(stat.sources[0].sum, true)}</b>
              </span>
            )}
          </div>
          <Split money parts={stat.sources.map((s, i) => ({ key: s.id, label: s.label, value: s.sum, tone: tones[i] ?? "soft" }))} />
          {stat.categories.length > 1 && <HBars money rows={[...stat.categories].sort((a, b) => b.sum - a.sum).map((c) => ({ key: c.id, label: c.label, text: c.label, value: c.sum }))} />}
        </Card>
      );
    }
    case "dates":
      return (
        <Card stat={stat}>
          <HBars rows={stat.months.map((m) => ({ key: m.month, label: monthLabel(m.month), text: monthLabel(m.month), value: m.count }))} of={stat.answered} />
        </Card>
      );
    case "text":
      // Answers in words are summed up together, per section (Written below).
      return null;
    case "rows":
      return (
        <Card stat={stat}>
          <p className="fm-acard__fig">
            <b>{num(stat.items)}</b> {nounFor(stat.items, stat.noun)}
            {stat.answered > 0 && <em> · {num(Math.round((stat.items / stat.answered) * 10) / 10)} each on average</em>}
          </p>
          {stat.columns.map((c) => (
            <div key={c.id} className="fm-acard__sub">
              <h5>{c.label}</h5>
              <HBars rows={c.bars.map((b) => ({ key: b.key, label: b.label, text: b.label, value: b.count }))} of={stat.items} />
            </div>
          ))}
        </Card>
      );
  }
}

export function FormAnalytics({ form, desk, responses, onCopy }: { form: FormItem; desk: FormsDesk; responses: SentResponse[] | null; onCopy: () => void }) {
  const stats = useMemo(() => (responses ? analyze(form.schema, responses, { units: desk.units }) : null), [form.schema, responses, desk.units]);
  const reviewed = (form.schema.review?.stages.length ?? 0) > 0;

  if (!stats)
    return (
      <div className="fm-loading" role="status">
        <span className="fm-loading__bar" />
        Loading analytics
      </div>
    );

  if (!stats.total)
    return (
      <div className="ws-empty fm-empty">
        <span className="ws-empty__art">
          <FormArt kind={form.kind} size="lg" />
        </span>
        <p className="ws-empty__title">{form.copies ? "Analytics start with the first copy sent" : "Analytics start with the first response"}</p>
        {form.status === "open" && (
          <button type="button" className="btn btn--dark" onClick={onCopy}>
            <Icon name="copy" size={16} /> Copy responder link
          </button>
        )}
      </div>
    );

  const sections = form.schema.sections.map((s) => ({ section: s, stats: stats.fields.filter((f) => f.section === s.id) })).filter((g) => g.stats.length);
  const written = (list: FieldStat[]) => list.filter((f) => f.kind === "text");
  const waiting = stats.statuses.received + stats.statuses["in-review"];

  return (
    <div className="fm-analytics">
      <section className="fm-acard fm-acard--hero" aria-label="Responses over time">
        <div className="fm-hero">
          <span className="fm-hero__label">{form.copies ? "Sent" : "Responses"}</span>
          <span className="fm-hero__value">{num(stats.total)}</span>
          <span className="fm-hero__sub">{stats.week ? `${num(stats.week)} in the last 7 days` : "None in the last 7 days"}</span>
        </div>
        <Columns caption="Responses a day, the last 30 days" data={stats.days.map((d) => ({ key: d.day, label: dayShort(d.day), value: d.count }))} />
      </section>

      {reviewed && (
        <section className="fm-acard fm-acard--status" aria-labelledby="stat-status">
          <header className="fm-acard__head">
            <h4 id="stat-status">Review</h4>
            <span>{waiting ? `${num(waiting)} waiting` : "Nothing waiting"}</span>
          </header>
          <Split parts={STATUSES.map((s) => ({ key: s, label: STATUS_LABEL[s], value: stats.statuses[s], tone: s }))} />
        </section>
      )}

      {sections.map(({ section, stats: list }) => (
        <div key={section.id} className="fm-analytics__group">
          <h3 className="fm-analytics__title">{section.title}</h3>
          <div className="fm-analytics__grid">
            {list
              .filter((s) => s.kind !== "text")
              .map((s) => (
                <StatCard key={s.id} stat={s} />
              ))}
            {written(list).length > 0 && <Written stats={written(list)} />}
          </div>
        </div>
      ))}
    </div>
  );
}
