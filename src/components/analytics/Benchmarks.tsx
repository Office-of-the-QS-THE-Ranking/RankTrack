"use client";

/*
 * Rankings › Benchmarks: published figures, the University's and its peers', by ranking and year. Portal exports
 * or the Office's own sheets come in as tables; single figures are typed in. The gap matrix sets the University's
 * latest figures against the median of each peer band: Philippine competitors, ASEAN comparators and aspirational
 * peers. Normalised ratios (THE's proportions) are projected from the same peers' figures.
 */
import { useMemo, useRef, useState } from "react";
import { download } from "@/components/admin/ui";
import { RowMenu } from "@/components/publications/PostManager";
import { Icon } from "@/components/ui/Icon";
import { TabPanel, Tabs } from "@/components/ui/interactive";
import { NumberField, Select } from "@/components/ui/pickers";
import { Sheet } from "@/components/workspace/parts";
import { deleteBenchmark, deletePeer, saveBenchmark, savePeer } from "@/app/actions/analytics";
import { exportGap, importBenchmarks } from "@/app/actions/analytics-admin";
import type { BenchmarksDesk } from "@/lib/analytics/desk-types";
import { num } from "@/lib/analytics/format";
import { fingerprint, portable, readSheets } from "@/lib/analytics/tabular/browser";
import { PEER_BANDS, type Peer, type PeerBand } from "@/lib/analytics/types";
import { EmptyState, useRun } from "./parts";

type View = "gap" | "figures" | "peers";
const BANDS: PeerBand[] = ["Philippines", "ASEAN", "Aspirational"];

function Gap({ value }: { value: number | undefined }) {
  if (value === undefined) return <span className="an-dash">—</span>;
  return <span className={`an-gap${value >= 0 ? " is-ahead" : " is-behind"}`}>{value >= 0 ? "+" : ""}{value}%</span>;
}

export function Benchmarks({ desk }: { desk: BenchmarksDesk }) {
  const { run, pending } = useRun();
  const withData = desk.rankings.filter((r) => desk.benchmarks.some((b) => b.ranking === r.slug));
  const [ranking, setRanking] = useState(withData[0]?.slug ?? desk.rankings[0]?.slug ?? "");
  const [view, setView] = useState<View>("gap");
  const [peer, setPeer] = useState<Partial<Peer> | null>(null);
  const [adding, setAdding] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const [importYear, setImportYear] = useState(new Date().getFullYear());
  const [picked, setPicked] = useState<File | null>(null);
  const peerName = useMemo(() => new Map(desk.peers.map((p) => [p.id, p.name])), [desk.peers]);
  const figures = desk.benchmarks.filter((b) => b.ranking === ranking).sort((a, b) => b.year - a.year || (peerName.get(a.peer) ?? "").localeCompare(peerName.get(b.peer) ?? "") || a.metric.localeCompare(b.metric));
  const metricLabel = (key: string) => desk.metrics[ranking]?.find((m) => m.key === key)?.label ?? key;
  const gap = desk.gaps[ranking] ?? [];
  const views = [
    { key: "gap" as const, label: "Gap matrix", count: gap.length || undefined },
    { key: "figures" as const, label: "Figures", count: figures.length || undefined },
    { key: "peers" as const, label: "Peers", count: desk.peers.length || undefined },
  ];
  const [fig, setFig] = useState({ year: new Date().getFullYear(), peer: "", metric: "overall", value: NaN, label: "", note: "" });

  return (
    <div className="an">
      <div className="an-top">
        <label className="an-top__edition">
          <span className="sr-only">Ranking</span>
          <Select className="select" value={ranking} onChange={setRanking} aria-label="Ranking">
            {desk.rankings.map((r) => (
              <option key={r.slug} value={r.slug}>
                {r.short}
              </option>
            ))}
          </Select>
        </label>
      </div>
      <Tabs
        tabs={views}
        value={view}
        onChange={setView}
        label="Benchmark views"
        idBase="an-bench"
        actions={
          desk.can.edit && (
            <>
              {view === "gap" && desk.can.export && gap.length > 0 && (
                <button
                  type="button"
                  className="btn content-tabs__action"
                  disabled={pending}
                  onClick={async () => {
                    const r = await run(() => exportGap({ ranking }));
                    if (r.ok && r.data) download(r.data.name, r.data.text);
                  }}
                >
                  <Icon name="download" size={16} /> CSV
                </button>
              )}
              {view === "figures" && (
                <>
                  <button type="button" className="btn content-tabs__action" onClick={() => setAdding(true)}>
                    <Icon name="plus" size={16} /> Add figure
                  </button>
                  <button type="button" className="btn content-tabs__action" disabled={pending} onClick={() => file.current?.click()}>
                    <Icon name="upload" size={16} /> Import table
                  </button>
                  <input ref={file} type="file" className="sr-only" accept=".xlsx,.csv" tabIndex={-1} aria-hidden="true" onChange={(e) => setPicked(e.target.files?.[0] ?? null)} />
                </>
              )}
              {view === "peers" && (
                <button type="button" className="btn content-tabs__action" onClick={() => setPeer({ band: "Philippines" })}>
                  <Icon name="plus" size={16} /> Add peer
                </button>
              )}
            </>
          )
        }
      />
      <TabPanel idBase="an-bench" index={views.findIndex((v) => v.key === view)} className="tabpanel">
        {view === "gap" &&
          (gap.length ? (
            <div className="ws-card">
              <table className="ws-table an-table">
                <caption className="sr-only">Gap to peer medians</caption>
                <thead>
                  <tr>
                    <th scope="col">Figure</th>
                    <th scope="col" className="an-col-num">UST</th>
                    {BANDS.map((b) => (
                      <th key={b} scope="col" className="an-col-num">
                        {b}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gap.map((g) => (
                    <tr key={g.metric} className="ws-row">
                      <td>
                        <span className="an-ind__name">{g.label}</span>
                        <span className="an-ind__sub">{g.year}</span>
                      </td>
                      <td className="an-col-num">
                        <b>{g.ownLabel ?? num(g.own)}</b>
                      </td>
                      {BANDS.map((b) => (
                        <td key={b} className="an-col-num">
                          {g.medians[b] ? (
                            <span className="an-gapcell" data-tip={`Median of ${g.medians[b]!.n}`}>
                              {num(g.medians[b]!.value)} <Gap value={g.gaps[b]} />
                            </span>
                          ) : (
                            <span className="an-dash">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="trend-up" title="Nothing to compare yet">Record the University’s result and some peers’ under Figures.</EmptyState>
          ))}

        {view === "figures" &&
          (figures.length ? (
            <div className="ws-card">
              <table className="ws-table an-table">
                <caption className="sr-only">Figures</caption>
                <thead>
                  <tr>
                    <th scope="col" className="an-col-year">Year</th>
                    <th scope="col">Institution</th>
                    <th scope="col">Figure</th>
                    <th scope="col" className="an-col-num">Value</th>
                    <th scope="col" className="an-col-menu">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {figures.slice(0, 800).map((b) => (
                    <tr key={b.id} className="ws-row">
                      <td className="an-col-year">{b.year}</td>
                      <td>{b.peer ? (peerName.get(b.peer) ?? "Former peer") : <b>University of Santo Tomas</b>}</td>
                      <td>
                        {metricLabel(b.metric)}
                        {b.note && <span className="an-ind__sub">{b.note}</span>}
                      </td>
                      <td className="an-col-num">{b.label ?? num(b.value)}</td>
                      <td className="an-col-menu">{desk.can.edit && <RowMenu label="Figure actions" disabled={pending} items={[{ label: "Remove", icon: "trash", danger: true, onSelect: () => void run(() => deleteBenchmark({ id: b.id })) }]} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon="rankings" title="No figures for this ranking">Import a portal export or add figures one by one.</EmptyState>
          ))}

        {view === "peers" &&
          (desk.peers.length ? (
            <div className="an-peers">
              {PEER_BANDS.map((band) => {
                const list = desk.peers.filter((p) => p.band === band);
                if (!list.length) return null;
                return (
                  <section key={band} className="an-card">
                    <h2 className="an-h2">
                      {band} <span className="an-muted">· {list.length}</span>
                    </h2>
                    <ul className="an-peerlist">
                      {list.map((p) => (
                        <li key={p.id}>
                          <button type="button" className="an-linkbtn" disabled={!desk.can.edit} onClick={() => setPeer(p)}>
                            {p.name}
                          </button>
                          <span className="an-muted">{p.country}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          ) : (
            <EmptyState icon="users" title="No peers yet">Add the institutions the University measures itself against.</EmptyState>
          ))}
      </TabPanel>

      {picked && (
        <Sheet title="Import figures" onClose={() => setPicked(null)} className="ws-sheet--confirm">
          {(close) => (
            <form
              className="ws-sheet__body"
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  const [sheets, sha256] = await Promise.all([readSheets(picked), fingerprint(picked)]);
                  const r = await run(() => importBenchmarks({ ranking, year: importYear, sheets: portable(sheets), meta: { fileName: picked.name, sha256, bytes: picked.size } }));
                  if (r.ok) close();
                } catch (err) {
                  await run(async () => ({ ok: false, message: err instanceof Error ? err.message : "That file couldn’t be read." }));
                }
                if (file.current) file.current.value = "";
              }}
            >
              <p className="ws-sheet__file">
                <Icon name="paperclip" size={16} />
                <span>{picked.name}</span>
              </p>
              <label className="an-field">
                <span>Year, for rows without one</span>
                <NumberField value={importYear} onChange={(n) => setImportYear(Number.isFinite(n) ? n : new Date().getFullYear())} min={2000} max={2100} aria-label="Year" />
              </label>
              <footer className="ws-sheet__foot">
                <button type="button" className="btn" onClick={close}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--dark" disabled={pending}>
                  Import
                </button>
              </footer>
            </form>
          )}
        </Sheet>
      )}

      {adding && (
        <Sheet title="Add a figure" onClose={() => setAdding(false)}>
          {(close) => (
            <form
              className="ws-sheet__body"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await run(() => saveBenchmark({ ranking, year: fig.year, peer: fig.peer, metric: fig.metric, ...(Number.isFinite(fig.value) ? { value: fig.value } : {}), label: fig.label, note: fig.note }));
                if (r.ok) close();
              }}
            >
              <div className="an-row2">
                <label className="an-field">
                  <span>Year</span>
                  <NumberField value={fig.year} onChange={(n) => setFig({ ...fig, year: Number.isFinite(n) ? n : fig.year })} min={2000} max={2100} aria-label="Year" />
                </label>
                <label className="an-field">
                  <span>Institution</span>
                  <Select className="select" value={fig.peer} onChange={(v) => setFig({ ...fig, peer: v })} searchable>
                    <option value="">University of Santo Tomas</option>
                    {desk.peers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
              <label className="an-field">
                <span>Figure</span>
                <Select className="select" value={fig.metric} onChange={(v) => setFig({ ...fig, metric: v })} searchable>
                  {(desk.metrics[ranking] ?? []).map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="an-row2">
                <label className="an-field">
                  <span>Score</span>
                  <NumberField value={fig.value} onChange={(n) => setFig({ ...fig, value: n })} step={0.1} allowEmpty aria-label="Score" />
                </label>
                <label className="an-field">
                  <span>Rank or band</span>
                  <input className="input" maxLength={40} value={fig.label} onChange={(e) => setFig({ ...fig, label: e.target.value })} placeholder="601-650" />
                </label>
              </div>
              <label className="an-field">
                <span>Source</span>
                <input className="input" maxLength={300} value={fig.note} onChange={(e) => setFig({ ...fig, note: e.target.value })} placeholder="Fact file, portal export…" />
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
      )}

      {peer && (
        <Sheet title={peer.id ? "Peer" : "New peer"} onClose={() => setPeer(null)}>
          {(close) => (
            <form
              className="ws-sheet__body"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await run(() => savePeer({ id: peer.id, name: peer.name ?? "", country: peer.country ?? "", band: peer.band ?? "Other" }));
                if (r.ok) close();
              }}
            >
              <label className="an-field">
                <span>Institution</span>
                <input className="input" required maxLength={200} value={peer.name ?? ""} onChange={(e) => setPeer({ ...peer, name: e.target.value })} />
              </label>
              <div className="an-row2">
                <label className="an-field">
                  <span>Country</span>
                  <input className="input" maxLength={80} value={peer.country ?? ""} onChange={(e) => setPeer({ ...peer, country: e.target.value })} />
                </label>
                <label className="an-field">
                  <span>Band</span>
                  <Select className="select" value={peer.band ?? "Philippines"} onChange={(v) => setPeer({ ...peer, band: v as PeerBand })}>
                    {PEER_BANDS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
              <footer className="ws-sheet__foot">
                {peer.id && (
                  <button
                    type="button"
                    className="btn btn--ghost an-left"
                    disabled={pending}
                    onClick={async () => {
                      const r = await run(() => deletePeer({ id: peer.id! }));
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
      )}
    </div>
  );
}
