import { Fragment } from "react";
import { PORTAL_EXPANSION, PORTAL_WORD } from "@/lib/brand";

export type Step = "start" | "request" | "track";

/** Each step's heading: two words, one of them in gilt italic. The start step is the portal's name on one row,
    the gilt word first, with what it stands for under it. */
const HEADINGS: Record<Step, { lines: [string, string]; gold: 0 | 1 }> = {
  start: { lines: [PORTAL_WORD, "Portal"], gold: 0 },
  request: { lines: ["Request", "Access"], gold: 1 },
  track: { lines: ["Submission", "Tracker"], gold: 1 },
};

/** The active step keeps the sidebar's ivory and gold serif heading. */
export function FlowHeading({ step = "start" }: { step?: Step }) {
  const { lines, gold } = HEADINGS[step];
  const start = step === "start";
  const heading = (
    <h1 className={`signin__display${start ? " signin__display--name" : ""}`}>
      {lines.map((line, i) => (
        <Fragment key={line}>
          {i > 0 && " "}
          <span className={`signin__row${i === gold ? " signin__row--gold" : ""}`}>
            <span>{line}</span>
          </span>
        </Fragment>
      ))}
    </h1>
  );
  if (!start) return heading;
  return (
    <div className="signin__title">
      {heading}
      <p className="signin__expansion">{PORTAL_EXPANSION}</p>
    </div>
  );
}
