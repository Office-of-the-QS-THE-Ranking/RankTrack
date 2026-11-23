import { redirect } from "next/navigation";
import { editionHref } from "@/lib/analytics/server/old-links";

/* Methodology moved onto each ranking's page. Links made before the move still point here. */
export default async function OldMethodology({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { edition } = await searchParams;
  redirect(await editionHref("methodology", edition));
}
