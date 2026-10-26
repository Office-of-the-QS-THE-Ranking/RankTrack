import { UnitProfileRoute } from "@/components/units/profile/UnitProfileRoute";

/** Next can hand an intercepted segment its interception marker as part of the param ("(.)(.)education"). */
const unitSlug = (raw: string) => decodeURIComponent(raw).replace(/^(?:\((?:\.{1,3}|\.\.\)\(\.\.)\))+/, "");

export default async function UnitModalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <UnitProfileRoute slug={unitSlug(slug)} variant="modal" />;
}
