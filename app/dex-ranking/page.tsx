import SiteNav from "@/components/SiteNav";
import DexRankingSection from "@/components/DexRankingSection";

export const metadata = {
  title: "DEX Safety & Ecosystem Ranking · SbSe Guardian",
  description:
    "Trust and comparison layer ranking decentralized exchanges and ecosystems by safety, transparency, liquidity strength, and protocol-level user protection.",
};

export default function DexRankingPage() {
  return (
    <>
      <SiteNav active="dex-ranking" />
      <DexRankingSection />
    </>
  );
}
