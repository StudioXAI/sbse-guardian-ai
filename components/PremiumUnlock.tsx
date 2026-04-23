"use client";

import { useState, useEffect, useCallback } from "react";
import type { AuditReport } from "@/lib/types";

/* ─────────────────────────────────────────────────────────────
   Premium Unlock Card
   Wallet-connect + pay $0.20 USDT flow.

   Uses window.ethereum (any injected EVM wallet: MetaMask, Rabby,
   Rainbow, Brave, Coinbase, etc.) — no wagmi/RainbowKit dependency.

   Flow:
   1. User clicks "Connect wallet"
   2. We ensure wallet is on one of 6 supported chains; if not, offer
      to switch.
   3. User clicks "Pay $0.20 USDT"
   4. We send ERC-20 transfer tx to receiver wallet
   5. On confirmation, POST to /api/unlock for server-side verification
   6. On success, show unlocked state
   ───────────────────────────────────────────────────────────── */

/** Supported payment chains. Must match /lib/verifyPayment.ts. */
const PAYMENT_CHAINS = [
  { id: 1, name: "Ethereum", usdt: "0xdac17f958d2ee523a2206206994597c13d831ec7", decimals: 6 },
  { id: 56, name: "BNB Smart Chain", usdt: "0x55d398326f99059ff775485246999027b3197955", decimals: 18 },
  { id: 137, name: "Polygon", usdt: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f", decimals: 6 },
  { id: 8453, name: "Base", usdt: "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2", decimals: 6 },
  { id: 42161, name: "Arbitrum", usdt: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9", decimals: 6 },
  { id: 10, name: "Optimism", usdt: "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", decimals: 6 },
];

const RECEIVER = "0x088f13E8813913aAf20b7c680e40439fF8Df445D";
const AMOUNT_USDT_FLOAT = 0.2;

/** ERC-20 transfer(address,uint256) function selector */
const TRANSFER_SELECTOR = "0xa9059cbb";

type Status =
  | "idle"
  | "connecting"
  | "connected"
  | "switching"
  | "sending"
  | "confirming"
  | "verifying"
  | "unlocked"
  | "error";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export default function PremiumUnlock({
  report,
  onUnlocked,
}: {
  report: AuditReport;
  onUnlocked?: () => void;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [wallet, setWallet] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  /** Does the browser have a wallet injected? */
  const hasWallet = typeof window !== "undefined" && !!window.ethereum;

  const currentChain = PAYMENT_CHAINS.find((c) => c.id === chainId);
  const chainSupported = !!currentChain;

  /* ── Wallet connect ── */
  const connect = useCallback(async () => {
    if (!window.ethereum) {
      setError("No EVM wallet detected. Install MetaMask, Rabby, or Rainbow.");
      setStatus("error");
      return;
    }
    setStatus("connecting");
    setError(null);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      if (!accounts?.length) throw new Error("No account returned");
      setWallet(accounts[0]);

      const cid = (await window.ethereum.request({ method: "eth_chainId" })) as string;
      setChainId(parseInt(cid, 16));

      setStatus("connected");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Connection failed";
      setError(msg);
      setStatus("error");
    }
  }, []);

  /* ── Listen for account / chain changes ── */
  useEffect(() => {
    if (!window.ethereum?.on) return;
    const onAccounts = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      setWallet(accounts?.[0] || null);
      if (!accounts?.length) setStatus("idle");
    };
    const onChain = (...args: unknown[]) => {
      const hex = args[0] as string;
      setChainId(parseInt(hex, 16));
    };
    window.ethereum.on("accountsChanged", onAccounts);
    window.ethereum.on("chainChanged", onChain);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", onAccounts);
      window.ethereum?.removeListener?.("chainChanged", onChain);
    };
  }, []);

  /* ── Switch chain ── */
  const switchTo = useCallback(async (targetId: number) => {
    if (!window.ethereum) return;
    setStatus("switching");
    setError(null);
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x" + targetId.toString(16) }],
      });
      setChainId(targetId);
      setStatus("connected");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chain switch rejected");
      setStatus("error");
    }
  }, []);

  /* ── Pay ── */
  const pay = useCallback(async () => {
    if (!window.ethereum || !wallet || !currentChain) return;
    setStatus("sending");
    setError(null);
    setTxHash(null);

    try {
      // Compute raw amount
      const multiplier = BigInt(10) ** BigInt(currentChain.decimals);
      const whole = BigInt(Math.floor(AMOUNT_USDT_FLOAT));
      const frac = BigInt(Math.round((AMOUNT_USDT_FLOAT - Math.floor(AMOUNT_USDT_FLOAT)) * Number(multiplier)));
      const raw = whole * multiplier + frac;

      // Encode transfer(to, amount)
      const toPadded = RECEIVER.toLowerCase().replace(/^0x/, "").padStart(64, "0");
      const amountPadded = raw.toString(16).padStart(64, "0");
      const data = TRANSFER_SELECTOR + toPadded + amountPadded;

      const hash = (await window.ethereum.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: wallet,
            to: currentChain.usdt,
            data,
            value: "0x0",
          },
        ],
      })) as string;

      setTxHash(hash);
      setStatus("confirming");

      // Poll for confirmation
      const receipt = await waitForReceipt(hash);
      if (!receipt || receipt.status !== "0x1") {
        throw new Error("Transaction failed on-chain");
      }

      // Server-side verify
      setStatus("verifying");
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: hash,
          chainId: currentChain.id,
          contractAddress: report.contractAddress,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Verification failed");

      setStatus("unlocked");
      onUnlocked?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Payment failed";
      setError(msg);
      setStatus("error");
    }
  }, [wallet, currentChain, report.contractAddress, onUnlocked]);

  /* ─────────────────────────────────────────────────────────────
     Render
     ───────────────────────────────────────────────────────────── */

  const shortWallet = wallet ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : "";

  return (
    <section
      className="relative overflow-hidden rounded-xl border anim-fade-up"
      style={{
        padding: "36px 40px",
        background:
          "radial-gradient(ellipse at top left, rgba(108,99,255,0.12), transparent 50%), linear-gradient(180deg, rgba(108,99,255,0.04), transparent)",
        borderColor: "rgba(108,99,255,0.3)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div
          className="h-10 w-10 rounded-xl grid place-items-center font-semibold text-lg"
          style={{
            background:
              "linear-gradient(135deg, var(--accent), var(--accent-soft))",
            color: "#fff",
            boxShadow: "0 0 20px rgba(108,99,255,0.4)",
          }}
        >
          ∞
        </div>
        <span className="label-sm" style={{ color: "var(--accent-soft)" }}>
          Premium Analysis
        </span>
      </div>

      {/* Title */}
      <h2
        className="text-gradient tracking-tight mb-3"
        style={{
          fontSize: "clamp(24px, 3.5vw, 34px)",
          fontWeight: 600,
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
        }}
      >
        Unlock the deluxe report.
      </h2>
      <p
        className="mb-6 max-w-2xl"
        style={{ fontSize: "15px", color: "var(--fg-muted)", lineHeight: 1.6 }}
      >
        Mint a permanent on-chain audit proof, get the expanded AI walkthrough,
        watchlist this contract for ownership transfers and liquidity events,
        and download the full PDF report.
      </p>

      {/* Price + chains */}
      <div
        className="flex items-center gap-5 pt-4 mb-6 flex-wrap"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        <div className="flex items-baseline gap-1.5">
          <span
            className="font-semibold tracking-tight"
            style={{
              fontSize: "36px",
              color: "var(--accent-soft)",
              letterSpacing: "-0.03em",
            }}
          >
            $0.20
          </span>
          <span
            className="font-mono text-xs"
            style={{ color: "var(--fg-muted)", letterSpacing: "0.1em" }}
          >
            USDT
          </span>
        </div>
        <span
          className="label-xs"
          style={{ color: "var(--fg-dim)" }}
        >
          Pay on any of 6 chains
        </span>
        <div className="flex flex-wrap gap-1.5 ml-auto">
          {PAYMENT_CHAINS.map((c) => (
            <span
              key={c.id}
              className="font-mono text-[10px] tracking-wider uppercase px-2 py-1 rounded-md"
              style={{
                borderWidth: 1,
                borderStyle: "solid",
                borderColor:
                  chainId === c.id ? "var(--accent)" : "var(--border)",
                color:
                  chainId === c.id ? "var(--accent-soft)" : "var(--fg-dim)",
                background:
                  chainId === c.id ? "var(--accent-dim)" : "transparent",
              }}
            >
              {c.name.split(" ")[0]}
            </span>
          ))}
        </div>
      </div>

      {/* Flow states */}
      {!hasWallet ? (
        <div
          className="p-4 rounded-lg text-sm"
          style={{
            background: "var(--warning-dim)",
            border: "1px solid rgba(250,204,21,0.25)",
            color: "var(--warning)",
          }}
        >
          No wallet detected. Install{" "}
          <a href="https://metamask.io" target="_blank" rel="noopener noreferrer" className="underline">MetaMask</a>,{" "}
          <a href="https://rabby.io" target="_blank" rel="noopener noreferrer" className="underline">Rabby</a>, or{" "}
          <a href="https://rainbow.me" target="_blank" rel="noopener noreferrer" className="underline">Rainbow</a>{" "}
          to continue.
        </div>
      ) : status === "unlocked" ? (
        <div
          className="p-5 rounded-lg"
          style={{
            background: "var(--success-dim)",
            border: "1px solid rgba(74,222,128,0.3)",
          }}
        >
          <div
            className="flex items-center gap-2 mb-2"
            style={{ color: "var(--success)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17L4 12" />
            </svg>
            <span className="font-semibold text-sm">Payment verified</span>
          </div>
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            Premium features unlocked for this contract.{" "}
            {txHash && (
              <a
                href={`${explorerTxUrl(chainId!, txHash)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono hover:underline"
                style={{ color: "var(--accent-soft)" }}
              >
                View tx →
              </a>
            )}
          </p>
        </div>
      ) : !wallet ? (
        <ActionButton
          label={status === "connecting" ? "Connecting…" : "Connect wallet"}
          onClick={connect}
          loading={status === "connecting"}
        />
      ) : !chainSupported ? (
        <div>
          <p className="text-sm mb-3" style={{ color: "var(--fg-muted)" }}>
            Connected as <span className="font-mono">{shortWallet}</span> on
            unsupported chain. Switch to:
          </p>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_CHAINS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => switchTo(c.id)}
                disabled={status === "switching"}
                className="px-3 py-2 rounded-lg font-mono text-xs transition-all hover:brightness-110 disabled:opacity-50"
                style={{
                  background: "var(--bg-elevated)",
                  color: "var(--fg-muted)",
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: "var(--border-strong)",
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <p className="text-sm mb-3" style={{ color: "var(--fg-muted)" }}>
            <span className="font-mono" style={{ color: "var(--fg)" }}>
              {shortWallet}
            </span>{" "}
            on <strong>{currentChain?.name}</strong>
          </p>
          <ActionButton
            label={payButtonLabel(status)}
            onClick={pay}
            loading={["sending", "confirming", "verifying"].includes(status)}
            disabled={["sending", "confirming", "verifying"].includes(status)}
          />
        </div>
      )}

      {/* Error */}
      {error && status === "error" && (
        <div
          className="mt-4 p-3 rounded-lg text-xs"
          style={{
            background: "var(--danger-dim)",
            border: "1px solid rgba(248,113,113,0.25)",
            color: "var(--danger)",
          }}
        >
          {error}
        </div>
      )}

      {/* Disclosure */}
      <p
        className="mt-6 pt-4 font-mono text-xs"
        style={{
          borderTop: "1px solid var(--border)",
          color: "var(--fg-dim)",
          lineHeight: 1.6,
        }}
      >
        Payment goes directly to the SbSe Guardian receiver wallet on-chain. No
        custody, no refunds. Unlock is tied to your wallet address and the
        scanned contract.
      </p>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────── */

function ActionButton({
  label,
  onClick,
  loading,
  disabled,
}: {
  label: string;
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="px-6 py-3 rounded-lg font-medium text-sm transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
      style={{
        background: "var(--accent)",
        color: "#fff",
        boxShadow: "0 0 20px rgba(108,99,255,0.35)",
      }}
    >
      {loading && (
        <span
          className="inline-block h-3 w-3 rounded-full mr-2 align-middle"
          style={{
            background: "#fff",
            animation: "pulse 1s ease-in-out infinite",
          }}
        />
      )}
      {label} →
    </button>
  );
}

function payButtonLabel(s: Status): string {
  switch (s) {
    case "sending":
      return "Confirm in wallet…";
    case "confirming":
      return "Waiting for block…";
    case "verifying":
      return "Verifying on-chain…";
    default:
      return "Pay $0.20 USDT";
  }
}

function explorerTxUrl(chainId: number, hash: string): string {
  const map: Record<number, string> = {
    1: `https://etherscan.io/tx/${hash}`,
    56: `https://bscscan.com/tx/${hash}`,
    137: `https://polygonscan.com/tx/${hash}`,
    8453: `https://basescan.org/tx/${hash}`,
    42161: `https://arbiscan.io/tx/${hash}`,
    10: `https://optimistic.etherscan.io/tx/${hash}`,
  };
  return map[chainId] || "#";
}

/** Poll for tx receipt via window.ethereum. Max 2 minutes. */
async function waitForReceipt(
  hash: string,
  maxAttempts = 60,
  intervalMs = 2000,
): Promise<{ status: string } | null> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const r = (await window.ethereum?.request({
        method: "eth_getTransactionReceipt",
        params: [hash],
      })) as { status: string } | null;
      if (r && r.status) return r;
    } catch {
      /* ignore */
    }
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  return null;
}
