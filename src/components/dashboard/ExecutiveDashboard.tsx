import type { ReactNode } from "react";
import Link from "@/components/hub/paths";
import { formatAsOf } from "@/lib/data";
import type { Hub } from "@/lib/governance/hub-build";
import type { Viewer } from "@/lib/governance/viewer";
import { Icon } from "@/components/ui/Icon";
import { InfoTooltip } from "@/components/ui/interactive";
import { DashboardViewSwitch, type DashboardView } from "./DashboardViewSwitch";
import { DashboardViewPanel } from "./DashboardViewPanel";
import { SubmissionsBoard } from "./SubmissionsBoard";
import { OfficeWelcome } from "./Welcome";
import { RecognitionWall } from "@/components/recognition/RecognitionWall";

/**
 * The executive dashboard (/admin): the welcome, then the Submissions board or the Recognition wall. The page loads
 * the data; the portal demo renders this same component from its fixtures.
 */
export function ExecutiveDashboard({ h, viewer, view, views, requests, actions }: { h: Hub; viewer: Viewer | null; view: DashboardView; views: DashboardView[]; requests: ReactNode; actions: ReactNode }) {
  return (
    <div className="ov">
      <header className="ov__head">
        <div className="ov__title-row">
          <h1 className="ov__title">Dashboard</h1>
          <InfoTooltip>As of {formatAsOf(h.site.asOf)}</InfoTooltip>
        </div>
        <DashboardViewSwitch view={view} views={views} />
        <div className="ov__actions">
          <Link href="/admin/workspace/build-a-report" className="btn btn--sm">
            <Icon name="download" size={16} /> Report
          </Link>
        </div>
      </header>

      <OfficeWelcome h={h} viewer={viewer} />

      <DashboardViewPanel view={view} views={views}>
        {view === "recognition" ? <RecognitionWall h={h} mode="internal" embedded /> : <SubmissionsBoard h={h} viewer={viewer} requests={requests} actions={actions} />}
      </DashboardViewPanel>
    </div>
  );
}

/** Which dashboard views System Configuration allows, and the one asked for. */
export function dashboardViews(recognitionOn: boolean, asked?: string): { views: DashboardView[]; view: DashboardView } {
  const views: DashboardView[] = ["submissions"];
  if (recognitionOn) views.push("recognition");
  return { views, view: views.find((v) => v === asked) ?? "submissions" };
}
