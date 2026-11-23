import { Gate } from "@/components/hub/Gate";
import { Benchmarks } from "@/components/analytics/Benchmarks";
import { benchmarksDesk } from "@/lib/analytics/server/desk";
import { getViewer } from "@/lib/governance/server/session";

export const metadata = { title: "Benchmarks" };

async function Body() {
  const desk = await benchmarksDesk((await getViewer())!);
  return <Benchmarks desk={desk} />;
}

export default function BenchmarksPage() {
  return (
    <Gate path="/admin/rankings/benchmarks" title="Benchmarks">
      <Body />
    </Gate>
  );
}
