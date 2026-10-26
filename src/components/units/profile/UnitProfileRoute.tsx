import { notFound, redirect } from "next/navigation";
import { getSessionProblem, getViewer } from "@/lib/governance/server/session";
import { unitProfile } from "@/lib/governance/server/unit-profile";
import { UnitDetailsModal } from "../UnitDetailsModal";
import { UnitProfile } from "./UnitProfile";

/** A unit's profile, over the Units directory (`modal`, from inside it) or as a page of its own (from anywhere else). */
export async function UnitProfileRoute({ slug, variant }: { slug: string; variant: "modal" | "page" }) {
  // Opened over the directory, only this slot renders: the workspace layout's own sign-in check doesn't run
  // again, so an ended session is sent to sign in here rather than shown as a missing unit.
  if (!(await getViewer())) {
    const problem = await getSessionProblem();
    redirect(`/signin?next=${encodeURIComponent(`/admin/units/${slug}`)}${problem ? `&ended=${problem}` : ""}`);
  }
  const data = await unitProfile(slug);
  if (!data) notFound();
  const titleId = `unit-${data.unit.slug}-title`;
  const profile = <UnitProfile data={data} variant={variant} titleId={titleId} />;
  return variant === "modal" ? <UnitDetailsModal labelledBy={titleId}>{profile}</UnitDetailsModal> : profile;
}
