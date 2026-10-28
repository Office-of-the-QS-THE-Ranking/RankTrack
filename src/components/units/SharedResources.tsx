import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { Card, Empty, Notice, PageHeader } from "@/components/ui/primitives";
import { hub } from "@/lib/governance/server/hub";
import { getViewer } from "@/lib/governance/server/session";
import { RequestDataAccess } from "./RequestDataAccess";

const fmt = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** An external collaborator's workspace: only the resources the Office approved, for as long as approved. */
export async function SharedResources() {
  const viewer = (await getViewer())!;
  const h = await hub();
  const state = h.state;
  const scoped = new Set(viewer.grants.flatMap((g) => (g.datasets === "all" ? [] : g.datasets)));
  const granted = new Map(viewer.dataGrants.map((g) => [g.datasetId, g]));
  const ids = [...new Set([...scoped, ...granted.keys()])];
  const sets = ids.map((id) => state.datasets.find((d) => d.id === id)).filter((d): d is NonNullable<typeof d> => !!d);
  const ends = viewer.grants.map((g) => g.expires).filter(Boolean).sort()[0];
  const steward = (id: string) => state.accounts.find((a) => a.id === id)?.name ?? id;
  return (
    <>
      <PageHeader
        title="Shared with you"
        lede={`As an external collaborator you see only what the Office approved for your engagement${ends ? `, until ${fmt(ends)}` : ""}. Access ends automatically.`}
      />
      {!state.security.sharing.guestDownloads && (
        <Notice tone="plain" icon="lock">
          Downloads by sponsored guests are switched off: you can read these resources here but not export them.
        </Notice>
      )}
      <Card title="Datasets" icon="data" sub={`${sets.length} approved`}>
        {sets.length ? (
          <ul className="list">
            {sets.map((d) => (
              <li key={d.id}>
                <span className="list__main">{d.name}</span>
                <span className="list__aside small">{granted.get(d.id) ? `${granted.get(d.id)!.access} until ${fmt(granted.get(d.id)!.until)}` : d.classification}</span>
                <span className="list__sub">
                  {d.description} Steward: {steward(d.stewardId)}.
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon="lock" title="Nothing shared yet">
            The Office has not approved any dataset for you.
          </Empty>
        )}
      </Card>
      <div className="grid cols-2">
        <Card title="Published reports" icon="reports">
          {h.publishedReports.length ? (
            <ul className="list">
              {h.publishedReports.map((r) => (
                <li key={r.id}>
                  <span className="list__main">{r.title}</span>
                  <span className="list__sub">Released {fmt(r.at)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="small muted">No reports released outside the Office yet.</p>
          )}
        </Card>
        <Card title="Methods and results" icon="knowledge">
          <ul className="list">
            <li>
              <Link href="/portal/workspace/knowledge" className="list__main">
                Knowledge Center <Icon name="arrow" size={14} />
              </Link>
              <span className="list__sub">Methodologies and the indicator dictionary</span>
            </li>
            <li>
              <Link href="/rankings" className="list__main">
                Published results <Icon name="arrow" size={14} />
              </Link>
              <span className="list__sub">On the public website</span>
            </li>
          </ul>
        </Card>
      </div>
      <RequestDataAccess datasets={state.datasets.filter((d) => !ids.includes(d.id)).map((d) => ({ id: d.id, name: d.name, classification: d.classification }))} />
    </>
  );
}
