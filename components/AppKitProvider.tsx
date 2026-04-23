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

/**
 * Suppress specific noisy errors from third-party wallet injections
 * that Reown AppKit probes during discovery.
 * - Coinbase Wallet throws on `isDefaultWallet` method probe
 * - We filter these to reduce console noise without hiding real errors
 */
function installConsoleFilters() {
  if (typeof window === "undefined") return;
  if ((window as any).__sbse_console_filtered) return;
  (window as any).__sbse_console_filtered = true;

  const originalError = console.error;
  const noisyPatterns = [
    /isDefaultWallet.*does not exist/i,
    /The method "isDefaultWallet"/i,
  ];

  console.error = (...args: unknown[]) => {
    const msg = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    if (noisyPatterns.some((p) => p.test(msg))) return; // swallow
    originalError.apply(console, args);
  };

  // Also catch uncaught rejections from wallet probes
  window.addEventListener("unhandledrejection", (e) => {
    const msg = String(e.reason?.message || e.reason || "");
    if (noisyPatterns.some((p) => p.test(msg))) {
      e.preventDefault();
    }
  });
}

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
    installConsoleFilters();
    initAppKit();
  }
  return <>{children}</>;
}
