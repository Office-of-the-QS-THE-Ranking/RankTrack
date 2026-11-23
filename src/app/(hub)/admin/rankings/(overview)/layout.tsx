import type { ReactNode } from "react";
import { RankingsTabs } from "@/components/rankings/RankingsTabs";
import { PageHeader } from "@/components/ui/primitives";

/**
 * The Rankings overview's heading and content tabs, kept on screen while a tab's panel loads. It reads no runtime data,
 * so switching tabs doesn't wait on the server; each tab's page checks its own permission.
 */
export default function RankingsOverviewLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <PageHeader title="Rankings" />
      <RankingsTabs base="/admin/rankings">{children}</RankingsTabs>
    </>
  );
}
