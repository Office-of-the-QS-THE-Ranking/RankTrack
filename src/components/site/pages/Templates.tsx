"use client";

const TEMPLATES = [
  {
    name: "Evidence submission template",
    note: "One row per piece of evidence, with its period, result and the rankings it supports.",
    file: "evidence-submission-template.csv",
    cols: [
      "Title",
      "Reporting period",
      "Measurable result",
      "Unit of measure",
      "Beneficiaries",
      "Number of beneficiaries",
      "SDGs",
      "Evidence files or URL",
      "Rankings",
    ],
  },
  {
    name: "Impact story template",
    note: "The showcase format, from challenge to replication guidance.",
    file: "impact-story-template.csv",
    cols: [
      "Challenge",
      "Thomasian response",
      "Implementation",
      "Measurable outcome",
      "Beneficiaries",
      "SDGs",
      "Rankings",
      "Replication guidance",
      "Lessons for other institutions",
    ],
  },
  {
    name: "Reporting-period data template",
    note: "Indicator values with their period, source document and data owner.",
    file: "reporting-data-template.csv",
    cols: ["Indicator", "Ranking", "Reporting period", "Value", "Unit", "Source document", "Data owner"],
  },
];

function download(file: string, cols: string[]) {
  const url = URL.createObjectURL(new Blob([cols.map((c) => `"${c}"`).join(",") + "\n"], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The forms units fill in, as CSV files with the right columns. */
export function Templates() {
  return (
    <ul className="w-templates">
      {TEMPLATES.map((t, i) => (
        <li key={t.file} className="w-template" data-reveal style={{ ["--d" as string]: `${i * 80}ms` }}>
          <span className="w-template__name">{t.name}</span>
          <span className="w-template__note">{t.note}</span>
          <span className="w-template__cols">{t.cols.length} columns, CSV</span>
          <button type="button" className="w-btn w-btn--ink w-btn--sm" onClick={() => download(t.file, t.cols)}>
            Download
          </button>
        </li>
      ))}
    </ul>
  );
}
