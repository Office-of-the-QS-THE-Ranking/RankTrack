import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { NAV } from "@/components/shell/nav";
import { Card, Empty, PageHeader } from "@/components/ui/primitives";
import { moduleInfo } from "@/lib/governance/catalog";
import { featureOn } from "@/lib/governance/derive";
import { getViewer } from "@/lib/governance/server/session";
import { readState } from "@/lib/governance/server/store";
import { viewerCan } from "@/lib/governance/viewer";

/**
 * Server-side guard for a workspace page: the same permission and feature the navigation row needs.
 * Navigation hides what a role cannot use; this stops anyone reaching it by address.
 */
export async function Gate({ path, title, children }: { path: string; title: string; children: ReactNode }) {
  const viewer = await getViewer();
  const variant = path.startsWith("/portal") ? "unit" : "office";
  const item = NAV[variant].flatMap((g) => g.items).find((i) => i.href === path);
  // Fail closed: no session goes to sign-in (a layout isn't re-rendered on client navigation, so it can't be the
  // only check), and a path missing from the navigation is never shown by default.
  if (!viewer) redirect(`/signin?next=${encodeURIComponent(path)}`);
  if (!item) throw new Error(`Gate: ${path} is not in the ${variant} navigation, so no permission guards it.`);
  const target = variant === "unit" ? { unitId: viewer.portal.programId ?? viewer.portal.unitId } : {};
  const featureName = item.feature ? (await readState()).config.features.find((f) => f.id === item.feature)?.name : undefined;
  const switchedOff = item.feature && !featureOn((await readState()), item.feature);
  const denied = item.need && !viewerCan(viewer, item.need[0], item.need[1], target);
  if (!switchedOff && !denied) return children;
  return (
    <>
      <PageHeader title={title} />
      <Card>
        <Empty icon={switchedOff ? "settings" : "lock"} title={switchedOff ? `${featureName ?? title} is switched off` : "Not part of your role"}>
          {switchedOff ? (
            <>The Office has turned this off in System Configuration. It comes back as soon as it is switched on again.</>
          ) : (
            <>
              {viewer.roleName} does not include <b>{moduleInfo(item.need![0]).label.toLowerCase()}: {item.need![1]}</b>
              {variant === "unit" ? ` for ${viewer.portal.programName ?? viewer.portal.unitName}` : ""}. Ask your unit administrator or the Office to
              request it through an approval workflow.
            </>
          )}
          <p style={{ marginTop: 12 }}>
            <Link href={variant === "unit" ? "/portal" : "/admin"} className="btn btn--sm">
              Back to the dashboard
            </Link>
          </p>
        </Empty>
      </Card>
    </>
  );
}
