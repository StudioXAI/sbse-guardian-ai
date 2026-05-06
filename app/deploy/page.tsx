import SiteNav from "@/components/SiteNav";
import DeployWizard from "@/components/DeployWizard";

export const metadata = {
  title: "Deploy · SbSe Guardian",
  description:
    "No-code ERC-20 deployment wizard with automated security scan. Currently testnet only — mainnet coming in v29.5.",
};

export default function DeployPage() {
  return (
    <>
      <SiteNav active="deploy" />
      <DeployWizard />
    </>
  );
}
