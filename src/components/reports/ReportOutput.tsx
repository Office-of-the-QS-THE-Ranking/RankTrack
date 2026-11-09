"use client";

/*
 * What takes a report out of the Hub: release it (goes for approval), print it, or export it. An export is checked
 * against each dataset's classification, and a blocked one offers to ask for access. Reports and the Units page both
 * use this, so a report leaves the same way, under the same rules, from wherever it is read.
 */
import { useState } from "react";
import { download } from "@/components/admin/ui";
import { useCan, useGovern, useHub, useViewer } from "@/components/hub/HubProvider";
import { Icon } from "@/components/ui/Icon";
import { DateField } from "@/components/ui/pickers";
import { cx } from "@/components/ui/primitives";
import { toast } from "@/components/ui/toast";
import { Sheet } from "@/components/workspace/parts";
import { csv } from "@/lib/analytics/brief";

export function ReportOutput({
  report,
  datasets,
  head,
  rows,
  print = false,
  strip = false,
}: {
  /** The report's name, as the audit trail and the file name carry it. */
  report: string;
  datasets: string[];
  head: string[];
  rows: (string | number)[][];
  /** Offer printing: only where the page's print styles lay the report out on paper. */
  print?: boolean;
  /** Sit in a content tab strip, as its pill buttons. */
  strip?: boolean;
}) {
  const viewer = useViewer();
  const hub = useHub();
  const can = useCan();
  const { run, pending } = useGovern();
  const cycle = hub?.currentCycle ?? "";
  const [blocked, setBlocked] = useState<{ datasetId: string; name: string } | null>(null);
  const [ask, setAsk] = useState({ until: "", why: "" });
  const [releasing, setReleasing] = useState(false);
  const [audience, setAudience] = useState("");
  const plain = strip ? "btn content-tabs__action" : "btn btn--sm";

  const exportCsv = async () => {
    const r = await run({ type: "report.export", report, cycle, rows: rows.length, datasets });
    if (!r.ok) {
      if (r.needsApproval) setBlocked(r.needsApproval);
      else toast(r.message, "error");
      return;
    }
    const mark = (r.data as { watermark?: string | null } | undefined)?.watermark;
    download(`${report} ${cycle}`.toLowerCase().replace(/\s+/g, "-") + ".csv", csv([...(mark ? [[mark]] : []), head, ...rows]));
    toast(r.message);
  };

  const buttons = (
    <>
      {can("reports", "create") && (
        <button type="button" className={plain} onClick={() => setReleasing(true)}>
          <Icon name="send" size={15} /> Release
        </button>
      )}
      {print && (
        <button type="button" className={plain} onClick={() => window.print()}>
          <Icon name="reports" size={15} /> Print or PDF
        </button>
      )}
      {can("reports", "export") && (
        <button type="button" className={cx(plain, !strip && "btn--dark")} disabled={!rows.length || pending} onClick={() => void exportCsv()}>
          <Icon name="download" size={15} /> Export CSV
        </button>
      )}
    </>
  );

  return (
    <>
      {strip ? buttons : <div className="rr-export">{buttons}</div>}

      {blocked && (
        <Sheet title="Ask for export access" onClose={() => setBlocked(null)}>
          {(close) => (
            <form
              className="ws-sheet__body"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await run({
                  type: "request.create",
                  workflowId: "data-access",
                  payload: { kind: "data-access", accountId: viewer?.id ?? "", datasetId: blocked.datasetId, access: "Export", until: ask.until },
                  justification: ask.why,
                });
                toast(r.message, r.ok ? "ok" : "error");
                if (r.ok) {
                  setAsk({ until: "", why: "" });
                  close();
                }
              }}
            >
              <p className="rr-sheet-lead">
                <Icon name="lock" size={15} /> {blocked.name} needs approval to leave the Hub.
              </p>
              <label className="an-field">
                <span>Access until</span>
                <DateField value={ask.until} onChange={(v) => setAsk({ ...ask, until: v })} required />
              </label>
              <label className="an-field">
                <span>Who it is for</span>
                <input className="input" value={ask.why} onChange={(e) => setAsk({ ...ask, why: e.target.value })} placeholder="Management review on 4 November" required />
              </label>
              <footer className="ws-sheet__foot">
                <button type="button" className="btn" onClick={close}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--dark" disabled={pending}>
                  Send request
                </button>
              </footer>
            </form>
          )}
        </Sheet>
      )}

      {releasing && (
        <Sheet title={`Release ${report}`} onClose={() => setReleasing(false)}>
          {(close) => (
            <form
              className="ws-sheet__body"
              onSubmit={async (e) => {
                e.preventDefault();
                const r = await run({ type: "report.publish", report, cycle, justification: audience });
                toast(r.message, r.ok ? "ok" : "error");
                if (r.ok) {
                  setAudience("");
                  close();
                }
              }}
            >
              <label className="an-field">
                <span>Who it is for</span>
                <input className="input" value={audience} onChange={(e) => setAudience(e.target.value)} minLength={10} placeholder="The Rector's council" required autoFocus />
              </label>
              <footer className="ws-sheet__foot">
                <button type="button" className="btn" onClick={close}>
                  Cancel
                </button>
                <button type="submit" className="btn btn--dark" disabled={pending}>
                  Send for approval
                </button>
              </footer>
            </form>
          )}
        </Sheet>
      )}
    </>
  );
}
