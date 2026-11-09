"use client";

/*
 * Rankings › Data imports. Templates: the Registrar's, HR's, the Health Service's and FMO's files, counted in this
 * browser under their profile; only the counts are sent, never a row. Unit files: a unit's THE data-collection
 * workbook (its answers and links, for review), GreenMetric evidence files (their figures, confirmed one by one) and
 * WURI case files. Unit names: how registers name units. Log: every file read, with its fingerprint.
 */
import { useRef, useState } from "react";
import { Disclosure, Hint } from "@/components/admin/ui";
import { RowMenu } from "@/components/publications/PostManager";
import { Icon } from "@/components/ui/Icon";
import { TabPanel, Tabs } from "@/components/ui/interactive";
import { Select } from "@/components/ui/pickers";
import { Sheet } from "@/components/workspace/parts";
import { saveValue } from "@/app/actions/analytics";
import { deleteAlias, deleteProfile, importCases, importTemplate, importWorkbook, readEvidenceDocs, saveAlias, saveProfile } from "@/app/actions/analytics-admin";
import type { ImportsDesk } from "@/lib/analytics/desk-types";
import { count, day, num } from "@/lib/analytics/format";
import { fingerprint, portable, readDocxText, readSheets } from "@/lib/analytics/tabular/browser";
import { applyProfile, detectProfile, type Profile, type TemplateResult } from "@/lib/analytics/templates";
import { EmptyState, useRun } from "./parts";

type View = "templates" | "files" | "names" | "log";

const academicYears = () => {
  const d = new Date();
  const y = d.getMonth() >= 7 ? d.getFullYear() : d.getFullYear() - 1;
  return Array.from({ length: 6 }, (_, i) => `${y - i}-${y - i + 1}`);
};

type Preview = { profile: Profile; result: TemplateResult; file: File; sha256: string };

function TemplatePreview({ p, onClose }: { p: Preview; onClose: () => void }) {
  const { run, pending } = useRun();
  const [year, setYear] = useState(academicYears()[0]);
  const labels = new Map(p.profile.kind === "pairs" ? (p.profile.pairs ?? []).map((x) => [x.key, x.label]) : p.profile.measures.map((m) => [m.key, m.label]));
  const suppressed = p.result.breakdowns.reduce((s, b) => s + b.suppressed, 0);
  return (
    <Sheet title={p.profile.name} onClose={onClose} className="an-sheet--wide">
      {(close) => (
        <form
          className="ws-sheet__body"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() => importTemplate({ profile: p.profile.key, year, result: p.result, meta: { fileName: p.file.name, sha256: p.sha256, bytes: p.file.size } }));
            if (r.ok) close();
          }}
        >
          <p className="ws-sheet__file">
            <Icon name="shield-check" size={16} />
            <span>
              {p.file.name} · {count(p.result.rows, "row")} counted on this computer
            </span>
            <Hint text="Only the counts below are sent to the Hub. Names, numbers, dates and assessments in the file never leave this computer." />
          </p>
          <ul className="an-totals">
            {Object.entries(p.result.totals).map(([k, v]) => (
              <li key={k}>
                <span>{labels.get(k) ?? k}</span>
                <b>{num(v)}</b>
              </li>
            ))}
          </ul>
          {p.result.breakdowns.map((b) => (
            <Disclosure key={b.dimension} title={`By ${b.dimension.toLowerCase().replace(/_/g, " ")}`} meta={`${b.cells.length}${b.suppressed ? ` · ${b.suppressed} small` : ""}`}>
              <ul className="an-cells">
                {b.cells.map((c) => (
                  <li key={c.value}>
                    <span>{c.value}</span>
                    <span className="an-muted">{Object.values(c.counts)[0] !== undefined ? num(Object.values(c.counts)[0]) : ""}</span>
                  </li>
                ))}
              </ul>
            </Disclosure>
          ))}
          {suppressed > 0 && <p className="an-muted">{suppressed} breakdown cells under {p.profile.minCell} are left out.</p>}
          <label className="an-field">
            <span>Academic year</span>
            <Select className="select" value={year} onChange={setYear}>
              {academicYears().map((y) => (
                <option key={y} value={y}>
                  {y.replace("-", "–")}
                </option>
              ))}
            </Select>
          </label>
          <footer className="ws-sheet__foot">
            <button type="button" className="btn" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn btn--dark" disabled={pending}>
              Keep the counts
            </button>
          </footer>
        </form>
      )}
    </Sheet>
  );
}

const PROFILE_EXAMPLE = `{
  "key": "my-template",
  "name": "My template",
  "description": "What the file is and who keeps it.",
  "kind": "rows",
  "headers": ["STUD_NUMBER", "COLLEGE"],
  "measures": [{ "key": "students", "label": "Students", "op": "distinct", "column": "STUD_NUMBER" }],
  "dimensions": ["COLLEGE"],
  "minCell": 5
}`;

/** A template upload: which profile it's for (or detect one from the columns), the file input, and the profile editor. */
function useTemplates(desk: ImportsDesk) {
  const { run } = useRun();
  const file = useRef<HTMLInputElement>(null);
  const [target, setTarget] = useState<Profile | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const upload = (profile: Profile | null) => {
    setTarget(profile);
    file.current?.click();
  };
  const read = async (f: File | undefined) => {
    if (!f) return;
    try {
      const [sheets, sha256] = await Promise.all([readSheets(f), fingerprint(f)]);
      const profile = target ?? detectProfile(desk.profiles, sheets);
      if (!profile) throw new Error("No profile matches this file’s columns. Choose the profile first, or add one.");
      setPreview({ profile, result: applyProfile(profile, sheets), file: f, sha256 });
    } catch (e) {
      await run(async () => ({ ok: false, message: e instanceof Error ? e.message : "That file couldn’t be read." }));
    }
    if (file.current) file.current.value = "";
  };
  return { file, read, upload, preview, setPreview, editing, setEditing };
}

function Templates({ desk, t }: { desk: ImportsDesk; t: ReturnType<typeof useTemplates> }) {
  const { run, pending } = useRun();
  const { file, read, upload, preview, setPreview, editing, setEditing } = t;
  const latest = (key: string) => desk.imports.find((i) => i.kind === "template" && i.profile === key);
  return (
    <>
      <div className="an-profiles">
        {desk.profiles.map((p) => {
          const last = latest(p.key);
          return (
            <section key={p.key} className="an-card an-profile">
              <header>
                <h2 className="an-h2">{p.name}</h2>
                {desk.can.manage && (
                  <RowMenu
                    label={`Actions for ${p.name}`}
                    disabled={pending}
                    items={[
                      { label: "Edit profile", icon: "pen", onSelect: () => setEditing(JSON.stringify({ ...p, ownerName: undefined }, null, 2)) },
                      { label: "Remove profile", icon: "trash", danger: true, onSelect: () => void run(() => deleteProfile({ key: p.key })) },
                    ]}
                  />
                )}
              </header>
              <p className="an-muted">{p.ownerName ?? "No unit"} · {p.kind === "pairs" ? count(p.pairs?.length ?? 0, "figure") : count(p.measures.length, "count")}</p>
              <p className="an-profile__desc">{p.description}</p>
              {last?.totals && (
                <ul className="an-totals an-totals--small">
                  {Object.entries(last.totals)
                    .slice(0, 4)
                    .map(([k, v]) => (
                      <li key={k}>
                        <span>{(p.kind === "pairs" ? p.pairs?.find((x) => x.key === k)?.label : p.measures.find((m) => m.key === k)?.label) ?? k}</span>
                        <b>{num(v)}</b>
                      </li>
                    ))}
                </ul>
              )}
              <footer className="an-profile__foot">
                <span className="an-muted">{last ? `${last.year ? `${last.year} · ` : ""}${day(last.at)}` : "No upload yet"}</span>
                {desk.can.manage && (
                  <button type="button" className="btn btn--sm" disabled={pending} onClick={() => upload(p)}>
                    <Icon name="upload" size={14} /> Upload
                  </button>
                )}
              </footer>
            </section>
          );
        })}
      </div>
      <input ref={file} type="file" className="sr-only" accept=".xlsx,.csv" tabIndex={-1} aria-hidden="true" onChange={(e) => void read(e.target.files?.[0])} />
      {preview && <TemplatePreview p={preview} onClose={() => setPreview(null)} />}
      {editing !== null && (
        <Sheet title="Template profile" onClose={() => setEditing(null)} className="an-sheet--wide">
          {(close) => (
            <form
              className="ws-sheet__body"
              onSubmit={async (e) => {
                e.preventDefault();
                let profile: unknown;
                try {
                  profile = JSON.parse(editing);
                } catch {
                  await run(async () => ({ ok: false, message: "That isn’t valid JSON." }));
                  return;
                }
                const r = await run(() => saveProfile({ profile }));
                if (r.ok) close();
              }}
            >
              <p className="ws-sheet__text">
                Headers identify the file; measures count rows (count), different values (distinct), totals (sum) or full-time equivalents (fte); dimensions break the counts down. Only the columns named here are ever read.
              </p>
              <textarea className="textarea an-code" rows={18} spellCheck={false} value={editing} onChange={(e) => setEditing(e.target.value)} aria-label="Profile" />
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
      )}
    </>
  );
}

type Doc = { name: string; code: string | null; title: string; known: boolean; figures: { value: number; context: string }[] };

function Files({ desk }: { desk: ImportsDesk }) {
  const { run, pending } = useRun();
  const book = useRef<HTMLInputElement>(null);
  const docs = useRef<HTMLInputElement>(null);
  const cases = useRef<HTMLInputElement>(null);
  const the = desk.editions.filter((e) => e.aggregate === "the-impact");
  const gm = desk.editions.filter((e) => e.aggregate === "sum");
  const wuri = desk.editions.filter((e) => e.aggregate === "best-per-group");
  const [theEdition, setTheEdition] = useState(the.find((e) => e.status === "Active")?.id ?? the[0]?.id ?? "");
  const [unit, setUnit] = useState("");
  const [gmEdition, setGmEdition] = useState(gm.find((e) => e.status === "Active")?.id ?? gm[0]?.id ?? "");
  const [wuriEdition, setWuriEdition] = useState(wuri.find((e) => e.status === "Active")?.id ?? wuri[0]?.id ?? "");
  const [found, setFound] = useState<Doc[] | null>(null);
  const [unplaced, setUnplaced] = useState<string[] | null>(null);
  const [used, setUsed] = useState<Set<string>>(new Set());
  const fail = (e: unknown) => run(async () => ({ ok: false, message: e instanceof Error ? e.message : "That file couldn’t be read." }));

  const readBook = async (f: File | undefined) => {
    if (!f) return;
    try {
      const [sheets, sha256] = await Promise.all([readSheets(f), fingerprint(f)]);
      const r = await run(() => importWorkbook({ edition: theEdition, unit, sheets: portable(sheets), meta: { fileName: f.name, sha256, bytes: f.size } }));
      if (r.ok && r.data?.unplaced.length) setUnplaced(r.data.unplaced);
    } catch (e) {
      await fail(e);
    }
    if (book.current) book.current.value = "";
  };
  const readDocs = async (list: FileList | null) => {
    if (!list?.length) return;
    try {
      const texts = await Promise.all([...list].slice(0, 150).map(async (f) => ({ name: f.name, text: await readDocxText(f) })));
      const r = await run(() => readEvidenceDocs({ edition: gmEdition, docs: texts }));
      if (r.ok && r.data) setFound(r.data.docs);
    } catch (e) {
      await fail(e);
    }
    if (docs.current) docs.current.value = "";
  };
  const readCases = async (list: FileList | null) => {
    if (!list?.length) return;
    try {
      const texts = await Promise.all([...list].slice(0, 100).map(async (f) => ({ name: f.name, text: await readDocxText(f), sha256: await fingerprint(f), bytes: f.size })));
      const r = await run(() => importCases({ edition: wuriEdition, docs: texts }));
      if (r.ok && r.data?.skipped.length) setUnplaced(r.data.skipped);
    } catch (e) {
      await fail(e);
    }
    if (cases.current) cases.current.value = "";
  };

  return (
    <div className="an-files">
      <section className="an-card">
        <h2 className="an-h2">
          THE data-collection workbook <Hint text="A unit's returned workbook: its Yes/No answers, options, figures and evidence links go in as that unit's answers, for review." />
        </h2>
        <div className="an-row2">
          <Select className="select" value={theEdition} onChange={setTheEdition} aria-label="Edition">
            {the.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </Select>
          <Select className="select" value={unit} onChange={setUnit} searchable placeholder="The unit that sent it" aria-label="Unit">
            <option value="">The unit that sent it</option>
            {desk.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="an-actions an-actions--start">
          <button type="button" className="btn btn--dark" disabled={pending || !unit || !theEdition} onClick={() => book.current?.click()}>
            <Icon name="upload" size={15} /> Choose workbook
          </button>
        </div>
        <input ref={book} type="file" className="sr-only" accept=".xlsx" tabIndex={-1} aria-hidden="true" onChange={(e) => void readBook(e.target.files?.[0])} />
      </section>

      <section className="an-card">
        <h2 className="an-h2">
          GreenMetric evidence files <Hint text="Files named University_Country_<category>_<number>_…: the Hub reads which question each answers and the figures its description gives. Confirm each figure to use it." />
        </h2>
        <Select className="select" value={gmEdition} onChange={setGmEdition} aria-label="Edition">
          {gm.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </Select>
        <div className="an-actions an-actions--start">
          <button type="button" className="btn btn--dark" disabled={pending || !gmEdition} onClick={() => docs.current?.click()}>
            <Icon name="upload" size={15} /> Choose .docx files
          </button>
        </div>
        <input ref={docs} type="file" className="sr-only" accept=".docx" multiple tabIndex={-1} aria-hidden="true" onChange={(e) => void readDocs(e.target.files)} />
      </section>

      <section className="an-card">
        <h2 className="an-h2">
          WURI case files <Hint text="WURI's innovative-programme template, one case per file. The Hub files each under its category and notes what was left blank." />
        </h2>
        <Select className="select" value={wuriEdition} onChange={setWuriEdition} aria-label="Edition">
          {wuri.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </Select>
        <div className="an-actions an-actions--start">
          <button type="button" className="btn btn--dark" disabled={pending || !wuriEdition} onClick={() => cases.current?.click()}>
            <Icon name="upload" size={15} /> Choose .docx files
          </button>
        </div>
        <input ref={cases} type="file" className="sr-only" accept=".docx" multiple tabIndex={-1} aria-hidden="true" onChange={(e) => void readCases(e.target.files)} />
      </section>

      {found && (
        <Sheet title="Figures in the evidence files" onClose={() => setFound(null)} className="an-sheet--wide">
          {(close) => (
            <div className="ws-sheet__body">
              <ul className="an-docs">
                {found.map((d) => (
                  <li key={d.name} className={d.known ? "" : "is-muted"}>
                    <p className="an-docs__title">
                      <span className="an-ind__code">{d.code ?? "?"}</span> {d.title}
                    </p>
                    <p className="an-muted">{d.name}</p>
                    {d.known && d.figures.length ? (
                      <div className="an-suggest">
                        {d.figures.slice(0, 4).map((f) => {
                          const key = `${d.code}:${f.value}`;
                          return (
                            <button
                              key={key}
                              type="button"
                              className={`chip chip--outline${used.has(key) ? " is-used" : ""}`}
                              disabled={pending || used.has(key)}
                              data-tip={f.context}
                              onClick={async () => {
                                const r = await run(() => saveValue({ edition: gmEdition, code: d.code!, value: { num: f.value }, note: `From ${d.name}: “${f.context}”` }));
                                if (r.ok) setUsed(new Set([...used, key]));
                              }}
                            >
                              Use {num(f.value)}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="an-muted">{d.known ? "No figures found." : "Not a figure the Hub takes as a number."}</p>
                    )}
                  </li>
                ))}
              </ul>
              <footer className="ws-sheet__foot">
                <button type="button" className="btn btn--dark" onClick={close}>
                  Done
                </button>
              </footer>
            </div>
          )}
        </Sheet>
      )}
      {unplaced && (
        <Sheet title="Not placed" onClose={() => setUnplaced(null)}>
          {(close) => (
            <div className="ws-sheet__body">
              <ul className="an-plainlist">
                {unplaced.slice(0, 80).map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
              <footer className="ws-sheet__foot">
                <button type="button" className="btn btn--dark" onClick={close}>
                  Close
                </button>
              </footer>
            </div>
          )}
        </Sheet>
      )}
    </div>
  );
}

function Names({ desk }: { desk: ImportsDesk }) {
  const { run, pending } = useRun();
  const [alias, setAlias] = useState("");
  const [unit, setUnit] = useState("");
  const names = new Map(desk.units.map((u) => [u.id, u.name]));
  const entries = Object.entries(desk.aliases).sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <div className="an-names">
      {desk.can.manage && (
        <form
          className="an-card an-form an-row3"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run(() => saveAlias({ alias, unit }));
            if (r.ok) {
              setAlias("");
              setUnit("");
            }
          }}
        >
          <input className="input" required maxLength={60} value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="As the files write it, like AMV-COA" aria-label="Name in files" />
          <Select className="select" value={unit} onChange={setUnit} searchable required placeholder="Unit" aria-label="Unit">
            <option value="">Unit</option>
            {desk.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
          <button type="submit" className="btn btn--dark" disabled={pending}>
            Add
          </button>
        </form>
      )}
      <div className="ws-card">
        <table className="ws-table">
          <caption className="sr-only">Unit names in files</caption>
          <thead>
            <tr>
              <th scope="col">In files</th>
              <th scope="col">Unit</th>
              <th scope="col" className="an-col-menu">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([a, u]) => (
              <tr key={a} className="ws-row">
                <td>
                  <b>{a}</b>
                </td>
                <td>{names.get(u) ?? u}</td>
                <td className="an-col-menu">{desk.can.manage && <RowMenu label={`Actions for ${a}`} disabled={pending} items={[{ label: "Remove", icon: "trash", danger: true, onSelect: () => void run(() => deleteAlias({ alias: a })) }]} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const KIND: Record<string, string> = { template: "Template", workbook: "Workbook", register: "Register", benchmarks: "Benchmarks", pack: "Methodology", "evidence-docs": "Evidence files", cases: "WURI cases" };

function Log({ desk }: { desk: ImportsDesk }) {
  if (!desk.imports.length) return <EmptyState icon="upload" title="Nothing imported yet" />;
  return (
    <div className="ws-card">
      <table className="ws-table an-table">
        <caption className="sr-only">Imports</caption>
        <thead>
          <tr>
            <th scope="col" className="an-col-year">When</th>
            <th scope="col">File</th>
            <th scope="col" className="an-col-kind">Kind</th>
            <th scope="col" className="an-col-num">Rows</th>
            <th scope="col" className="an-col-unit">By</th>
          </tr>
        </thead>
        <tbody>
          {desk.imports.map((i) => (
            <tr key={i.id} className="ws-row">
              <td className="an-col-year">{day(i.at)}</td>
              <td>
                <span className="an-ind__name">{i.fileName}</span>
                <span className="an-ind__sub" data-tip={`SHA-256 ${i.sha256}`}>
                  {[i.unitName, i.year, i.totals ? Object.entries(i.totals).slice(0, 3).map(([k, v]) => `${k} ${num(v)}`).join(", ") : ""].filter(Boolean).join(" · ") || `${i.sha256.slice(0, 12)}…`}
                </span>
              </td>
              <td className="an-col-kind">{KIND[i.kind] ?? i.kind}</td>
              <td className="an-col-num">{i.rows.toLocaleString("en-PH")}</td>
              <td className="an-col-unit">{i.byName}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Imports({ desk }: { desk: ImportsDesk }) {
  const [view, setView] = useState<View>("templates");
  const templates = useTemplates(desk);
  const views = [
    { key: "templates" as const, label: "Templates" },
    { key: "files" as const, label: "Unit files" },
    { key: "names" as const, label: "Unit names", count: Object.keys(desk.aliases).length || undefined },
    { key: "log" as const, label: "Log", count: desk.imports.length || undefined },
  ];
  return (
    <div className="an">
      <Tabs
        tabs={views}
        value={view}
        onChange={setView}
        label="Import views"
        idBase="an-imp"
        actions={
          view === "templates" &&
          desk.can.manage && (
            <>
              <button type="button" className="btn content-tabs__action" onClick={() => templates.upload(null)}>
                <Icon name="upload" size={16} /> Upload and detect
              </button>
              <button type="button" className="btn content-tabs__action" onClick={() => templates.setEditing(PROFILE_EXAMPLE)}>
                <Icon name="plus" size={16} /> New profile
              </button>
            </>
          )
        }
      />
      <TabPanel idBase="an-imp" index={views.findIndex((v) => v.key === view)} className="tabpanel">
        {view === "templates" && <Templates desk={desk} t={templates} />}
        {view === "files" && <Files desk={desk} />}
        {view === "names" && <Names desk={desk} />}
        {view === "log" && <Log desk={desk} />}
      </TabPanel>
    </div>
  );
}
