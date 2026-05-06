/* ─────────────────────────────────────────────────────────────
   Wagmi config for the deploy wizard

   v29.0 — testnets only
   v29.5 — added mainnets (Ethereum, BSC, Polygon, Arbitrum, OP, Base)

   Both mainnet and testnet chains are now registered. The wizard's
   mainnet/testnet toggle decides which chain ID to actually use
   for any given deploy — the user must explicitly opt in to
   mainnet mode before mainnet chain IDs become reachable.

   See components/DeployWizard.tsx for the toggle implementation.
   ───────────────────────────────────────────────────────────── */

import { http, createConfig } from "@wagmi/core";
import {
  /* Testnets */
  sepolia,
  bscTestnet,
  polygonAmoy,
  arbitrumSepolia,
  optimismSepolia,
  baseSepolia,
  /* Mainnets — added in v29.5 */
  mainnet,
  bsc,
  polygon,
  arbitrum,
  optimism,
  base,
} from "@wagmi/core/chains";
import { injected, walletConnect } from "@wagmi/connectors";

const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";

export const wagmiConfig = createConfig({
  chains: [
    /* Testnets */
    sepolia,
    bscTestnet,
    polygonAmoy,
    arbitrumSepolia,
    optimismSepolia,
    baseSepolia,
    /* Mainnets */
    mainnet,
    bsc,
    polygon,
    arbitrum,
    optimism,
    base,
  ],
  connectors: [
    injected(),
    /* WalletConnect requires a project ID; if missing we skip
       the connector rather than fail at config time. */
    ...(projectId
      ? [walletConnect({ projectId, showQrModal: false })]
      : []),
  ],
  transports: {
    /* Testnet transports use http() with default public RPCs */
    [sepolia.id]: http(),
    [bscTestnet.id]: http(),
    [polygonAmoy.id]: http(),
    [arbitrumSepolia.id]: http(),
    [optimismSepolia.id]: http(),
    [baseSepolia.id]: http(),
    /* Mainnet transports use http() with default public RPCs.
       Wagmi's default mainnet RPCs are reliable enough for
       deploy transactions. The user's wallet is the actual
       broadcasting endpoint, not these. */
    [mainnet.id]: http(),
    [bsc.id]: http(),
    [polygon.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [base.id]: http(),
  },
});
