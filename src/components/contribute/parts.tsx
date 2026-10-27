import { STAGES, daysUntil, formatDate, type EvidenceStatus } from "@/lib/data";
import type { HubUnit } from "@/lib/governance/hub-types";
import { UnitMark } from "@/components/units/UnitMark";
import { cx } from "@/components/ui/primitives";

/* Shared by the Overview, the Contributions table and the record. */

export const TONE: Record<EvidenceStatus, string> = {
  Validated: "ok",
  "For review": "review",
  "Needs revision": "revise",
  "Not yet submitted": "missing",
  "Not applicable": "missing",
};

/** "Today", "3d", "4w", then the date. */
export function ago(iso: string) {
  const d = -daysUntil(iso);
  if (d <= 0) return "Today";
  if (d < 7) return `${d}d`;
  if (d < 56) return `${Math.round(d / 7)}w`;
  return formatDate(iso);
}

export function fileKind(name: string) {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  const kind =
    ext === "pdf"
      ? "pdf"
      : ["xls", "xlsx", "csv", "ods"].includes(ext)
        ? "sheet"
        : ["doc", "docx", "odt", "rtf", "txt"].includes(ext)
          ? "doc"
          : ["ppt", "pptx", "key"].includes(ext)
            ? "slides"
            : ["png", "jpg", "jpeg", "webp", "gif", "heic"].includes(ext)
              ? "image"
              : "other";
  return { ext: ext.slice(0, 4).toUpperCase() || "FILE", kind };
}

export const fileSize = (b: number) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);

/** A unit's logo or arms, else its code (or initials when the directory has no entry). */
export function Mark({ unit, name, big }: { unit?: HubUnit; name: string; big?: boolean }) {
  const code = unit?.code ?? name.split(/\s+/).filter((w) => /^[A-Z]/.test(w)).map((w) => w[0]).join("").slice(0, 3);
  return <UnitMark emblem={unit?.emblem ?? null} code={code} className={cx("cv-mark", big && "cv-mark--big")} />;
}

/** Five ticks for the submission's stage; the current one gold, or orange when it was sent back. */
export function MiniTrack({ stage, status }: { stage: number; status: EvidenceStatus }) {
  const flagged = status === "Needs revision";
  return (
    <span className="cv-mini">
      {STAGES.map((s, k) => (
        <i key={s} className={k < stage ? "is-done" : k === stage ? (flagged ? "is-flag" : "is-now") : undefined} aria-hidden="true" />
      ))}
      <span className="sr-only">{flagged ? "Needs revision" : STAGES[stage]}</span>
    </span>
  );
}
