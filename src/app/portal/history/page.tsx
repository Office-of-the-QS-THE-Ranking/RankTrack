import type { CSSProperties } from "react";
import { formatDate } from "@/lib/data";
import { evidenceLevels } from "@/lib/reference";
import { reference } from "@/lib/governance/server/reference";
import { Icon } from "@/components/ui/Icon";
import { Card, Empty, PageHeader, SdgList, Status } from "@/components/ui/primitives";
import { StageTrack } from "@/components/contributions/StageTrack";
import { Gate } from "@/components/hub/Gate";
import { portalContext } from "@/lib/governance/server/portal";

export const metadata = { title: "Submission history" };

export default async function History() {
  const levels = evidenceLevels(await reference());
  const ctx = await portalContext();
  const mine = [...ctx.evidence].sort((a, b) => b.submitted.localeCompare(a.submitted));
  return (
    <Gate path="/portal/history" title="Submission history">
      <PageHeader
        title="Submission history"
        lede="Every submission, where it is now, and where it counts. You should never have to wonder what happened to your evidence."
      />
      {!mine.length && (
        <Card>
          <Empty icon="history" title="Nothing submitted yet">
            {ctx.scopeNote ?? `Submissions from ${ctx.unit.name} appear here with every stage they pass.`}
          </Empty>
        </Card>
      )}
      <div className="stack" style={{ ["--gap" as string]: "16px" } as CSSProperties}>
        {mine.map((e) => (
          <Card
            key={e.id}
            id={e.id}
            title={e.title}
            sub={
              <>
                <span className="num">{e.id}</span> · {e.unit} · {e.type} · {e.period} · submitted {formatDate(e.submitted, { day: "numeric", month: "short", year: "numeric" })} by{" "}
                {e.submittedBy}
              </>
            }
            actions={<Status status={e.status} />}
          >
            <StageTrack stage={e.stage} status={e.status} />
            <div className="grid cols-2 mt-6">
              <dl className="kv">
                <dt>Result</dt>
                <dd>{e.result}</dd>
                <dt>Beneficiaries</dt>
                <dd>{e.beneficiaries}</dd>
                <dt>Evidence quality</dt>
                <dd>{levels[e.level - 1]}</dd>
                <dt>SDGs</dt>
                <dd>
                  <SdgList sdgs={e.sdgs} />
                </dd>
                <dt>Files</dt>
                <dd className="chips">
                  {e.files.map((f) => (
                    <span key={f} className="chip chip--outline">
                      <Icon name="paperclip" size={13} /> {f}
                    </span>
                  ))}
                </dd>
              </dl>
              <div className="used">
                <p className="used__line" style={{ marginTop: 0 }}>
                  {e.status === "Validated" ? "This submission supports" : "Proposed for"}
                </p>
                <ul className="used__list">
                  {e.mappedTo.map((m) => (
                    <li key={m}>
                      <Icon name={e.status === "Validated" ? "check" : "minus"} size={15} strokeWidth={2.2} /> {m}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Gate>
  );
}
