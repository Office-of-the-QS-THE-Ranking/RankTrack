import { Gate } from "@/components/hub/Gate";
import { Benchmarks } from "@/components/analytics/Benchmarks";
import { PageHeader } from "@/components/ui/primitives";
import { benchmarksDesk } from "@/lib/analytics/server/desk";
import { getViewer } from "@/lib/governance/server/session";

export const metadata = { title: "Benchmarks" };

async function Body() {
  const desk = await benchmarksDesk((await getViewer())!);
  return (
    <>
      <PageHeader title="Benchmarks" />
      <Benchmarks desk={desk} />
    </>
  );
}

export default function BenchmarksPage() {
  return (
    <Gate path="/admin/analytics/benchmarks" title="Benchmarks">
      <Body />
    </Gate>
  );
}
