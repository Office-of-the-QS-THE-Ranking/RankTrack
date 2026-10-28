import { siteData } from "@/lib/governance/server/site";
import { ReportShelf } from "./ReportShelf";

/** Reports & Insights: the Office's reports, briefs and analyses as a shelf of covers. */
export async function ReportsIndex() {
  const { reports } = await siteData();
  return (
    <>
      <section className="w-wrap w-news-section" aria-label="Reports">
        <ReportShelf reports={reports} />
      </section>
    </>
  );
}
