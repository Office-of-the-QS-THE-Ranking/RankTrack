import { UnitProfileRoute } from "@/components/units/profile/UnitProfileRoute";
import { hub } from "@/lib/governance/server/hub";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return { title: (await hub()).unit(slug)?.name ?? "Unit" };
}

/** A unit's page in the Office workspace, from the Organizational Directory; archived units keep theirs. */
export default async function UnitPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <UnitProfileRoute slug={slug} variant="page" />;
}
