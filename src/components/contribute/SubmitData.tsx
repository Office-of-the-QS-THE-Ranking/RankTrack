"use client";

import { useState, type CSSProperties } from "react";
import type { EvidenceStatus } from "@/lib/data";
import { Icon } from "@/components/ui/Icon";
import { Card, Empty, Notice, RankingName, Status } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { useFlag, useGovern, useHub, useRankings, useViewer } from "@/components/hub/HubProvider";
import { parseCsv } from "@/components/admin/sheet-reader";

interface DataRow {
  id: string;
  label: string;
  ranking: string;
  indicator: string;
  period: string;
  unit: string;
  status: EvidenceStatus;
  value: string;
  source: string;
  note?: string;
}

const ROWS: DataRow[] = [
  { id: "R-10", label: "Scope 2 emissions, engineering buildings", ranking: "qs-sustainability", indicator: "Environmental Impact", period: "Calendar year 2025", unit: "tCO₂e", status: "Not yet submitted", value: "", source: "" },
  { id: "R-11", label: "Electricity consumed, engineering complex", ranking: "greenmetric", indicator: "Energy and Climate Change", period: "Calendar year 2025", unit: "MWh", status: "Not yet submitted", value: "", source: "" },
  {
    id: "R-03",
    label: "Industry research income",
    ranking: "the-wur",
    indicator: "Industry",
    period: "Financial year 2025",
    unit: "₱ million",
    status: "Needs revision",
    value: "18.6",
    source: "industry-contracts-2025.xlsx",
    note: "Three contracts are dated FY2024. Remove them or correct the period.",
  },
  { id: "R-01", label: "Water reused, engineering complex", ranking: "greenmetric", indicator: "Water", period: "Calendar year 2025", unit: "m³", status: "Validated", value: "4,820", source: "water-reuse-2025.xlsx" },
  { id: "R-02", label: "Renewable energy generated", ranking: "greenmetric", indicator: "Energy and Climate Change", period: "Calendar year 2025", unit: "MWh", status: "Validated", value: "212", source: "pv-generation-2025.csv" },
  { id: "R-05", label: "Faculty FTE", ranking: "qs-wur", indicator: "Faculty–Student Ratio", period: "Academic year 2025–2026", unit: "FTE", status: "Validated", value: "312.5", source: "hr-fte-2025.xlsx" },
];

const isNumber = (v: string) => /^\d{1,3}(,\d{3})*(\.\d+)?$|^\d+(\.\d+)?$/.test(v.trim());

/** Enter reporting-period values for assigned indicators (proposal §11, "Enter reporting-period data"). */
export function SubmitData() {
  const hub = useHub();
  const viewer = useViewer();
  const rankings = useRankings();
  const spreadsheet = useFlag("spreadsheet-values");
  const { run, pending } = useGovern();
  // The sample values belong to the Faculty of Engineering; other units have none assigned this cycle.
  const assigned = viewer?.portal.unitId === "engineering" && !viewer.portal.programId ? ROWS : [];
  const [rows, setRows] = useState<DataRow[]>(() =>
    assigned
      .filter((r) => rankings.some((x) => x.slug === r.ranking))
      .map((r) => {
        const v = hub?.values[r.id];
        return v ? { ...r, value: v.value, source: v.source, status: v.status, note: undefined } : r;
      }),
  );
  const [tried, setTried] = useState(false);
  const [csvNote, setCsvNote] = useState("");
  const editable = rows.filter((r) => r.status !== "Validated" && r.status !== "For review");
  const invalid = (r: DataRow) => !isNumber(r.value) || !r.source.trim();
  const set = (id: string, patch: Partial<DataRow>) => setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const save = async () => {
    setTried(true);
    const ready = editable.filter((r) => !invalid(r));
    if (!ready.length) return;
    const res = await run({ type: "data.submit", unitSlug: viewer?.portal.unitId ?? "", values: ready.map((r) => ({ id: r.id, label: r.label, value: r.value, source: r.source })) });
    if (!res.ok) {
      toast(res.message, "error");
      return;
    }
    setRows((list) => list.map((r) => (ready.some((x) => x.id === r.id) ? { ...r, status: "For review", note: undefined } : r)));
    setTried(false);
    toast(res.message);
  };

  /* Experiment: fill values from a CSV with columns id, value, source. */
  const fromCsv = async (file: File) => {
    const table = parseCsv(await file.text());
    const head = (table[0] ?? []).map((h) => h.trim().toLowerCase());
    const [ci, cv, cs] = ["id", "value", "source"].map((k) => head.indexOf(k));
    if (ci < 0 || cv < 0) {
      setCsvNote("The file needs id and value columns (source is optional).");
      return;
    }
    let n = 0;
    setRows((list) =>
      list.map((r) => {
        const hit = table.slice(1).find((x) => x[ci]?.trim() === r.id);
        if (!hit || r.status === "Validated" || r.status === "For review") return r;
        n++;
        return { ...r, value: hit[cv]?.trim() ?? r.value, source: cs >= 0 ? hit[cs]?.trim() || r.source : r.source };
      }),
    );
    setTimeout(() => setCsvNote(`${n} ${n === 1 ? "value" : "values"} filled from ${file.name}. Check them, then send.`), 0);
  };

  if (!rows.length)
    return (
      <Card>
        <Empty icon="data" title="No reporting-period values assigned">
          The Office has not assigned values to {viewer?.portal.programName ?? viewer?.portal.unitName ?? "your unit"} for the rankings it tracks this cycle.
        </Empty>
      </Card>
    );

  return (
    <>
      {editable.length > 0 && (
        <Notice tone="info">
          Enter values for the reporting period each ranking asks for. Figures use the units shown, and every value needs a source document so
          reviewers can check it.
        </Notice>
      )}
      {spreadsheet && editable.length > 0 && (
        <Notice tone="plain" icon="flask">
          <span className="row" style={{ ["--gap" as string]: "10px", flexWrap: "wrap" } as CSSProperties}>
            <span>Experiment: fill the values from a spreadsheet saved as CSV (columns id, value, source).</span>
            <label className="btn btn--sm">
              <Icon name="upload" size={15} /> Upload CSV
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => e.target.files?.[0] && void fromCsv(e.target.files[0])} />
            </label>
            {csvNote && <b className="small">{csvNote}</b>}
          </span>
        </Notice>
      )}
      <Card title="Reporting-period data" sub={`${editable.length} values to enter · ${rows.filter((r) => r.status === "Validated").length} validated`} icon="data" bodyClass="card__body--flush">
        <div className="table-wrap">
          <table className="table table--stack datatable">
            <thead>
              <tr>
                <th>Data point</th>
                <th>Reporting period</th>
                <th style={{ width: 170 }}>Value</th>
                <th style={{ width: 230 }}>Source document</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const locked = r.status === "Validated" || r.status === "For review";
                const bad = tried && !locked && invalid(r);
                return (
                  <tr key={r.id}>
                    <td>
                      <span className="table__primary">{r.label}</span>
                      <span className="table__sub row" style={{ ["--gap" as string]: "6px" } as CSSProperties}>
                        <RankingName slug={r.ranking} /> · {r.indicator}
                      </span>
                      {r.note && (
                        <span className="table__sub" style={{ color: "var(--revise)", fontWeight: 500 }}>
                          {r.note}
                        </span>
                      )}
                    </td>
                    <td data-label="Period" className="small text-2">
                      {r.period}
                    </td>
                    <td data-label="Value">
                      {locked ? (
                        <b className="num">
                          {r.value} <span className="muted small">{r.unit}</span>
                        </b>
                      ) : (
                        <span className="input-group">
                          <input
                            inputMode="decimal"
                            aria-label={`${r.label} value in ${r.unit}`}
                            aria-invalid={(tried && !isNumber(r.value)) || undefined}
                            value={r.value}
                            onChange={(e) => set(r.id, { value: e.target.value })}
                            placeholder="0"
                            className="num"
                          />
                          <span className="small">{r.unit}</span>
                        </span>
                      )}
                    </td>
                    <td data-label="Source">
                      {locked ? (
                        <span className="chip chip--outline">
                          <Icon name="paperclip" size={13} /> {r.source}
                        </span>
                      ) : (
                        <input
                          className="input input--sm"
                          aria-label={`${r.label} source document`}
                          aria-invalid={(tried && !r.source.trim()) || undefined}
                          value={r.source}
                          onChange={(e) => set(r.id, { source: e.target.value })}
                          placeholder="File name or public URL"
                        />
                      )}
                    </td>
                    <td data-label="Status">
                      <Status status={r.status} />
                      {bad && (
                        <span className="field__error mt-2">
                          <Icon name="alert" size={13} /> {isNumber(r.value) ? "Add a source" : "Enter a number"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="row row--between">
        <p className="small muted">Values are checked against the reporting window before review. Validated values are locked.</p>
        <button type="button" className="btn btn--dark" onClick={() => void save()} disabled={!editable.length || pending}>
          <Icon name="send" size={18} /> Send values for validation
        </button>
      </div>
    </>
  );
}
