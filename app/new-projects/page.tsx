import SiteNav from "@/components/SiteNav";
import NewProjectsSection from "@/components/NewProjectsSection";

export const metadata = {
  title: "New Projects · SbSe Guardian",
  description:
    "Live discovery feed of newly-deployed ERC-20 contracts across 6 EVM chains. Verified badge for projects launched via INFI MultiChain Launchpad.",
};

export default function NewProjectsPage() {
  return (
    <>
      <SiteNav active="new-projects" />
      <NewProjectsSection />
    </>
  );
}
