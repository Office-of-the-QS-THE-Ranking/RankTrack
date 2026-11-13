"use client";

/*
 * A ranking's Methodology tab, for those who manage it: its editions as data. An edition's status decides whether units can send to it
 * (Active), whether it is being prepared (Draft) or kept for comparison (Closed, Archived). A new year starts as a copy
 * of the last one; a methodology pack (JSON) creates or updates an edition in one go, checked indicator by indicator.
 * Each indicator's details, owners and evidence rules are edited here; its input and scoring rule too, as JSON.
 */
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { download, Hint } from "@/components/command-control/ui";
import { RowMenu } from "@/components/publications/PostManager";
import { Icon } from "@/components/ui/Icon";
import { DateField, NumberField, Select } from "@/components/ui/pickers";
import { SearchField } from "@/components/ui/search-field";
import { Sheet } from "@/components/workspace/parts";
import { cloneEdition, deleteEdition, exportPack, importPack, updateEdition, updateIndicator } from "@/app/actions/analytics-admin";
import type { EditionRef, MethodologyDesk } from "@/lib/analytics/desk-types";
import { count, pts } from "@/lib/analytics/format";
import type { CatalogIndicator, EditionStatus, InputSpec, Rollup } from "@/lib/analytics/types";
import { EmptyState, MoreRow, useMore, useRun } from "./parts";

const STATUSES: EditionStatus[] = ["Draft", "Active", "Closed", "Archived"];
const AGG: Record<string, string> = { sum: "Sum of points", "the-impact": "SDG 17 + best three", "best-per-group": "Best case per category", readiness: "Readiness only", results: "Published results" };
const TAKES: Record<InputSpec["type"], string> = { none: "Computed", number: "Figure", choice: "One choice", picks: "Choices", yesno: "Yes or no", text: "Text", date: "Date", result: "Published result", cases: "Cases" };
const RULES: Record<string, string> = { bands: "Bands", choice: "Levels", claim: "Evidence", ratio: "Normalised", external: "Body-measured", dated: "Date", rubric: "Rubric" };

function EditionSheet({ e, onClose }: { e: EditionRef; onClose: () => void }) {
  const { run, pending } = useRun();
  const [d, setD] = useState({ label: e.label, methodology: e.methodology, period: e.period, opensOn: e.opensOn ?? "", closesOn: e.closesOn ?? "", years: e.years.join(", "), notes: e.notes });
  return (
    <Sheet title={e.label} onClose={onClose} className="an-sheet--wide">
      {(close) => (
        <form
          className="ws-sheet__body"
          onSubmit={async (ev) => {
            ev.preventDefault();
            const years = d.years.split(/[,\s]+/).map(Number).filter((y) => Number.isInteger(y) && y > 1999);
            const r = await run(() => updateEdition({ id: e.id, label: d.label, methodology: d.methodology, period: d.period, opensOn: d.opensOn || null, closesOn: d.closesOn || null, years, notes: d.notes }));
            if (r.ok) close();
          }}
        >
          <label className="an-field">
            <span>Name</span>
            <input className="input" required maxLength={160} value={d.label} onChange={(x) => setD({ ...d, label: x.target.value })} />
          </label>
          <label className="an-field">
            <span>Methodology</span>
            <input className="input" maxLength={200} value={d.methodology} onChange={(x) => setD({ ...d, methodology: x.target.value })} />
          </label>
          <label className="an-field">
            <span>Reference period</span>
            <input className="input" maxLength={200} value={d.period} onChange={(x) => setD({ ...d, period: x.target.value })} />
          </label>
          <div className="an-row3">
            <label className="an-field">
              <span>Opens</span>
              <DateField value={d.opensOn} onChange={(v) => setD({ ...d, opensOn: v })} />
            </label>
            <label className="an-field">
              <span>Closes</span>
              <DateField value={d.closesOn} onChange={(v) => setD({ ...d, closesOn: v })} />
            </label>
            <label className="an-field">
              <span>
                Evidence years <Hint text="Calendar years evidence may come from. Links dated outside them are flagged; the activity register counts the academic years they touch." />
              </span>
              <input className="input" value={d.years} onChange={(x) => setD({ ...d, years: x.target.value })} placeholder="2025, 2026" pattern="^\s*\d{4}(\s*,\s*\d{4})*\s*$" data-missing="List years like 2025, 2026." />
            </label>
          </div>
          <label className="an-field">
            <span>Notes</span>
            <textarea className="textarea" rows={4} maxLength={4000} value={d.notes} onChange={(x) => setD({ ...d, notes: x.target.value })} />
          </label>
          <footer className="ws-sheet__foot">
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

function IndicatorSheet({ edition, ind, units, onClose }: { edition: string; ind: CatalogIndicator; units: MethodologyDesk["units"]; onClose: () => void }) {
  const { run, pending } = useRun();
  const [d, setD] = useState({
    name: ind.name,
    ref: ind.ref ?? "",
    guidance: ind.guidance,
    unit: ind.unit ?? "",
    owners: new Set(ind.owners),
    ownerLabels: ind.ownerLabels.join("; "),
    required: !!ind.evidence.required,
    isPublic: !!ind.evidence.public,
    policyDates: !!ind.evidence.policyDates,
    note: ind.evidence.note ?? "",
    rollup: ind.rollup,
    input: JSON.stringify(ind.input, null, 2),
    score: ind.score ? JSON.stringify(ind.score, null, 2) : "",
  });
  const [q, setQ] = useState("");
  const shownUnits = units.filter((u) => d.owners.has(u.id) || !q.trim() || u.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 60);
  return (
    <Sheet title={`${ind.ref ?? ind.code} ${ind.name}`} onClose={onClose} className="an-sheet--wide">
      {(close) => (
        <form
          className="ws-sheet__body"
          onSubmit={async (ev) => {
            ev.preventDefault();
            let input: unknown;
            let score: unknown;
            try {
              input = JSON.parse(d.input);
              score = d.score.trim() ? JSON.parse(d.score) : null;
            } catch {
              await run(async () => ({ ok: false, message: "The input or rule isn’t valid JSON." }));
              return;
            }
            const r = await run(() =>
              updateIndicator({
                edition,
                code: ind.code,
                patch: {
                  name: d.name,
                  ref: d.ref || null,
                  guidance: d.guidance,
                  unit: d.unit || null,
                  owners: [...d.owners],
                  ownerLabels: d.ownerLabels.split(";").map((s) => s.trim()).filter(Boolean),
                  evidence: { ...(d.required && { required: true }), ...(d.isPublic && { public: true }), ...(d.policyDates && { policyDates: true }), ...(d.note.trim() && { note: d.note.trim() }) },
                  rollup: d.rollup,
                  input,
                  score,
                },
              }),
            );
            if (r.ok) close();
          }}
        >
          <div className="an-row2">
            <label className="an-field">
              <span>Name</span>
              <input className="input" required maxLength={400} value={d.name} onChange={(x) => setD({ ...d, name: x.target.value })} />
            </label>
            <div className="an-row2">
              <label className="an-field">
                <span>Label</span>
                <input className="input" maxLength={32} value={d.ref} onChange={(x) => setD({ ...d, ref: x.target.value })} placeholder="EC4" />
              </label>
              <label className="an-field">
                <span>Unit</span>
                <input className="input" maxLength={40} value={d.unit} onChange={(x) => setD({ ...d, unit: x.target.value })} placeholder="kWh" />
              </label>
            </div>
          </div>
          <label className="an-field">
            <span>Guidance</span>
            <textarea className="textarea" rows={4} maxLength={4000} value={d.guidance} onChange={(x) => setD({ ...d, guidance: x.target.value })} />
          </label>
          <fieldset className="an-unitset">
            <legend>Owners</legend>
            <SearchField value={q} onChange={setQ} placeholder="Find a unit" label="Find a unit" />
            <div className="an-ownerpick">
              {shownUnits.map((u) => (
                <label key={u.id} className="an-unitpick">
                  <input
                    type="checkbox"
                    checked={d.owners.has(u.id)}
                    onChange={() => {
                      const n = new Set(d.owners);
                      if (n.has(u.id)) n.delete(u.id);
                      else n.add(u.id);
                      setD({ ...d, owners: n });
                    }}
                  />
                  <span>{u.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="an-field">
            <span>
              Other owners <Hint text="Offices the methodology names that aren't in the Directory, or a group such as Every unit. Separate with semicolons." />
            </span>
            <input className="input" maxLength={600} value={d.ownerLabels} onChange={(x) => setD({ ...d, ownerLabels: x.target.value })} />
          </label>
          <fieldset className="an-tagpick">
            <legend>Evidence</legend>
            <label className="an-pick">
              <input type="checkbox" checked={d.required} onChange={(x) => setD({ ...d, required: x.target.checked })} />
              <span>Required</span>
            </label>
            <label className="an-pick">
              <input type="checkbox" checked={d.isPublic} onChange={(x) => setD({ ...d, isPublic: x.target.checked })} />
              <span>Must be public</span>
            </label>
            <label className="an-pick">
              <input type="checkbox" checked={d.policyDates} onChange={(x) => setD({ ...d, policyDates: x.target.checked })} />
              <span>Policy dates</span>
            </label>
          </fieldset>
          <label className="an-field">
            <span>
              Units’ figures add up as <Hint text="The Office's own figure always counts first. Without one: the units' figures summed, the highest, or the latest." />
            </span>
            <Select className="select" value={d.rollup} onChange={(v) => setD({ ...d, rollup: v as Rollup })}>
              <option value="office">The Office’s figure (else the latest)</option>
              <option value="sum">Sum of units’ figures</option>
              <option value="max">The highest</option>
              <option value="latest">The latest</option>
            </Select>
          </label>
          <details className="cmd-disclosure">
            <summary>
              <span className="cmd-disclosure__title">Input and scoring rule</span>
              <span className="cmd-disclosure__meta">{ind.score ? RULES[ind.score.kind] : "Not scored"}</span>
              <Icon name="chevron-down" size={16} className="cmd-disclosure__chev" />
            </summary>
            <div className="cmd-disclosure__body">
              <label className="an-field">
                <span>Input</span>
                <textarea className="textarea an-code" rows={6} spellCheck={false} value={d.input} onChange={(x) => setD({ ...d, input: x.target.value })} />
              </label>
              <label className="an-field">
                <span>Rule (empty: not scored)</span>
                <textarea className="textarea an-code" rows={10} spellCheck={false} value={d.score} onChange={(x) => setD({ ...d, score: x.target.value })} />
              </label>
            </div>
          </details>
          <footer className="ws-sheet__foot">
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

export function Methodology({ desk }: { desk: MethodologyDesk }) {
  const router = useRouter();
  const { run, pending } = useRun();
  const file = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<EditionRef | null>(null);
  const [cloning, setCloning] = useState<{ e: EditionRef; year: number } | null>(null);
  const [ind, setInd] = useState<CatalogIndicator | null>(null);
  const [q, setQ] = useState("");
  const sel = desk.selected;
  const groupName = useMemo(() => new Map(sel?.groups.map((g) => [g.code, g.name]) ?? []), [sel]);
  const term = q.trim().toLowerCase();
  const indicators = sel?.indicators.filter((i) => !term || `${i.code} ${i.ref ?? ""} ${i.name}`.toLowerCase().includes(term)) ?? [];
  const { limit, showMore } = useMore(`${sel?.edition.id}|${term}`);

  const onPack = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const r = await run(() => importPack({ text, meta: { fileName: f.name, sha256, bytes: f.size } }));
    if (r.ok && r.data) router.push(`/admin/rankings/${r.data.ranking}?edition=${r.data.id}#methodology`);
    if (file.current) file.current.value = "";
  };

  return (
    <div className="an">
      <div className="content-tabs">
        <div className="content-tabs__controls">
          {desk.can.manage && (
            <div className="content-tabs__actions">
              <button type="button" className="btn content-tabs__action" disabled={pending} onClick={() => file.current?.click()}>
                <Icon name="upload" size={16} /> Import pack
              </button>
              <input ref={file} type="file" className="sr-only" accept=".json,application/json" tabIndex={-1} aria-hidden="true" onChange={(e) => void onPack(e.target.files?.[0])} />
            </div>
          )}
        </div>
      </div>
      {!desk.editions.length ? (
        <EmptyState icon="layers" title="No editions yet">Import a methodology pack to start.</EmptyState>
      ) : (
        <div className="ws-card">
          <table className="ws-table an-table">
            <caption className="sr-only">Editions</caption>
            <thead>
              <tr>
                <th scope="col">Edition</th>
                <th scope="col" className="an-col-kind">Adds up as</th>
                <th scope="col" className="an-col-num">Indicators</th>
                <th scope="col" className="an-col-state">Status</th>
                <th scope="col" className="an-col-menu">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {desk.editions.map((e) => (
                <tr key={e.id} className={`ws-row an-click${sel?.edition.id === e.id ? " is-picked" : ""}`} onClick={() => router.push(`/admin/rankings/${e.ranking}?edition=${e.id}#methodology`)}>
                  <td>
                    <span className="an-ind__name">
                      <span className="an-dot" style={{ background: e.color }} aria-hidden="true" /> {e.label}
                    </span>
                    <span className="an-ind__sub">
                      {e.methodology || e.rankingShort}
                      {e.facts ? ` · ${e.facts.toLocaleString("en-PH")} records` : ""}
                    </span>
                  </td>
                  <td className="an-col-kind">{AGG[e.aggregate] ?? e.aggregate}</td>
                  <td className="an-col-num">
                    {e.indicators} <span className="an-muted">· {e.scored} scored</span>
                  </td>
                  <td className="an-col-state" onClick={(ev) => ev.stopPropagation()}>
                    {desk.can.manage ? (
                      <Select className="select select--sm" value={e.status} onChange={(v) => void run(() => updateEdition({ id: e.id, status: v as EditionStatus }))} aria-label={`Status of ${e.label}`}>
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      e.status
                    )}
                  </td>
                  <td className="an-col-menu" onClick={(ev) => ev.stopPropagation()}>
                    <RowMenu
                      label={`Actions for ${e.label}`}
                      disabled={pending}
                      items={[
                        desk.can.manage && { label: "Edit details", icon: "pen", onSelect: () => setEditing(e) },
                        desk.can.manage && { label: "Start another year", icon: "copy", onSelect: () => setCloning({ e, year: e.year + 1 }) },
                        desk.can.export && {
                          label: "Export pack",
                          icon: "download",
                          onSelect: async () => {
                            const r = await run(() => exportPack({ edition: e.id }));
                            if (r.ok && r.data) download(r.data.name, r.data.text, "application/json");
                          },
                        },
                        desk.can.manage && !e.facts && { label: "Remove", icon: "trash", danger: true, onSelect: () => void run(() => deleteEdition({ id: e.id })) },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sel && (
        <section className="an-sec an-methods">
          <header className="an-methods__head">
            <h2 className="an-h2">
              <span className="an-dot" style={{ background: sel.edition.color }} aria-hidden="true" /> {sel.edition.label}
            </h2>
            <SearchField value={q} onChange={setQ} placeholder="Search indicators" label="Search indicators" />
          </header>
          <div className="ws-card">
            <table className="ws-table an-table">
              <caption className="sr-only">{sel.edition.label} indicators</caption>
              <thead>
                <tr>
                  <th scope="col">Indicator</th>
                  <th scope="col" className="an-col-kind">Takes</th>
                  <th scope="col" className="an-col-kind">Scores</th>
                  <th scope="col" className="an-col-num">Points</th>
                </tr>
              </thead>
              <tbody>
                {indicators.slice(0, limit).map((i) => (
                  <tr key={i.code} className={`ws-row${desk.can.manage ? " an-click" : ""}`} onClick={() => desk.can.manage && setInd(i)}>
                    <td>
                      <span className="an-ind">
                        <span className="an-ind__code">{i.ref ?? i.code}</span>
                        <span className="an-ind__name">{i.name}</span>
                        <span className="an-ind__sub">
                          {groupName.get(i.group) ?? i.group} · {i.owners.length ? count(i.owners.length, "unit") : (i.ownerLabels[0] ?? "No unit")}
                        </span>
                      </span>
                    </td>
                    <td className="an-col-kind">{TAKES[i.input.type]}</td>
                    <td className="an-col-kind">{i.score ? RULES[i.score.kind] : <span className="an-dash">—</span>}</td>
                    <td className="an-col-num">{i.score ? pts(i.score.points) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <MoreRow shown={limit} total={indicators.length} onMore={showMore} />
          </div>
        </section>
      )}

      {editing && <EditionSheet e={editing} onClose={() => setEditing(null)} />}
      {ind && sel && <IndicatorSheet edition={sel.edition.id} ind={ind} units={desk.units} onClose={() => setInd(null)} />}
      {cloning && (
        <Sheet title={`Start another year of ${cloning.e.rankingShort}`} onClose={() => setCloning(null)} className="ws-sheet--confirm">
          {(close) => (
            <form
              className="ws-sheet__body"
              onSubmit={async (ev) => {
                ev.preventDefault();
                const r = await run(() => cloneEdition({ id: cloning.e.id, year: cloning.year }));
                if (r.ok && r.data) {
                  close();
                  router.push(`/admin/rankings/${cloning.e.ranking}?edition=${r.data.id}#methodology`);
                }
              }}
            >
              <p className="ws-sheet__text">A draft with {cloning.e.label}’s groups, indicators and rules, and no data. Update what the new methodology changed, then make it active.</p>
              <NumberField value={cloning.year} onChange={(n) => setCloning({ ...cloning, year: Number.isFinite(n) ? n : cloning.year })} min={2000} max={2100} aria-label="Year" />
              <footer className="ws-sheet__foot">
                <button type="button" className="btn" onClick={close}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--dark" disabled={pending}>
                  Create draft
                </button>
              </footer>
            </form>
          )}
        </Sheet>
      )}
    </div>
  );
}
