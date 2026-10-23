"use client";

import { Icon } from "@/components/ui/Icon";

/** Downloads a ready-to-fill template (CSV) named after the requirement's template. */
export function TemplateButton({ file }: { file: string }) {
  const csvName = file.replace(/\.(xlsx|docx|csv)$/i, "") + ".csv";
  return (
    <button
      type="button"
      className="chip chip--outline chip--btn"
      onClick={() => {
        const cols = ["Item", "Reporting period", "Value", "Unit", "Source document", "Notes"];
        const url = URL.createObjectURL(new Blob([cols.join(",") + "\n"], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = csvName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}
      aria-label={`Download template ${csvName}`}
    >
      <Icon name="download" size={13} /> {file}
    </button>
  );
}
