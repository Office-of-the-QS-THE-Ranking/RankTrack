import { redirect } from "next/navigation";
import { editionHref } from "@/lib/analytics/server/old-links";

/* Indicators moved onto each ranking's page. Notifications sent before the move still point here. */
export default async function OldIndicators({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { edition, code, view } = await searchParams;
  redirect(await editionHref("indicators", edition, { code, view }));
}
