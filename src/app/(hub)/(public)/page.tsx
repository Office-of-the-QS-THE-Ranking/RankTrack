import Link from "next/link";
import { HomeHero } from "@/components/site/home/Hero";
import { Movers } from "@/components/site/home/Movers";
import { RankingMenu } from "@/components/site/home/RankingMenu";
import { StartHere } from "@/components/site/home/StartHere";
import { ReadingGuide } from "@/components/site/ReadingGuide";
import { CountsWhere } from "@/components/site/home/CountsWhere";
import { Process } from "@/components/site/home/Process";
import { StoryFolders } from "@/components/site/home/StoryFolders";
import { UnitBoard } from "@/components/site/home/UnitBoard";
import { OfficePanel } from "@/components/site/home/OfficePanel";
import { AdaptCoupon } from "@/components/site/home/AdaptCoupon";
import { siteData } from "@/lib/governance/server/site";
import { PORTAL_NAME, RECTOR_OFFICE } from "@/lib/brand";

export const metadata = {
  title: { absolute: `${PORTAL_NAME} · ${RECTOR_OFFICE}` },
  description:
    "Where the University of Santo Tomas stands in eight global university rankings, each result as published, the evidence behind it and the Thomasian practices other universities can adapt.",
};

/*
 * The argument of the page, one claim per section:
 * where UST stands → what moved this year → what this site is and where to go → the eight results and
 * how to read one → which ranking measures what → the stories behind the results → how a result is
 * built → the units behind them → the Office → how another institution can adapt a practice.
 * The two night showpieces come first; from "What you can find here" on, every heading says plainly
 * what its section holds, for a visitor who has never read a ranking table.
 */
export default async function HomePage() {
  const site = await siteData();
  const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
  const n = site.rankings.length;
  return (
    <>
      <HomeHero />
      <Movers />
      <StartHere />
      <section className="w-section w-wrap w-rkhome" aria-labelledby="rkmenu-title">
        <div className="w-intro w-grid">
          <h2 id="rkmenu-title" className="w-head" data-reveal>
            {WORDS[n] ?? n} {n === 1 ? "ranking" : "rankings"}, one university
          </h2>
          <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
            <p className="w-lead">Each one measures something different. Open a ranking for its result, what it measures and the stories behind it.</p>
            <Link href="/rankings" className="w-link">
              Compare all {WORDS[n]?.toLowerCase() ?? n}
            </Link>
          </div>
        </div>
        <ReadingGuide />
        <RankingMenu />
      </section>
      <CountsWhere />
      <StoryFolders />
      <Process />
      <UnitBoard />
      <OfficePanel />
      {site.stories.length > 0 && <AdaptCoupon stories={site.stories.map(({ slug, title, unit }) => ({ slug, title, unit }))} />}
    </>
  );
}
