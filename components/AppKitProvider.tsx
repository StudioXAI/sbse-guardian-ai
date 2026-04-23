"use client";

/* ─────────────────────────────────────────────────────────────
   Reown AppKit (WalletConnect v2) Provider
   - Ethers adapter (less heavy than wagmi; you already have ethers@6)
   - QR code connection for mobile wallets
   - Injected wallet support for desktop (MetaMask, Rabby, Rainbow, etc.)
   - 300+ wallets supported via WalletConnect
   - Configured for 6 supported payment chains
   ───────────────────────────────────────────────────────────── */

import { createAppKit } from "@reown/appkit/react";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import {
  mainnet,
  bsc,
  polygon,
  base,
  arbitrum,
  optimism,
  type AppKitNetwork,
} from "@reown/appkit/networks";
import type { ReactNode } from "react";

const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;

const metadata = {
  name: "SbSe Guardian",
  description: "Smart Contract Intelligence — AI-powered token security scanner",
  url:
    typeof window !== "undefined"
      ? window.location.origin
      : "https://sbse-guardian-ai.vercel.app",
  icons: [
    "https://sbse-guardian-ai.vercel.app/icon.png",
  ],
};

/** The 6 chains we accept payments on. */
const networks = [mainnet, bsc, polygon, base, arbitrum, optimism] as [
  AppKitNetwork,
  ...AppKitNetwork[],
];

/**
 * Initialize AppKit ONCE at module load.
 * This runs on the client only (guarded by "use client").
 */
let appKitInitialized = false;

function initAppKit() {
  if (appKitInitialized) return;
  if (!projectId) {
    console.warn(
      "[SbSe] NEXT_PUBLIC_REOWN_PROJECT_ID not set — wallet connect will not work",
    );
    return;
  }

  createAppKit({
    adapters: [new EthersAdapter()],
    networks,
    projectId,
    metadata,
    features: {
      analytics: false, // no user tracking
      email: false,     // keep it simple — wallet only, no email/social logins
      socials: false,
    },
    themeMode: "dark",
    themeVariables: {
      "--w3m-accent": "#6c63ff",
      "--w3m-color-mix": "#6c63ff",
      "--w3m-color-mix-strength": 10,
      "--w3m-border-radius-master": "3px",
    },
  });

  appKitInitialized = true;
}

/** Provider is a no-op wrapper — initialization happens on module load. */
export default function AppKitProvider({ children }: { children: ReactNode }) {
  if (typeof window !== "undefined") {
    initAppKit();
  }
  return <>{children}</>;
}
