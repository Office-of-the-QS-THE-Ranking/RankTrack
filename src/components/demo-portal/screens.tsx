"use client";

/*
 * The portal demo's pages: the Hub's own screens (UnitDashboard, MySubmissions, ExecutiveDashboard, UnitSubmissions),
 * given the demo's governed data instead of the server's. No screen here is a copy; each is the real component.
 */
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { UnitDashboard } from "@/components/units/UnitDashboard";
import { MySubmissions } from "@/components/contributions/MySubmissions";
import { UnitSubmissions } from "@/components/contributions/UnitSubmissions";
import { ExecutiveDashboard, dashboardViews } from "@/components/dashboard/ExecutiveDashboard";
import { ActionsTileView, RequestsTileView } from "@/components/dashboard/SubmissionsBoard";
import { PageHeader } from "@/components/ui/primitives";
import { useReference } from "@/components/reference/ReferenceProvider";
import { portalContextFrom, submittedRows } from "@/lib/governance/portal-build";
import { featureOn } from "@/lib/governance/derive";
import { pipeline } from "@/lib/reference";
import { demoActions, demoRequestsBrief, demoUnitActions } from "@/lib/demo-portal/analytics";
import { useDemo } from "./DemoRoot";

/** /portal: the unit's dashboard (the Coordinator's, or an Administrator's new unit with nothing yet). */
export function DemoUnitHome() {
  const { h, viewer } = useDemo();
  const ctx = portalContextFrom(h, viewer);
  return <UnitDashboard ctx={ctx} plan={demoUnitActions(ctx.unit)} />;
}

/** /portal/submit: the unit's submissions, and the composer that sends new evidence. */
export function DemoSubmit() {
  const { h, viewer } = useDemo();
  const ctx = portalContextFrom(h, viewer);
  return <MySubmissions rows={submittedRows(ctx)} canSubmit={ctx.can.submit && ctx.unit.status === "Active"} note={ctx.scopeNote} />;
}

/** /admin: the executive dashboard, Submissions or Recognition. */
export function DemoOffice() {
  const { h, viewer } = useDemo();
  const params = useSearchParams();
  const { view, views } = dashboardViews(featureOn(h.state, "recognition-internal"), params.get("view") ?? undefined);
  return (
    <ExecutiveDashboard
      h={h}
      viewer={viewer}
      view={view}
      views={views}
      requests={<RequestsTileView brief={demoRequestsBrief()} />}
      actions={<ActionsTileView actions={demoActions()} warningDays={h.dashboard.deadlineWarningDays} />}
    />
  );
}

/** /admin/unit-submissions: the Office's review queue, where evidence is approved or returned. */
export function DemoUnitSubmissions() {
  const ref = useReference();
  return (
    <>
      <PageHeader title="Unit Submissions" />
      <Suspense>
        <UnitSubmissions steps={pipeline(ref)} />
      </Suspense>
    </>
  );
}
