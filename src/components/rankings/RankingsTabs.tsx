"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useCan } from "@/components/hub/HubProvider";
import { rankingOverviewTabs } from "@/components/shell/nav";
import { TabPanel, Tabs } from "@/components/ui/interactive";

const ID_BASE = "rankings-overview";

/**
 * The Rankings overview's content tabs. Each tab is a page of its own with its own address, so a tab loads its data only
 * when opened and a link can point straight at it. Only the tabs the viewer may use are shown; their pages check again.
 */
export function RankingsTabs({ base, children }: { base: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const can = useCan();
  const tabs = useMemo(() => rankingOverviewTabs(base).filter((t) => can(t.need[0], t.need[1])), [base, can]);
  // The tab just chosen shows as current at once, while its page is on the way.
  const [going, setGoing] = useState<{ href: string; from: string } | null>(null);
  const at = going?.from === pathname ? going.href : pathname;
  const index = tabs.findIndex((t) => t.href === at);

  // The skeleton of each tab comes ahead of time, so switching is immediate.
  useEffect(() => {
    for (const t of tabs) router.prefetch(t.href);
  }, [tabs, router]);

  // Someone who reached a tab that isn't theirs by its address sees only the page's own refusal.
  if (index < 0) return children;

  return (
    <div className="stack">
      <Tabs
        tabs={tabs.map((t) => ({ key: t.href, label: t.label }))}
        value={at}
        onChange={(href) => {
          if (href === pathname) return;
          setGoing({ href, from: pathname });
          router.push(href, { scroll: false });
        }}
        label="Rankings overview"
        idBase={ID_BASE}
      />
      <TabPanel idBase={ID_BASE} index={index}>
        {children}
      </TabPanel>
    </div>
  );
}
