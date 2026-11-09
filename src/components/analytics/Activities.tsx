"use client";

/*
 * Rankings › Activities: the activity register (service learning, community development, advocacy…) by unit and
 * academic year. GreenMetric's ED4, ED5 and ED8, THE's community questions and QS's knowledge exchange read their
 * suggested counts from it. A register workbook in SIMBAHAYAN's format is read in the browser and added at once.
 */
import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { DateField, NumberField, Select } from "@/components/ui/pickers";
import { SearchField } from "@/components/ui/search-field";
import { Sheet } from "@/components/workspace/parts";
import { deleteActivity, saveActivity } from "@/app/actions/analytics";
import { importRegister } from "@/app/actions/analytics-admin";
import type { ActivitiesDesk } from "@/lib/analytics/desk-types";
import { count } from "@/lib/analytics/format";
import { fingerprint, portable, readSheets } from "@/lib/analytics/tabular/browser";
import { ACTIVITY_KINDS, type Activity, type ActivityKind } from "@/lib/analytics/types";
import { EmptyState, MoreRow, useMore, useRun } from "./parts";

export type ActivityDraft = {
  id?: string;
  unit: string;
  unitLabel: string;
  kind: ActivityKind;
  year: string;
  title: string;
  proponent: string;
  community: string;
  proposalRef: string;
  reportRef: string;
  beneficiaries: number;
  partner: string;
  mou: string;
  startsOn: string;
  endsOn: string;
  sdgs: number[];
  tags: string[];
};

const thisYear = () => {
  const d = new Date();
  const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${y + 1}`;
};

export const draftOf = (a?: Activity & { unitName?: string }): ActivityDraft => ({
  ...(a && { id: a.id }),
  unit: a?.unit ?? "",
  unitLabel: a?.unitLabel ?? "",
  kind: a?.kind ?? "Community development",
  year: a?.year ?? thisYear(),
  title: a?.title ?? "",
  proponent: a?.proponent ?? "",
  community: a?.community ?? "",
  proposalRef: a?.proposalRef ?? "",
  reportRef: a?.reportRef ?? "",
  beneficiaries: a?.beneficiaries ?? NaN,
  partner: a?.partner ?? "",
  mou: a?.mou ?? "",
  startsOn: a?.startsOn ?? "",
  endsOn: a?.endsOn ?? "",
  sdgs: a?.sdgs ?? [],
  tags: a?.tags ?? [],
});

const TAGS = ["sustainability", "student-led", "international", "cultural"];

/** An activity's form, for the Office's register and a unit's own. */
export function ActivitySheet({ draft: start, units, lockUnit, onClose, canDelete }: { draft: ActivityDraft; units: { id: string; name: string }[]; lockUnit?: boolean; onClose: () => void; canDelete: boolean }) {
  const { run, pending } = useRun();
  const [d, setD] = useState(start);
  const years = useMemo(() => {
    const y = Number(thisYear().slice(0, 4));
    return Array.from({ length: 8 }, (_, i) => `${y - i}-${y - i + 1}`);
  }, []);
  return (
    <Sheet title={d.id ? "Activity" : "New activity"} onClose={onClose} className="an-sheet--wide">
      {(close) => (
        <form
          className="ws-sheet__body"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() =>
              saveActivity({
                ...d,
                unit: d.unit || undefined,
                unitLabel: d.unitLabel || units.find((u) => u.id === d.unit)?.name || "",
                beneficiaries: Number.isFinite(d.beneficiaries) ? d.beneficiaries : null,
              }),
            );
            if (r.ok) close();
          }}
        >
          <label className="an-field">
            <span>Title</span>
            <input className="input" required maxLength={300} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} data-missing="Give the activity's title." />
          </label>
          <div className="an-row3">
            <label className="an-field">
              <span>Kind</span>
              <Select className="select" value={d.kind} onChange={(v) => setD({ ...d, kind: v as ActivityKind })}>
                {ACTIVITY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </label>
            <label className="an-field">
              <span>Academic year</span>
              <Select className="select" value={d.year} onChange={(v) => setD({ ...d, year: v })}>
                {[...new Set([d.year, ...years])].map((y) => (
                  <option key={y} value={y}>
                    {y.replace("-", "–")}
                  </option>
                ))}
              </Select>
            </label>
            <label className="an-field">
              <span>Unit</span>
              <Select className="select" value={d.unit} onChange={(v) => setD({ ...d, unit: v })} searchable disabled={lockUnit} placeholder={d.unitLabel || "Choose a unit"} required={!d.unitLabel}>
                <option value="">{d.unitLabel || "Choose a unit"}</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <div className="an-row2">
            <label className="an-field">
              <span>Proponent</span>
              <input className="input" maxLength={200} value={d.proponent} onChange={(e) => setD({ ...d, proponent: e.target.value })} placeholder="Organization or class" />
            </label>
            <label className="an-field">
              <span>Beneficiaries</span>
              <NumberField value={d.beneficiaries} onChange={(n) => setD({ ...d, beneficiaries: n })} min={0} allowEmpty aria-label="Beneficiaries" />
            </label>
          </div>
          <label className="an-field">
            <span>Target community</span>
            <input className="input" maxLength={400} value={d.community} onChange={(e) => setD({ ...d, community: e.target.value })} />
          </label>
          <div className="an-row2">
            <label className="an-field">
              <span>Project proposal</span>
              <input className="input" maxLength={300} value={d.proposalRef} onChange={(e) => setD({ ...d, proposalRef: e.target.value })} placeholder="Reference or file name" />
            </label>
            <label className="an-field">
              <span>Terminal report</span>
              <input className="input" maxLength={300} value={d.reportRef} onChange={(e) => setD({ ...d, reportRef: e.target.value })} placeholder="Reference or file name" />
            </label>
          </div>
          <div className="an-row2">
            <label className="an-field">
              <span>Partner</span>
              <input className="input" maxLength={300} value={d.partner} onChange={(e) => setD({ ...d, partner: e.target.value })} />
            </label>
            <label className="an-field">
              <span>MOU link</span>
              <input className="input" type="url" maxLength={2000} value={d.mou} onChange={(e) => setD({ ...d, mou: e.target.value })} placeholder="https://…" />
            </label>
          </div>
          <div className="an-row2">
            <label className="an-field">
              <span>Started</span>
              <DateField value={d.startsOn} onChange={(v) => setD({ ...d, startsOn: v })} />
            </label>
            <label className="an-field">
              <span>Ended</span>
              <DateField value={d.endsOn} onChange={(v) => setD({ ...d, endsOn: v })} min={d.startsOn || undefined} />
            </label>
          </div>
          <fieldset className="an-sdgpick">
            <legend>SDGs</legend>
            {Array.from({ length: 17 }, (_, i) => i + 1).map((n) => (
              <label key={n} className={`an-sdg${d.sdgs.includes(n) ? " is-on" : ""}`}>
                <input type="checkbox" className="sr-only" checked={d.sdgs.includes(n)} onChange={() => setD({ ...d, sdgs: d.sdgs.includes(n) ? d.sdgs.filter((x) => x !== n) : [...d.sdgs, n] })} />
                {n}
              </label>
            ))}
          </fieldset>
          <fieldset className="an-tagpick">
            <legend>Tags</legend>
            {TAGS.map((t) => (
              <label key={t} className="an-pick">
                <input type="checkbox" checked={d.tags.includes(t)} onChange={() => setD({ ...d, tags: d.tags.includes(t) ? d.tags.filter((x) => x !== t) : [...d.tags, t] })} />
                <span>{t}</span>
              </label>
            ))}
          </fieldset>
          <footer className="ws-sheet__foot">
            {d.id && canDelete && (
              <button
                type="button"
                className="btn btn--ghost an-left"
                disabled={pending}
                onClick={async () => {
                  const r = await run(() => deleteActivity({ id: d.id! }));
                  if (r.ok) close();
                }}
              >
                <Icon name="trash" size={15} /> Remove
              </button>
            )}
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn btn--dark" disabled={pending}>
              Save
            </button>
          </footer>
        </form>
      )}
    </Sheet>
  );
}

export function Activities({ desk }: { desk: ActivitiesDesk }) {
  const { run, pending } = useRun();
  const file = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [year, setYear] = useState(desk.years[0] ?? "");
  const [kind, setKind] = useState("");
  const [unit, setUnit] = useState("");
  const [editing, setEditing] = useState<ActivityDraft | null>(null);
  const term = q.trim().toLowerCase();
  const inYear = desk.activities.filter((a) => !year || a.year === year);
  const shown = inYear.filter((a) => (!kind || a.kind === kind) && (!unit || a.unit === unit) && (!term || [a.title, a.proponent, a.community, a.unitName ?? a.unitLabel, a.partner].some((x) => x.toLowerCase().includes(term))));
  const { limit, showMore } = useMore(`${year}|${kind}|${unit}|${term}`);
  const byKind = ACTIVITY_KINDS.map((k) => ({ k, n: inYear.filter((a) => a.kind === k).length })).filter((x) => x.n);
  const byYear = desk.years
    .slice(0, 6)
    .reverse()
    .map((y) => ({ y, n: desk.activities.filter((a) => a.year === y).length, reported: desk.activities.filter((a) => a.year === y && a.reported).length }));
  const maxYear = Math.max(1, ...byYear.map((x) => x.n));
  const byUnit = [...inYear.reduce((m, a) => m.set(a.unitName ?? a.unitLabel, (m.get(a.unitName ?? a.unitLabel) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxUnit = Math.max(1, ...byUnit.map((x) => x[1]));

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const [sheets, sha256] = await Promise.all([readSheets(f), fingerprint(f)]);
      await run(() => importRegister({ sheets: portable(sheets), meta: { fileName: f.name, sha256, bytes: f.size } }));
    } catch (e) {
      await run(async () => ({ ok: false, message: e instanceof Error ? e.message : "That file couldn’t be read." }));
    }
    if (file.current) file.current.value = "";
  };

  return (
    <div className="an">
      {desk.activities.length > 0 && (
        <div className="an-bento an-bento--3">
          <section className="an-card">
            <h2 className="an-h2">By year</h2>
            <ul className="an-cols" aria-label="Activities by academic year">
              {byYear.map((x) => (
                <li key={x.y} data-tip={`${count(x.n, "activity", "activities")}, ${x.reported} with terminal reports`}>
                  <span className="an-cols__bar" style={{ height: `${(x.n / maxYear) * 100}%` }}>
                    <i style={{ height: `${x.n ? (x.reported / x.n) * 100 : 0}%` }} />
                  </span>
                  <span className="an-cols__n">{x.n}</span>
                  <span className="an-cols__label">{x.y.slice(2, 4)}–{x.y.slice(7)}</span>
                </li>
              ))}
            </ul>
          </section>
          <section className="an-card">
            <h2 className="an-h2">By kind{year ? ` · ${year.replace("-", "–")}` : ""}</h2>
            <ul className="an-hbars">
              {byKind.map((x) => (
                <li key={x.k}>
                  <span>{x.k}</span>
                  <span className="an-hbars__bar" style={{ width: `${(x.n / Math.max(1, inYear.length)) * 100}%` }} />
                  <b>{x.n}</b>
                </li>
              ))}
            </ul>
          </section>
          <section className="an-card">
            <h2 className="an-h2">Most active units</h2>
            <ul className="an-hbars">
              {byUnit.map(([name, n]) => (
                <li key={name}>
                  <span>{name}</span>
                  <span className="an-hbars__bar" style={{ width: `${(n / maxUnit) * 100}%` }} />
                  <b>{n}</b>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <div className="content-tabs">
        <div className="content-tabs__controls">
          <div className="content-tabs__actions">
            <span className="an-filter">
              <Select className="select select--sm" value={year} onChange={setYear} aria-label="Academic year" placeholder="Every year">
                <option value="">Every year</option>
                {desk.years.map((y) => (
                  <option key={y} value={y}>
                    {y.replace("-", "–")}
                  </option>
                ))}
              </Select>
            </span>
            <span className="an-filter">
              <Select className="select select--sm" value={kind} onChange={setKind} aria-label="Kind" placeholder="Every kind">
                <option value="">Every kind</option>
                {ACTIVITY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </Select>
            </span>
            <span className="an-filter">
              <Select className="select select--sm" value={unit} onChange={setUnit} searchable aria-label="Unit" placeholder="Every unit">
                <option value="">Every unit</option>
                {desk.units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </Select>
            </span>
            {desk.can.edit && (
              <>
                <button type="button" className="btn content-tabs__action" onClick={() => setEditing(draftOf())}>
                  <Icon name="plus" size={16} /> Add
                </button>
                <button type="button" className="btn content-tabs__action" disabled={pending} onClick={() => file.current?.click()}>
                  <Icon name="upload" size={16} /> Import register
                </button>
                <input ref={file} type="file" className="sr-only" accept=".xlsx,.csv" tabIndex={-1} aria-hidden="true" onChange={(e) => void onFile(e.target.files?.[0])} />
              </>
            )}
          </div>
          <div className="content-tabs__search">
            <SearchField value={q} onChange={setQ} placeholder="Search activities" label="Search activities" examples={["Search by title", "Search by community", "Search by organization"]} shortcuts />
          </div>
        </div>
      </div>

      {!desk.activities.length ? (
        <EmptyState icon="collaboration" title="No activities yet">Import SIMBAHAYAN’s register, or add activities one by one.</EmptyState>
      ) : (
        <div className="ws-card">
          <table className="ws-table an-table">
            <caption className="sr-only">Activity register</caption>
            <thead>
              <tr>
                <th scope="col">Activity</th>
                <th scope="col" className="an-col-unit">Unit</th>
                <th scope="col" className="an-col-kind">Kind</th>
                <th scope="col" className="an-col-year">Year</th>
                <th scope="col" className="an-col-num">Report</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, limit).map((a) => (
                <tr key={a.id} className={`ws-row${desk.can.edit ? " an-click" : ""}`} onClick={() => desk.can.edit && setEditing(draftOf(a))}>
                  <td>
                    <span className="an-ind__name">{a.title}</span>
                    <span className="an-ind__sub">
                      {a.proponent}
                      {a.community ? `${a.proponent ? " · " : ""}${a.community}` : ""}
                    </span>
                  </td>
                  <td className="an-col-unit">{a.unitName ?? <span className="an-warnlabel" data-tip="No unit matched this name. Add an alias on the Data imports page.">{a.unitLabel}</span>}</td>
                  <td className="an-col-kind">{a.kind}</td>
                  <td className="an-col-year">{a.year.replace("-", "–")}</td>
                  <td className="an-col-num">{a.reported ? <Icon name="check" size={15} /> : <span className="an-dash">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <MoreRow shown={limit} total={shown.length} onMore={showMore} />
          {!shown.length && (
            <div className="ws-none">
              <p>No activities match.</p>
            </div>
          )}
        </div>
      )}

      {editing && <ActivitySheet draft={editing} units={desk.units} onClose={() => setEditing(null)} canDelete={desk.can.edit} />}
    </div>
  );
}
