"use client";

import { useRouter } from "next/navigation";
import { Tabs } from "@/components/ui/interactive";

const VIEWS = [
  { key: "submissions", label: "Submissions" },
  { key: "rankings", label: "Rankings" },
] as const;

export function DashboardViewSwitch({ view }: { view: "submissions" | "rankings" }) {
  const router = useRouter();

  return (
    <Tabs
      tabs={VIEWS}
      value={view}
      label="Dashboard view"
      idBase="dashboard-view"
      onChange={(next) => {
        if (next !== view) router.push(`/admin?view=${next}`, { scroll: false });
      }}
    />
  );
}
