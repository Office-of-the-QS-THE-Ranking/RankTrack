import { RankingsIndex } from "@/components/site/pages/RankingsIndex";

export const metadata = {
  title: "Rankings",
  description:
    "How the eight global rankings relate to UST: the results as published, what each measures, which evidence counts in several at once and when each collects data.",
};

export default function PublicRankings() {
  return <RankingsIndex />;
}
