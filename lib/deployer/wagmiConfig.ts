/* ─────────────────────────────────────────────────────────────
   Wagmi config for the deploy wizard (v29 — testnets only)

   Creates a standalone Wagmi config containing only the testnet
   chains needed by the v29 wizard. v29.5 will extend this with
   mainnet chains when the mainnet path ships.

   WHY A STANDALONE CONFIG (not the one Reown built):
   The existing Reown initialization in the app builds its own
   Wagmi config for the connect-wallet UI. That config is owned
   by Reown and not designed to be passed to @wagmi/core actions
   like deployContract directly. Building our own deployer-scoped
   config keeps concerns separated:
     - Reown handles wallet connection + chain switching UX
     - This config handles transaction execution

   The user's connected wallet works against both because the
   wallet itself doesn't care which Wagmi config is asking — it
   just signs whatever it's asked to sign on whatever chain the
   user is currently on.

   IMPORTANT: testnet-only by design. Mainnet chains are
   intentionally absent so a misconfigured wizard step cannot
   accidentally route a deploy to mainnet during the v29 preview
   window. v29.5 adds mainnet explicitly with extra confirmation.
   ───────────────────────────────────────────────────────────── */

import { http, createConfig } from "@wagmi/core";
import {
  sepolia,
  bscTestnet,
  polygonAmoy,
  arbitrumSepolia,
  optimismSepolia,
  baseSepolia,
} from "@wagmi/core/chains";
import { injected, walletConnect } from "@wagmi/connectors";

const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";

export const wagmiConfig = createConfig({
  chains: [
    sepolia,
    bscTestnet,
    polygonAmoy,
    arbitrumSepolia,
    optimismSepolia,
    baseSepolia,
  ],
  connectors: [
    injected(),
    /* WalletConnect requires a project ID; if missing we skip
       the connector rather than fail at config time. The wizard
       will still work via injected wallets (MetaMask, Rabby, etc.) */
    ...(projectId
      ? [walletConnect({ projectId, showQrModal: false })]
      : []),
  ],
  transports: {
    [sepolia.id]: http(),
    [bscTestnet.id]: http(),
    [polygonAmoy.id]: http(),
    [arbitrumSepolia.id]: http(),
    [optimismSepolia.id]: http(),
    [baseSepolia.id]: http(),
  },
});
