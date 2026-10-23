import { STAGES, type EvidenceStatus } from "@/lib/data";

/** Immediate feedback after submission: Received → Under review → Accepted → Included → Result achieved. */
export function StageTrack({ stage, status, compact }: { stage: number; status: EvidenceStatus; compact?: boolean }) {
  const flagged = status === "Needs revision";
  return (
    <ol className={`track${compact ? " track--mini" : ""}`} aria-label="Progress of this submission">
      {STAGES.map((s, k) => {
        const cls = k < stage ? "is-done" : k === stage ? (flagged ? "is-flag" : "is-now") : "";
        const label = k === stage && flagged ? "Needs revision" : s;
        return (
          <li key={s} className={cls} aria-current={k === stage ? "step" : undefined}>
            {compact ? <span className="sr-only">{label}</span> : label}
          </li>
        );
      })}
    </ol>
  );
}
