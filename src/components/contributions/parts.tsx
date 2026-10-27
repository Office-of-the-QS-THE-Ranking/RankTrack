import { STAGES, daysUntil, formatDate, type EvidenceItem, type EvidenceStatus } from "@/lib/data";
import { guessFileKind, isFileKind, type EvidenceFileKind } from "@/lib/governance/evidence-files";
import type { HubUnit } from "@/lib/governance/hub-types";
import { UnitMark } from "@/components/units/UnitMark";
import type { IconName } from "@/components/ui/Icon";
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

/* ---------- A submission's parts, as the record and the composer show them ---------- */

/** The four tabs a submission is read and written in. */
export const SUBMISSION_TABS = ["Overview", "Narrative", "Evidence", "References"] as const;
export type SubmissionTab = (typeof SUBMISSION_TABS)[number];

/** Each kind of file: its icon and what a group of them is called. */
export const KIND: Record<EvidenceFileKind, { icon: IconName; many: string }> = {
  Report: { icon: "evidence", many: "Reports" },
  "Survey copy": { icon: "clipboard", many: "Survey copies" },
  Photo: { icon: "image", many: "Photos" },
  Attendance: { icon: "users", many: "Attendance sheets" },
  Certificate: { icon: "shield-check", many: "Certificates" },
  Data: { icon: "data", many: "Data" },
  Agreement: { icon: "pen", many: "Agreements" },
  Other: { icon: "paperclip", many: "Other files" },
};

const isUrl = (s: string) => /^https?:\/\//i.test(s);

/** "4,820 cubic metres reused": the figure to set large, then what it counts. */
export function splitResult(result: string) {
  const m = /^\s*([~≈<>+]?\s*\d[\d,.]*\s?%?)\s*(.*)$/.exec(result);
  return m ? { figure: m[1].trim(), measure: m[2].trim() } : { figure: "", measure: result.trim() };
}

/** The beneficiaries line as the form writes it ("who, how many", once also ". Verified by …"), in its parts. */
export function splitReach(text: string, verifiedBy?: string) {
  let who = text.trim();
  let verified = verifiedBy ?? "";
  const v = who.lastIndexOf(". Verified by ");
  if (v >= 0) {
    verified ||= who.slice(v + 14).trim();
    who = who.slice(0, v).trim();
  }
  const c = /^(.*?),\s*(\d[\d,]*)$/.exec(who);
  return c ? { who: c[1], count: c[2], verified } : { who, count: "", verified };
}

export type ShownFile = { name: string; src?: string; bytes?: number; kind: EvidenceFileKind };

/** The record's files with what each is; older records named theirs only, and kept a link among them. */
export function filesOf(e: EvidenceItem): ShownFile[] {
  const up = e.attachments ?? [];
  const named = e.files.filter((f) => !isUrl(f) && !up.some((a) => a.name === f));
  return [...up.map((a) => ({ ...a, kind: isFileKind(a.kind) ? a.kind : guessFileKind(a.name) })), ...named.map((name) => ({ name, kind: guessFileKind(name) }))];
}

export function linksOf(e: EvidenceItem) {
  return e.links?.length ? e.links : e.files.filter(isUrl).map((url) => ({ url, label: "" }));
}

/** www.ust.edu.ph/sustainability → ust.edu.ph, and the rest of the address after it. */
export function hostOf(url: string) {
  try {
    const u = new URL(url);
    const rest = `${u.pathname === "/" ? "" : u.pathname}${u.search}`.replace(/\/$/, "");
    return { host: u.hostname.replace(/^www\./, ""), rest };
  } catch {
    return { host: url, rest: "" };
  }
}
