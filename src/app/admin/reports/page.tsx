import { PageHeader } from "@/components/ui/primitives";
import { Gate } from "@/components/hub/Gate";
import { ReportBuilder } from "@/components/reports/ReportBuilder";

export const metadata = { title: "Reports" };

export default function Reports() {
  return (
    <Gate path="/admin/reports" title="Reports">
      <PageHeader
        title="Reports"
        lede="Choose a report, filter by ranking, academic year, unit, indicator, SDG, submission status, evidence quality or action-plan status, and export for management review."
      />
      <ReportBuilder />
    </Gate>
  );
}
