"use client";

import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/interactive";

export type DashboardView = "submissions" | "rankings" | "recognition";

export const DASHBOARD_VIEWS = [
  { key: "submissions", label: "Submissions" },
  { key: "rankings", label: "Rankings" },
  { key: "recognition", label: "Recognition" },
] as const;

export function DashboardViewSwitch({ view, views }: { view: DashboardView; views: DashboardView[] }) {
  const router = useRouter();

  return (
    <Tabs
      tabs={DASHBOARD_VIEWS.filter((v) => views.includes(v.key))}
      value={view}
      label="Dashboard view"
      idBase="dashboard-view"
      onChange={(next) => {
        if (next !== view) router.push(`/admin?view=${next}`, { scroll: false });
      }}
    />
  );
}
