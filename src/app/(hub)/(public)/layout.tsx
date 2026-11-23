import { SiteFrame } from "@/components/site/SiteFrame";

/** The public website: published results and approved stories only, no internal evidence or readiness data. */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
