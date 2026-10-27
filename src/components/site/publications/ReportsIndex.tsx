import { siteData } from "@/lib/governance/server/site";
import { PublicationsMasthead } from "./PublicationsMasthead";
import { ReportShelf } from "./ReportShelf";
import { issuedDay } from "./doc-format";

/** Reports & Insights: the Office's reports, briefs and analyses as a shelf of covers. */
export async function ReportsIndex() {
  const { reports } = await siteData();
  return (
    <>
      <PublicationsMasthead
        section="reports"
        lead="What the Office measures and learns: annual reports, ranking analyses and briefs, free to download."
        note={reports[0] && <>Latest <time dateTime={reports[0].issued}>{issuedDay(reports[0].issued)}</time></>}
      />
      <section className="w-wrap w-news-section" aria-label="Reports">
        <ReportShelf reports={reports} />
      </section>
    </>
  );
}
