import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Card, Due, Empty, Meter, PageHeader, RankingName, Status } from "@/components/ui/primitives";
import { TemplateButton } from "@/components/contribute/TemplateButton";
import { Gate } from "@/components/hub/Gate";
import { portalContext } from "@/lib/governance/server/portal";

export const metadata = { title: "My assigned requirements" };

export default async function Requirements() {
  const ctx = await portalContext();
  const reqs = ctx.requirements
    .filter((r) => ctx.hub.isActive(r.ranking))
    .sort((a, b) => Number(a.status === "Validated") - Number(b.status === "Validated") || a.due.localeCompare(b.due));
  const done = reqs.filter((r) => r.status === "Validated").length;
  const pct = reqs.length ? Math.round((done / reqs.length) * 100) : 0;
  if (!reqs.length)
    return (
      <Gate path="/portal/requirements" title="My assigned requirements">
        <PageHeader title="My assigned requirements" lede={`Requirements the Office assigns to ${ctx.unit.name} appear here, each with its template.`} />
        <Card>
          <Empty icon="clipboard" title="No requirements assigned this cycle">
            {ctx.scopeNote ?? "The Office assigns requirements when a ranking's data collection opens. Open actions appear on your dashboard."}
          </Empty>
        </Card>
      </Gate>
    );
  return (
    <Gate path="/portal/requirements" title="My assigned requirements">
      <PageHeader
        title="My assigned requirements"
        lede="Each requirement names the ranking indicator it serves and comes with a template. Open items are listed first, soonest due."
        actions={
          <div className="progress-pill">
            <span>
              <b>
                {done} of {reqs.length}
              </b>{" "}
              completed
            </span>
            <Meter value={pct} tone="gold" label="Requirements completed" />
          </div>
        }
      />
      <Card bodyClass="card__body--flush" label="Assigned requirements">
        <div className="table-wrap">
          <table className="table table--hover table--stack">
            <thead>
              <tr>
                <th>Requirement</th>
                <th>Ranking and indicator</th>
                <th>Due</th>
                <th>Status</th>
                <th>Template</th>
                <th className="r">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {reqs.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="table__primary">{r.title}</span>
                    <span className="table__sub num">{r.id}</span>
                  </td>
                  <td data-label="Ranking">
                    <RankingName slug={r.ranking} />
                    <span className="table__sub">{r.indicator}</span>
                  </td>
                  <td data-label="Due" className="num">
                    <Due iso={r.due} withDays={r.status !== "Validated"} />
                  </td>
                  <td data-label="Status">
                    <Status status={r.status} />
                  </td>
                  <td data-label="Template">
                    <TemplateButton file={r.template} />
                  </td>
                  <td className="r">
                    {r.status === "Validated" ? (
                      <Link href={`/portal/history${r.evidenceId ? `#${r.evidenceId}` : ""}`} className="btn btn--ghost btn--sm">
                        View
                      </Link>
                    ) : r.status === "Needs revision" ? (
                      <Link href="/portal/feedback" className="btn btn--dark btn--sm">
                        <Icon name="comment" size={15} /> Revise
                      </Link>
                    ) : ctx.can.submit ? (
                      <Link href="/portal/submit" className="btn btn--primary btn--sm">
                        <Icon name="upload" size={15} /> Submit
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Gate>
  );
}
