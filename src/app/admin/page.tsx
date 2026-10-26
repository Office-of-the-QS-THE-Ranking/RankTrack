import Link from "next/link";
import { formatAsOf } from "@/lib/data";
import { hub } from "@/lib/governance/server/hub";
import { getViewer } from "@/lib/governance/server/session";
import { viewerCan } from "@/lib/governance/viewer";
import { Icon } from "@/components/ui/Icon";
import { InfoTooltip } from "@/components/ui/interactive";
import { SubmissionsBoard } from "@/components/dashboard/SubmissionsBoard";
import { Welcome } from "@/components/dashboard/Welcome";
import { RankingsOverview } from "@/components/rankings/Overview";

export const metadata = {
  title: {
    absolute: "Executive dashboard · Office workspace · UST Rankings Hub",
  },
};

const VIEWS = [
  { key: "submissions", label: "Submissions", href: "/admin" },
  { key: "rankings", label: "Rankings", href: "/admin?view=rankings" },
] as const;

export default async function ExecutiveDashboard({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const h = await hub();
  const viewer = await getViewer();
  // System Configuration sets which view opens first; the switch below still changes it.
  const asked = (await searchParams).view;
  const view = asked === "rankings" || asked === "submissions" ? asked : h.dashboard.officeView;

  return (
    <div className="ov">
      <header className="ov__head">
        <div className="ov__title-row">
          <h1 className="ov__title">Dashboard</h1>
          <InfoTooltip>As of {formatAsOf(h.site.asOf)}</InfoTooltip>
        </div>
        <nav className="ov-switch" aria-label="Dashboard view">
          {VIEWS.map((v) => (
            <Link
              key={v.key}
              href={v.href}
              className="ov-switch__opt"
              aria-current={view === v.key ? "page" : undefined}
              scroll={false}
            >
              {v.label}
            </Link>
          ))}
        </nav>
        <div className="ov__actions">
          <Link href="/admin/reports" className="btn btn--sm">
            <Icon name="download" size={16} /> Report
          </Link>
        </div>
      </header>

      <Welcome h={h} viewer={viewer} />

      {view === "rankings" ? (
        <div className="ov-rankings">
          <RankingsOverview
            mode="internal"
            embedded
            rankings={h.rankings}
            evidence={h.evidence.filter((e) => viewerCan(viewer, "evidence", "view", { unitId: e.unitSlug }))}
          />
        </div>
      ) : (
        <SubmissionsBoard h={h} viewer={viewer} />
      )}
    </div>
  );
}
