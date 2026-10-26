import Link from "next/link";
import { HomeHero } from "@/components/site/home/Hero";
import { Movers } from "@/components/site/home/Movers";
import { RankingMenu } from "@/components/site/home/RankingMenu";
import { CountsWhere } from "@/components/site/home/CountsWhere";
import { Process } from "@/components/site/home/Process";
import { StoryFolders } from "@/components/site/home/StoryFolders";
import { UnitBoard } from "@/components/site/home/UnitBoard";
import { OfficePanel } from "@/components/site/home/OfficePanel";
import { AdaptCoupon } from "@/components/site/home/AdaptCoupon";
import { siteData } from "@/lib/governance/server/site";

export const metadata = {
  title: { absolute: "UST Global Rankings and Impact Hub · Office of QS/THE Rankings" },
  description:
    "Where the University of Santo Tomas stands in eight global university rankings, each result as published, the evidence behind it and the Thomasian practices other universities can adapt.",
};

/*
 * The argument of the page, one claim per section:
 * where UST stands → what moved this year → what each of the eight measures → one record counts in
 * several → how evidence is asked for once → the stories behind the results → the units behind them →
 * how the Office reports → how another institution can adapt a practice.
 */
export default async function HomePage() {
  const site = await siteData();
  const WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
  const n = site.rankings.length;
  return (
    <>
      <HomeHero />
      <Movers />
      <section className="w-section w-wrap" aria-labelledby="rkmenu-title">
        <div className="w-intro w-grid">
          <h2 id="rkmenu-title" className="w-head" data-reveal>
            {WORDS[n] ?? n} {n === 1 ? "ranking" : "rankings"}, one university
          </h2>
          <div className="w-intro__aside" data-reveal style={{ ["--d" as string]: "90ms" }}>
            <p className="w-lead">Each measures something different. Open one for the result, what it measures and the stories behind it.</p>
            <Link href="/rankings" className="w-link">
              Compare all {WORDS[n]?.toLowerCase() ?? n}
            </Link>
          </div>
        </div>
        <RankingMenu />
      </section>
      <CountsWhere />
      <Process />
      <StoryFolders />
      <UnitBoard />
      <OfficePanel />
      {site.stories.length > 0 && <AdaptCoupon stories={site.stories.map(({ slug, title, unit }) => ({ slug, title, unit }))} />}
    </>
  );
}
