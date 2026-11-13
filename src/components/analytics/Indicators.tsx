"use client";

/*
 * A ranking's Indicators tab: the evidence warehouse the Office's procedures ask for. One edition at a time, every
 * indicator with its value, points, state and readiness; a row opens its panel to enter the University's figure,
 * review each unit's, link and assess evidence, and see the formula, bands and checks behind its points. WURI
 * editions add their cases and rubric reviews; results-only editions their published results.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { download, Hint } from "@/components/command-control/ui";
import { Icon } from "@/components/ui/Icon";
import { Drawer, TabPanel, Tabs } from "@/components/ui/interactive";
import { NumberField, Select } from "@/components/ui/pickers";
import { SearchField } from "@/components/ui/search-field";
import { Sheet } from "@/components/workspace/parts";
import { exportIndicators } from "@/app/actions/analytics-admin";
import { addLink, assessLink, deleteCase, removeLink, reviewCase, reviewValue, saveBenchmark, saveCase, saveValue } from "@/app/actions/analytics";
import type { ContributionView, IndicatorView, IndicatorsDesk } from "@/lib/analytics/desk-types";
import { count, day, num, pct, pts } from "@/lib/analytics/format";
import { levelOf } from "@/lib/analytics/rules";
import type { Value } from "@/lib/analytics/types";
import { enterable } from "@/lib/analytics/values";
import { BandScale, EmptyState, LinkLine, MoreRow, PointsBar, PointsKey, ReadyRing, StatePill, ValueField, useMore, useRun } from "./parts";

type View = "indicators" | "checks" | "cases" | "results";

const RULE_LABEL: Record<string, string> = {
  bands: "Banded value",
  choice: "Chosen level",
  claim: "Evidence question",
  ratio: "Proportion (normalised by the body)",
  external: "Measured by the body",
  dated: "Target date",
  rubric: "Reviewed cases",
};

export function Indicators({ desk }: { desk: IndicatorsDesk }) {
  const router = useRouter();
  const params = useSearchParams();
  const { run, pending } = useRun();
  const hasCases = desk.rows.some((r) => r.input.type === "cases");
  const hasResults = desk.rows.some((r) => r.input.type === "result");
  const views: { key: View; label: string; count?: number; countTone?: "alert" }[] = [
    { key: "indicators", label: "Indicators" },
    { key: "checks", label: "Checks", count: desk.issues.filter((i) => i.level !== "info").length || undefined, countTone: desk.issues.some((i) => i.level === "error") ? "alert" : undefined },
    ...(hasCases ? [{ key: "cases" as const, label: "Cases", count: desk.cases.length || undefined }] : []),
    ...(hasResults ? [{ key: "results" as const, label: "Results" }] : []),
  ];
  const initial = (params.get("view") as View) ?? "indicators";
  const [view, setView] = useState<View>(views.some((v) => v.key === initial) ? initial : "indicators");
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("");
  const [state, setState] = useState("");
  const [open, setOpen] = useState<string | null>(params.get("code"));
  useEffect(() => setOpen(params.get("code")), [params]);

  const groupName = (code: string) => desk.groups.find((g) => g.code === code)?.name ?? code;
  const term = q.trim().toLowerCase();
  const rows = useMemo(
    () =>
      desk.rows.filter(
        (r) =>
          (!group || r.group === group) &&
          (!state || r.state === state) &&
          (!term || [r.code, r.ref ?? "", r.name, r.valueText, ...r.owners.map((o) => o.name), ...r.ownerLabels].some((x) => x.toLowerCase().includes(term))),
      ),
    [desk.rows, group, state, term],
  );
  const { limit, showMore } = useMore(`${group}|${state}|${term}`);
  const current = open ? desk.rows.find((r) => r.code === open) ?? null : null;
  const setCode = (code: string | null) => {
    setOpen(code);
    const u = new URLSearchParams(params.toString());
    if (code) u.set("code", code);
    else u.delete("code");
    history.replaceState(null, "", `${location.pathname}?${u.toString()}${location.hash}`);
  };
  const t = desk.total;

  return (
    <div className="an">
      <div className="an-top">
        <label className="an-top__edition">
          <span className="sr-only">Edition</span>
          <Select className="select" value={desk.edition.id} onChange={(v) => router.push(`/admin/rankings/${desk.edition.ranking}?edition=${v}#indicators`)} aria-label="Edition">
            {desk.editions.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
                {e.status !== "Active" ? ` (${e.status.toLowerCase()})` : ""}
              </option>
            ))}
          </Select>
        </label>
        <div className="an-top__figs">
          <span className="an-top__total">
            {t.kind === "results" ? `${t.claimed} ranked` : t.kind === "readiness" ? pct(t.claimed) : `${pts(t.claimed)} / ${pts(t.max)}`}
            <span>{t.label}</span>
          </span>
          {t.kind !== "results" && t.kind !== "readiness" && (
            <span className="an-top__total an-top__total--quiet">
              {pts(t.secured)}
              <span>secured</span>
            </span>
          )}
          <ReadyRing value={desk.readiness} size={46} />
        </div>
        {desk.can.export && (
          <button
            type="button"
            className="btn btn--sm"
            disabled={pending}
            onClick={async () => {
              const r = await run(() => exportIndicators({ edition: desk.edition.id }));
              if (r.ok && r.data) download(r.data.name, r.data.text);
            }}
          >
            <Icon name="download" size={15} /> CSV
          </button>
        )}
      </div>

      <Tabs
        tabs={views}
        value={view}
        onChange={setView}
        label="Indicator views"
        idBase="an-ind"
        actions={
          view === "indicators" && (
            <>
              <span className="an-filter">
                <Select className="select select--sm" value={group} onChange={setGroup} aria-label="Group" placeholder="All groups">
                  <option value="">All groups</option>
                  {desk.groups.map((g) => (
                    <option key={g.code} value={g.code}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              </span>
              <span className="an-filter">
                <Select className="select select--sm" value={state} onChange={setState} aria-label="State" placeholder="Every state">
                  <option value="">Every state</option>
                  {["Not started", "For review", "Needs revision", "Validated", "Not applicable"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </span>
            </>
          )
        }
        search={view === "indicators" ? <SearchField value={q} onChange={setQ} placeholder="Search indicators" label="Search indicators" examples={["Search by code, like EC4", "Search by unit", "Search by name"]} shortcuts /> : undefined}
      />

      <TabPanel idBase="an-ind" index={views.findIndex((v) => v.key === view)} className="tabpanel">
        {view === "indicators" && (
          <div className="ws-card">
            <table className="ws-table an-table">
              <caption className="sr-only">{desk.edition.label} indicators</caption>
              <thead>
                <tr>
                  <th scope="col">Indicator</th>
                  <th scope="col" className="an-col-value">Value</th>
                  <th scope="col" className="an-col-points">
                    Points <PointsKey />
                  </th>
                  <th scope="col" className="an-col-state">State</th>
                  <th scope="col" className="an-col-ready">Ready</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((r) => (
                  <tr key={r.code} className="ws-row an-click" onClick={() => setCode(r.code)}>
                    <td>
                      <button type="button" className="an-ind" onClick={(e) => (e.stopPropagation(), setCode(r.code))}>
                        <span className="an-ind__code">{r.ref ?? r.code}</span>
                        <span className="an-ind__name">{r.name}</span>
                        <span className="an-ind__sub">
                          {group ? "" : `${groupName(r.group)} · `}
                          {r.owners.length ? r.owners.map((o) => o.code || o.name).join(", ") : r.ownerLabels[0] ?? "No unit"}
                          {r.contributions.length ? ` · ${count(r.contributions.length, "unit")} answered` : ""}
                        </span>
                      </button>
                    </td>
                    <td className="an-col-value">{r.valueText || (r.computed !== null ? num(r.computed) : <span className="an-dash">—</span>)}</td>
                    <td className="an-col-points">{r.points ? <PointsBar points={r.points} /> : <span className="an-dash">{r.rule === null && r.input.type !== "none" ? "Input" : "—"}</span>}</td>
                    <td className="an-col-state">
                      <StatePill state={r.state} />
                    </td>
                    <td className="an-col-ready">
                      <ReadyRing value={r.readiness} size={34} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <MoreRow shown={limit} total={rows.length} onMore={showMore} />
            {!rows.length && (
              <div className="ws-none">
                <p>No indicators match.</p>
                <button type="button" className="btn btn--sm" onClick={() => (setQ(""), setGroup(""), setState(""))}>
                  Show all
                </button>
              </div>
            )}
          </div>
        )}

        {view === "checks" && <Checks desk={desk} onOpen={(c) => (setView("indicators"), setCode(c))} />}
        {view === "cases" && <Cases desk={desk} />}
        {view === "results" && <Results desk={desk} />}
      </TabPanel>

      <Drawer open={!!current} onClose={() => setCode(null)} eyebrow={current ? `${groupName(current.group)} · ${current.ref ?? current.code}` : ""} title={current?.name ?? ""}>
        {current && <Panel key={current.code} row={current} desk={desk} />}
      </Drawer>
    </div>
  );
}

function Checks({ desk, onOpen }: { desk: IndicatorsDesk; onOpen: (code: string) => void }) {
  const levels = [
    { key: "error", label: "Errors", icon: "alert" as const },
    { key: "warn", label: "Warnings", icon: "info" as const },
    { key: "info", label: "Notes", icon: "info" as const },
  ];
  return (
    <div className="an-checks">
      <section className="an-card">
        <h2 className="an-h2">Worth most</h2>
        {desk.fixes.length ? (
          <ol className="an-fixlist">
            {desk.fixes.slice(0, 25).map((f) => (
              <li key={`${f.code}-${f.kind}`}>
                <button type="button" className="an-fixlist__btn" onClick={() => onOpen(f.code)}>
                  <span>{f.title}</span>
                  <span className="an-gain">+{pts(f.gain)}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="an-muted">Nothing left to add.</p>
        )}
      </section>
      <section className="an-card">
        <h2 className="an-h2">Data checks</h2>
        {desk.issues.length ? (
          levels.map((l) => {
            const list = desk.issues.filter((i) => i.level === l.key);
            if (!list.length) return null;
            return (
              <div key={l.key} className={`an-issuegroup an-issuegroup--${l.key}`}>
                <p className="an-subhead">
                  <Icon name={l.icon} size={14} /> {l.label} · {list.length}
                </p>
                <ul>
                  {list.map((i, k) => (
                    <li key={k}>
                      {i.code ? (
                        <button type="button" className="an-linkbtn" onClick={() => onOpen(i.code!)}>
                          {i.text}
                        </button>
                      ) : (
                        i.text
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        ) : (
          <p className="an-muted">No problems found.</p>
        )}
      </section>
    </div>
  );
}

/* ---------- The indicator's panel ---------- */

function Panel({ row, desk }: { row: IndicatorView; desk: IndicatorsDesk }) {
  const { run, pending } = useRun();
  const office = row.office;
  // The Office's own answer, if it has one; the units' answer is offered, not assumed (saved, it would outrank theirs).
  const [value, setValue] = useState<Value>(office?.value ?? {});
  const fromUnits = !office && row.contributions.length > 0 && row.valueText ? row.value : null;
  const [note, setNote] = useState(office?.note ?? "");
  const canEnter = desk.can.edit && enterable(row);
  const edition = desk.edition.id;
  const save = (extra: { notApplicable?: boolean } = {}) => run(() => saveValue({ edition, code: row.code, value, note, ...extra }));
  const reads = row.reads?.map((c) => desk.rows.find((r) => r.code === c)).filter((r): r is IndicatorView => !!r) ?? [];

  return (
    <div className="an-panel">
      <div className="an-panel__score">
        <div>
          <StatePill state={row.state} />
          {row.rule && <span className="an-panel__rule">{RULE_LABEL[row.rule]}</span>}
        </div>
        {row.points && <PointsBar points={row.points} />}
        {row.computed !== null && (
          <p className="an-panel__computed">
            {num(row.computed)}
            {row.unit ? ` ${row.unit}` : ""}
            {row.band?.next && (
              <span className="an-panel__next">
                Next band: {row.input.type === "choice" ? row.input.options.find((o) => o.key === row.band!.next!.label)?.label : row.band.next.label} (+{pts(row.band.next.gain)})
              </span>
            )}
          </p>
        )}
      </div>

      {row.guidance && (
        <details className="cmd-disclosure an-guidance">
          <summary>
            <span className="cmd-disclosure__title">What the body asks</span>
            <Icon name="chevron-down" size={16} className="cmd-disclosure__chev" />
          </summary>
          <div className="cmd-disclosure__body">
            <p className="an-pre">{row.guidance}</p>
            {row.evidence.note && <p className="an-pre">{row.evidence.note}</p>}
          </div>
        </details>
      )}

      {row.formula && (
        <section className="an-sec">
          <h3 className="an-h3">Formula</h3>
          <code className="an-formula">{row.formula}</code>
          {reads.length > 0 && (
            <ul className="an-reads">
              {reads.map((r) => (
                <li key={r.code}>
                  <span className="an-ind__code">{r.ref ?? r.code}</span> {r.name}
                  <b>{r.valueText || (r.computed !== null ? num(r.computed) : "—")}</b>
                </li>
              ))}
            </ul>
          )}
          {row.bands && <BandScale bands={row.bands} hit={row.band} />}
        </section>
      )}
      {row.shares && row.rule !== "claim" && (
        <section className="an-sec">
          <h3 className="an-h3">Levels</h3>
          <BandScale bands={row.shares.map((s) => ({ label: s.label, share: s.share }))} hit={row.band ? { label: row.input.type === "choice" ? row.input.options.find((o) => o.key === row.band!.label)?.label ?? row.band.label : row.band.label, share: row.band.share, ...(row.band.next && { next: { ...row.band.next, label: row.input.type === "choice" ? row.input.options.find((o) => o.key === row.band!.next!.label)?.label ?? row.band.next.label : row.band.next.label } }) } : null} />
        </section>
      )}

      {canEnter && (
        <section className="an-sec">
          <h3 className="an-h3">
            University’s figure <Hint text="The Office’s own answer for the University. Units’ answers are below; the Office’s figure, when there is one, is the one that counts." />
          </h3>
          {(row.suggested.length > 0 || fromUnits) && (
            <div className="an-suggest">
              {fromUnits && (
                <button type="button" className="chip chip--outline" onClick={() => setValue(fromUnits)}>
                  Use {row.valueText} <span className="an-muted">· units’ answer</span>
                </button>
              )}
              {row.suggested.map((s) => (
                <button key={s.from} type="button" className="chip chip--outline" onClick={() => setValue(row.input.type === "number" ? { num: s.value } : value)}>
                  Use {num(s.value)} <span className="an-muted">· {s.from}</span>
                </button>
              ))}
            </div>
          )}
          <form
            className="an-form"
            onSubmit={async (e) => {
              e.preventDefault();
              await save();
            }}
          >
            <ValueField id={`v-${row.code}`} input={row.input} value={value} onChange={setValue} unit={row.unit} evidence={row.evidence} disabled={pending} />
            <label className="an-field">
              <span>Note</span>
              <textarea className="textarea" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Source, method, or what the figure covers" />
            </label>
            <div className="an-actions">
              <button type="button" className="btn btn--ghost" disabled={pending} onClick={() => void save({ notApplicable: true })}>
                Not applicable
              </button>
              <button type="submit" className="btn btn--dark" disabled={pending}>
                Save
              </button>
            </div>
          </form>
        </section>
      )}

      {(office || row.contributions.length > 0) && (
        <section className="an-sec">
          <h3 className="an-h3">Answers</h3>
          <ul className="an-contribs">
            {[...(office ? [office] : []), ...row.contributions].map((c) => (
              <Contribution key={c.id} c={c} canValidate={desk.can.validate} />
            ))}
          </ul>
        </section>
      )}

      {row.input.type !== "result" && row.input.type !== "cases" && (row.evidence.required || row.links.length > 0) && <Evidence row={row} desk={desk} />}

      <section className="an-sec">
        <h3 className="an-h3">Checks</h3>
        <ul className="an-checklist">
          {row.checks.map((c) => (
            <li key={c.key} className={c.ok ? "is-ok" : "is-open"}>
              <Icon name={c.ok ? "check-circle" : "x-circle"} size={15} />
              {c.label}
              {!c.ok && c.gain ? <span className="an-gain">+{pts(c.gain)}</span> : null}
            </li>
          ))}
        </ul>
        <p className="an-muted">
          Owners: {[...row.owners.map((o) => o.name), ...row.ownerLabels].join(", ") || "none yet"}
          {row.updatedAt ? ` · updated ${day(row.updatedAt)}` : ""}
        </p>
      </section>
    </div>
  );
}

function Contribution({ c, canValidate }: { c: ContributionView; canValidate: boolean }) {
  const { run, pending } = useRun();
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  return (
    <li className="an-contrib">
      <div className="an-contrib__head">
        <span className="an-contrib__who">{c.unit ? c.unitName : "Office"}</span>
        <StatePill state={c.status === "Draft" ? "Not started" : (c.status as "Validated")} label={c.status} />
      </div>
      <p className="an-contrib__value">{c.text || "No answer"}</p>
      {c.note && <p className="an-muted">{c.note}</p>}
      {c.reviewNote && <p className="an-contrib__review">Office: {c.reviewNote}</p>}
      <p className="an-contrib__meta">
        {c.by} · {day(c.at)}
        {c.source === "import" ? " · imported" : ""}
        {c.reviewedBy ? ` · reviewed by ${c.reviewedBy}` : ""}
      </p>
      {canValidate && c.status !== "Draft" && (
        <div className="an-actions an-actions--start">
          {c.status !== "Validated" && (
            <button type="button" className="btn btn--sm btn--dark" disabled={pending} onClick={() => void run(() => reviewValue({ id: c.id, decision: "validate" }))}>
              <Icon name="check" size={14} /> Validate
            </button>
          )}
          {c.unit && c.status !== "Needs revision" && (
            <button type="button" className="btn btn--sm" disabled={pending} onClick={() => setReturning((v) => !v)}>
              Return
            </button>
          )}
          {c.status !== "For review" && (
            <button type="button" className="btn btn--sm btn--ghost" disabled={pending} onClick={() => void run(() => reviewValue({ id: c.id, decision: "reopen" }))}>
              Reopen
            </button>
          )}
        </div>
      )}
      {returning && (
        <form
          className="an-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() => reviewValue({ id: c.id, decision: "return", note }));
            if (r.ok) setReturning(false);
          }}
        >
          <textarea className="textarea" rows={2} required maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What needs changing" data-missing="Say what needs changing." />
          <div className="an-actions">
            <button type="submit" className="btn btn--sm btn--dark" disabled={pending}>
              Send back
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

function Evidence({ row, desk }: { row: IndicatorView; desk: IndicatorsDesk }) {
  const { run, pending } = useRun();
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [year, setYear] = useState<number>(NaN);
  const [record, setRecord] = useState("");
  const [isPublic, setPublic] = useState<"" | "yes" | "no">("");
  return (
    <section className="an-sec">
      <h3 className="an-h3">
        Evidence <Hint text="One self-contained file or page per link. THE reads no folders or pages of links, and counts a point for public evidence." />
      </h3>
      {row.links.length > 0 ? (
        <ul className="an-links">
          {row.links.map((l) => (
            <LinkLine
              key={l.id}
              link={l}
              actions={
                desk.can.edit && (
                  <span className="an-assess">
                    <Select className="select select--sm" value={l.relevance ?? ""} onChange={(v) => void run(() => assessLink({ id: l.id, relevance: (v || null) as "specific" | null }))} aria-label="Relevance" placeholder="Not assessed">
                      <option value="">Not assessed</option>
                      <option value="specific">Specific</option>
                      <option value="general">General</option>
                      <option value="not relevant">Not relevant</option>
                    </Select>
                    <button type="button" className={`an-toggle${l.public ? " is-on" : ""}`} aria-pressed={!!l.public} disabled={pending} onClick={() => void run(() => assessLink({ id: l.id, public: !l.public }))}>
                      Public
                    </button>
                    <button type="button" className="btn btn--icon btn--sm btn--ghost" aria-label="Remove link" disabled={pending} onClick={() => void run(() => removeLink({ id: l.id }))}>
                      <Icon name="trash" size={14} />
                    </button>
                  </span>
                )
              }
            />
          ))}
        </ul>
      ) : (
        <p className="an-muted">No evidence linked yet.</p>
      )}
      {desk.can.edit && (
        <form
          className="an-form an-addlink"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() => addLink({ edition: desk.edition.id, code: row.code, ...(record ? { evidenceId: record } : { url }), label, ...(Number.isFinite(year) && { year }), ...(isPublic && { public: isPublic === "yes" }) }));
            if (r.ok) {
              setUrl("");
              setLabel("");
              setRecord("");
              setYear(NaN);
            }
          }}
        >
          {desk.evidence.length > 0 && (
            <Select className="select" value={record} onChange={setRecord} searchable placeholder="Link a web address instead" aria-label="Evidence record">
              <option value="">Link a web address instead</option>
              {desk.evidence.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title} · {e.unitName}
                </option>
              ))}
            </Select>
          )}
          {!record && <input className="input" type="url" required placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Web address" data-missing="Paste the evidence's web address." />}
          <div className="an-row3">
            <input className="input" maxLength={300} placeholder="What it shows" value={label} onChange={(e) => setLabel(e.target.value)} aria-label="Label" />
            <NumberField value={year} onChange={setYear} min={1990} max={2100} allowEmpty aria-label="Year" />
            <Select className="select" value={isPublic} onChange={(v) => setPublic(v as "" | "yes" | "no")} aria-label="Public" placeholder="Public?">
              <option value="">Public?</option>
              <option value="yes">Public</option>
              <option value="no">Not public</option>
            </Select>
          </div>
          <div className="an-actions">
            <button type="submit" className="btn btn--sm btn--dark" disabled={pending}>
              <Icon name="link" size={14} /> Link
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/* ---------- WURI cases ---------- */

function Cases({ desk }: { desk: IndicatorsDesk }) {
  const { run, pending } = useRun();
  const categories = desk.rows.filter((r) => r.input.type === "cases");
  const [scoring, setScoring] = useState<IndicatorsDesk["cases"][number] | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ category: categories[0]?.code ?? "", title: "", unit: "", abstract: "" });
  const criteria = categories[0]?.criteria ?? [];
  const [scores, setScores] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  return (
    <div className="an-cases">
      <div className="an-casegrid">
        {categories.map((c) => {
          const list = desk.cases.filter((x) => x.category === c.code);
          const best = Math.max(0, ...list.map((x) => x.average ?? 0));
          return (
            <section key={c.code} className={`an-cat${list.length ? "" : " is-empty"}`}>
              <header>
                <span className="an-ind__code">{c.code}</span>
                <span className="an-cat__name">{c.name}</span>
                {list.length > 0 && <span className="an-cat__best">{best ? `${Math.round(best)}` : "—"}</span>}
              </header>
              {list.length ? (
                <ul>
                  {list.map((x) => (
                    <li key={x.id}>
                      <button type="button" className="an-case" onClick={() => (setScoring(x), setScores(x.mine?.scores ?? {}), setNote(x.mine?.note ?? ""))}>
                        <span className="an-case__title">{x.title}</span>
                        <span className="an-case__meta">
                          {x.reviews.length ? `${x.average} avg · ${x.reviews.length} ${x.reviews.length === 1 ? "review" : "reviews"}` : "Not reviewed"}
                          {x.checks.some((k) => !k.ok) ? ` · ${x.checks.filter((k) => !k.ok).length} gaps` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="an-muted">No case yet.</p>
              )}
            </section>
          );
        })}
      </div>
      {desk.can.edit && (
        <div className="an-actions an-actions--start">
          <button type="button" className="btn" onClick={() => setAdding(true)}>
            <Icon name="plus" size={15} /> Add a case
          </button>
        </div>
      )}

      {adding && (
        <Sheet title="New case" onClose={() => setAdding(false)}>
          {(close) => (
            <form
              className="ws-sheet__body"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await run(() => saveCase({ edition: desk.edition.id, ...draft, unit: draft.unit || undefined }));
                if (r.ok) close();
              }}
            >
              <label className="an-field">
                <span>Programme</span>
                <input className="input" required maxLength={300} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
              </label>
              <label className="an-field">
                <span>Category</span>
                <Select className="select" value={draft.category} onChange={(v) => setDraft({ ...draft, category: v })} searchable>
                  {categories.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} {c.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="an-field">
                <span>Unit</span>
                <Select className="select" value={draft.unit} onChange={(v) => setDraft({ ...draft, unit: v })} searchable placeholder="No unit">
                  <option value="">No unit</option>
                  {desk.units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="an-field">
                <span>Abstract</span>
                <textarea className="textarea" rows={5} maxLength={4000} value={draft.abstract} onChange={(e) => setDraft({ ...draft, abstract: e.target.value })} />
              </label>
              <footer className="ws-sheet__foot">
                <button type="button" className="btn" onClick={close}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--dark" disabled={pending}>
                  Add
                </button>
              </footer>
            </form>
          )}
        </Sheet>
      )}

      {scoring && (
        <Sheet title={scoring.title} onClose={() => setScoring(null)} className="an-sheet--wide">
          {(close) => (
            <form
              className="ws-sheet__body"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await run(() => reviewCase({ caseId: scoring.id, scores, note }));
                if (r.ok) close();
              }}
            >
              {scoring.abstract && <p className="ws-sheet__text an-clamp">{scoring.abstract}</p>}
              {scoring.checks.length > 0 && (
                <ul className="an-checklist">
                  {scoring.checks.map((k) => (
                    <li key={k.label} className={k.ok ? "is-ok" : "is-open"}>
                      <Icon name={k.ok ? "check-circle" : "x-circle"} size={15} />
                      {k.label}
                    </li>
                  ))}
                </ul>
              )}
              <div className="an-rubric">
                {criteria.map((c) => (
                  <label key={c.key} className="an-rubric__row">
                    <span className="an-rubric__label">
                      {c.label}
                      <span className="an-muted"> · {c.group}</span>
                    </span>
                    <NumberField value={scores[c.key] ?? 0} onChange={(n) => setScores({ ...scores, [c.key]: Number.isFinite(n) ? n : 0 })} min={0} max={c.max} aria-label={c.label} />
                    <span className="an-rubric__level" data-tip={c.levels.find((l) => l.label === levelOf(c, scores[c.key] ?? 0))?.hint}>
                      {levelOf(c, scores[c.key] ?? 0)} / {c.max}
                    </span>
                  </label>
                ))}
                <p className="an-rubric__total">
                  Total <b>{criteria.reduce((s, c) => s + Math.min(c.max, scores[c.key] ?? 0), 0)}</b> of {criteria.reduce((s, c) => s + c.max, 0)}
                </p>
              </div>
              <label className="an-field">
                <span>Note</span>
                <textarea className="textarea" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              {scoring.reviews.length > 0 && (
                <p className="an-muted">
                  Reviews: {scoring.reviews.map((r) => `${r.reviewerName} ${r.total}`).join(" · ")}
                </p>
              )}
              <footer className="ws-sheet__foot">
                <button
                  type="button"
                  className="btn btn--ghost an-left"
                  disabled={pending}
                  onClick={async () => {
                    const r = await run(() => deleteCase({ id: scoring.id }));
                    if (r.ok) close();
                  }}
                >
                  <Icon name="trash" size={15} /> Remove
                </button>
                <button type="button" className="btn" onClick={close}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--dark" disabled={pending || !desk.can.edit}>
                  Save score
                </button>
              </footer>
            </form>
          )}
        </Sheet>
      )}
    </div>
  );
}

/* ---------- Published results (results-only editions) ---------- */

const RESULT_PARTS = [
  { key: "rank", label: "Rank", text: true },
  { key: "overall", label: "Overall" },
  { key: "academic-reputation", label: "Academic" },
  { key: "employer-reputation", label: "Employer" },
  { key: "citations-per-paper", label: "Citations" },
  { key: "h-index", label: "H-index" },
  { key: "international-research-network", label: "IRN" },
];

function Results({ desk }: { desk: IndicatorsDesk }) {
  const { run, pending } = useRun();
  const subjects = desk.rows.filter((r) => r.input.type === "result");
  const years = [...new Set(desk.results.map((r) => r.year))].sort((a, b) => b - a);
  const [year, setYear] = useState(years[0] ?? desk.edition.year);
  const [subject, setSubject] = useState(subjects.find((s) => !s.tags.includes("broad"))?.code ?? subjects[0]?.code ?? "");
  const [form, setForm] = useState<Record<string, string>>({});
  const results = desk.results.filter((r) => r.year === year);
  const shown = subjects.filter((s) => results.some((r) => r.metric.startsWith(`${s.code}:`)));
  const valueOf = (code: string, part: string) => {
    const r = results.find((x) => x.metric === `${code}:${part}`);
    return r ? (r.label ?? (r.value !== undefined ? num(r.value, 1) : "—")) : "—";
  };
  return (
    <div className="an-results">
      <div className="ws-card">
        <table className="ws-table">
          <caption className="sr-only">Published results</caption>
          <thead>
            <tr>
              <th scope="col">Subject</th>
              {RESULT_PARTS.map((p) => (
                <th key={p.key} scope="col">
                  {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.code}>
                <td>{s.name}</td>
                {RESULT_PARTS.map((p) => (
                  <td key={p.key}>{valueOf(s.code, p.key)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <EmptyState icon="rankings" title={`No results recorded for ${year}`}>Record them from the fact file below.</EmptyState>}
      </div>
      {desk.can.edit && (
        <form
          className="an-card an-form"
          onSubmit={async (e) => {
            e.preventDefault();
            for (const p of RESULT_PARTS) {
              const raw = (form[p.key] ?? "").trim();
              if (!raw) continue;
              const n = Number(raw.replace(/,/g, ""));
              await run(() => saveBenchmark({ ranking: desk.edition.ranking, year, peer: "", metric: `${subject}:${p.key}`, ...(p.text || !Number.isFinite(n) ? { label: raw } : { value: n }) }));
            }
            setForm({});
          }}
        >
          <h2 className="an-h2">Record a result</h2>
          <div className="an-row3">
            <Select className="select" value={subject} onChange={setSubject} searchable aria-label="Subject">
              {subjects.map((s) => (
                <option key={s.code} value={s.code} data-depth={s.tags.includes("broad") ? 0 : 1}>
                  {s.name}
                </option>
              ))}
            </Select>
            <NumberField value={year} onChange={(n) => setYear(Number.isFinite(n) ? n : desk.edition.year)} min={2000} max={2100} aria-label="Year" />
          </div>
          <div className="an-resultfields">
            {RESULT_PARTS.map((p) => (
              <label key={p.key} className="an-field">
                <span>{p.label}</span>
                <input className="input" value={form[p.key] ?? ""} onChange={(e) => setForm({ ...form, [p.key]: e.target.value })} placeholder={p.text ? "701-850" : "0–100"} />
              </label>
            ))}
          </div>
          <div className="an-actions">
            <button type="submit" className="btn btn--dark" disabled={pending}>
              Save
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
