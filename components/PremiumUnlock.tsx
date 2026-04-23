"use client";

import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, Contract, parseUnits, formatUnits } from "ethers";
import {
  useAppKit,
  useAppKitAccount,
  useAppKitNetwork,
  useAppKitProvider,
  useDisconnect,
} from "@reown/appkit/react";
import type { AuditReport } from "@/lib/types";

/* ─────────────────────────────────────────────────────────────
   Premium Unlock — USDC $2 on any of 6 chains
   Uses Reown AppKit (WalletConnect v2) for QR + injected wallet flow.

   Flow:
   1. Open Reown modal (QR code or injected wallet picker)
   2. Check user's USDC balance on the currently selected chain
   3. If insufficient, tell them clearly (don't even attempt the tx)
   4. Send USDC.transfer(RECEIVER, 2 USDC)
   5. Wait for receipt, then POST /api/unlock for server verification
   ───────────────────────────────────────────────────────────── */

/** USDC contracts (verified from Circle docs). All 6 decimals. */
const CHAINS = [
  { id: 1,     key: "ethereum", name: "Ethereum",   usdc: "0xA0b86991c6218b36c1D19D4a2e9Eb0cE3606eB48", decimals: 6 },
  { id: 56,    key: "bsc",      name: "BSC",        usdc: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 }, // Binance-Peg USDC on BSC is 18-decimal
  { id: 137,   key: "polygon",  name: "Polygon",    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 }, // native USDC
  { id: 8453,  key: "base",     name: "Base",       usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 }, // Circle native USDC
  { id: 42161, key: "arbitrum", name: "Arbitrum",   usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 }, // native USDC
  { id: 10,    key: "optimism", name: "Optimism",   usdc: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 }, // native USDC
];

const RECEIVER = "0x088f13E8813913aAf20b7c680e40439fF8Df445D";
const PRICE_USDC = 2;

// ERC20 minimal ABI
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

type Status =
  | "idle"
  | "checking_balance"
  | "sending"
  | "confirming"
  | "verifying"
  | "unlocked"
  | "error";

export default function PremiumUnlock({ report }: { report: AuditReport }) {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { chainId, switchNetwork } = useAppKitNetwork();
  const { walletProvider } = useAppKitProvider<any>("eip155");
  const { disconnect } = useDisconnect();

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [hasEnough, setHasEnough] = useState<boolean | null>(null);

  const currentChain = CHAINS.find((c) => c.id === Number(chainId));
  const chainSupported = !!currentChain;

  /* ─── Check USDC balance on chain change ─── */
  useEffect(() => {
    let cancelled = false;
    async function checkBalance() {
      if (!isConnected || !address || !walletProvider || !currentChain) {
        setBalance(null);
        setHasEnough(null);
        return;
      }
      try {
        setStatus("checking_balance");
        const provider = new BrowserProvider(walletProvider);
        const usdc = new Contract(currentChain.usdc, ERC20_ABI, provider);
        const raw = (await usdc.balanceOf(address)) as bigint;
        if (cancelled) return;

        const formatted = formatUnits(raw, currentChain.decimals);
        setBalance(formatted);

        const needed = parseUnits(String(PRICE_USDC), currentChain.decimals);
        setHasEnough(raw >= needed);
        setStatus("idle");
      } catch (e) {
        if (cancelled) return;
        console.warn("Balance check failed:", e);
        setBalance(null);
        setHasEnough(null);
        setStatus("idle");
      }
    }
    void checkBalance();
    return () => {
      cancelled = true;
    };
  }, [isConnected, address, walletProvider, chainId, currentChain]);

  /* ─── Pay action ─── */
  const pay = useCallback(async () => {
    if (!walletProvider || !address || !currentChain) {
      setError("Wallet not ready");
      setStatus("error");
      return;
    }
    if (!hasEnough) {
      setError(`You need at least ${PRICE_USDC} USDC on ${currentChain.name}`);
      setStatus("error");
      return;
    }

    setError(null);
    setStatus("sending");

    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const usdc = new Contract(currentChain.usdc, ERC20_ABI, signer);
      const amount = parseUnits(String(PRICE_USDC), currentChain.decimals);

      // Send the tx
      const tx = await usdc.transfer(RECEIVER, amount);
      setTxHash(tx.hash);
      setStatus("confirming");

      // Wait 1 confirmation
      const receipt = await tx.wait(1);
      if (!receipt || receipt.status !== 1) {
        throw new Error("Transaction reverted on-chain");
      }

      // Verify server-side
      setStatus("verifying");
      const res = await fetch("/api/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: tx.hash,
          chainId: currentChain.id,
          contractAddress: report.contractAddress,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.message || "Server verification failed");
      }

      setStatus("unlocked");
    } catch (e: any) {
      console.error("Payment failed:", e);
      let msg = "Payment failed";
      if (e?.code === "ACTION_REJECTED" || e?.code === 4001) {
        msg = "Transaction rejected in wallet";
      } else if (e?.message?.includes("insufficient funds")) {
        msg = `Not enough ${currentChain.key === "ethereum" ? "ETH" : "native gas token"} to pay gas fees`;
      } else if (e?.message) {
        msg = e.message.slice(0, 200);
      }
      setError(msg);
      setStatus("error");
    }
  }, [walletProvider, address, currentChain, hasEnough, report.contractAddress]);

  /* ─── Render ─── */

  const shortAddr = address
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : "";

  const payButtonLabel = () => {
    switch (status) {
      case "sending":
        return "Confirm in wallet…";
      case "confirming":
        return "Waiting for block…";
      case "verifying":
        return "Verifying on-chain…";
      default:
        return `Pay ${PRICE_USDC} USDC`;
    }
  };

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
            background: "linear-gradient(135deg, var(--accent), var(--accent-soft))",
            color: "#fff",
            boxShadow: "0 0 20px rgba(108,99,255,0.4)",
          }}
        >
          ∞
        </div>
        <span className="label-sm" style={{ color: "var(--accent-soft)" }}>
          Premium Analysis
        </span>
        {isConnected && (
          <button
            onClick={() => disconnect()}
            className="ml-auto font-mono text-xs hover:underline"
            style={{ color: "var(--fg-dim)" }}
          >
            Disconnect
          </button>
        )}
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
        watchlist this contract for ownership and liquidity events, and download
        the full PDF report.
      </p>

      {/* Price + chain chips */}
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
            ${PRICE_USDC}
          </span>
          <span
            className="font-mono text-xs"
            style={{ color: "var(--fg-muted)", letterSpacing: "0.1em" }}
          >
            USDC
          </span>
        </div>
        <span className="label-xs" style={{ color: "var(--fg-dim)" }}>
          Pay on any chain
        </span>
        <div className="flex flex-wrap gap-1.5 ml-auto">
          {CHAINS.map((c) => (
            <span
              key={c.id}
              className="font-mono text-[10px] tracking-wider uppercase px-2 py-1 rounded-md"
              style={{
                borderWidth: 1,
                borderStyle: "solid",
                borderColor:
                  Number(chainId) === c.id ? "var(--accent)" : "var(--border)",
                color:
                  Number(chainId) === c.id ? "var(--accent-soft)" : "var(--fg-dim)",
                background:
                  Number(chainId) === c.id ? "var(--accent-dim)" : "transparent",
              }}
            >
              {c.name}
            </span>
          ))}
        </div>
      </div>

      {/* Flow */}
      {status === "unlocked" ? (
        <UnlockedState chainId={chainId as number | undefined} txHash={txHash} />
      ) : !isConnected ? (
        <button
          type="button"
          onClick={() => open()}
          className="px-6 py-3 rounded-lg font-medium text-sm transition-all hover:brightness-110"
          style={{
            background: "var(--accent)",
            color: "#fff",
            boxShadow: "0 0 20px rgba(108,99,255,0.35)",
          }}
        >
          Connect wallet →
        </button>
      ) : !chainSupported ? (
        <div>
          <p className="text-sm mb-3" style={{ color: "var(--fg-muted)" }}>
            Connected as <span className="font-mono">{shortAddr}</span> on
            unsupported chain. Switch to:
          </p>
          <div className="flex flex-wrap gap-2">
            {CHAINS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => switchNetwork({ id: c.id } as any)}
                className="px-3 py-2 rounded-lg font-mono text-xs transition-all hover:brightness-110"
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
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <span
              className="font-mono text-xs px-3 py-1.5 rounded-md"
              style={{
                background: "var(--bg-elevated)",
                borderWidth: 1,
                borderStyle: "solid",
                borderColor: "var(--border)",
                color: "var(--fg)",
              }}
            >
              {shortAddr} · {currentChain.name}
            </span>
            {balance !== null && (
              <span
                className="font-mono text-xs"
                style={{
                  color: hasEnough ? "var(--success)" : "var(--warning)",
                }}
              >
                Balance: {Number(balance).toFixed(2)} USDC
                {!hasEnough && ` · need ${PRICE_USDC}`}
              </span>
            )}
          </div>

          {hasEnough === false ? (
            <div
              className="p-4 rounded-lg"
              style={{
                background: "var(--warning-dim)",
                border: "1px solid rgba(250,204,21,0.25)",
                color: "var(--warning)",
              }}
            >
              <p className="text-sm mb-2 font-medium">
                Insufficient USDC on {currentChain.name}
              </p>
              <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
                You have {Number(balance || 0).toFixed(4)} USDC but need{" "}
                {PRICE_USDC}. Bridge USDC or switch to a chain where you have
                enough.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={pay}
              disabled={["sending", "confirming", "verifying", "checking_balance"].includes(status) || hasEnough === null}
              className="px-6 py-3 rounded-lg font-medium text-sm transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: "var(--accent)",
                color: "#fff",
                boxShadow: "0 0 20px rgba(108,99,255,0.35)",
              }}
            >
              {["sending", "confirming", "verifying"].includes(status) && (
                <span
                  className="inline-block h-3 w-3 rounded-full mr-2 align-middle"
                  style={{
                    background: "#fff",
                    animation: "pulse 1s ease-in-out infinite",
                  }}
                />
              )}
              {payButtonLabel()} →
            </button>
          )}
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
        scanned contract. WalletConnect v2 / 300+ wallets supported.
      </p>
    </section>
  );
}

function UnlockedState({
  chainId,
  txHash,
}: {
  chainId?: number;
  txHash: string | null;
}) {
  const txUrl = txHash && chainId ? explorerTxUrl(chainId, txHash) : "#";
  return (
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
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6L9 17L4 12" />
        </svg>
        <span className="font-semibold text-sm">Payment verified</span>
      </div>
      <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
        Premium features unlocked for this contract.{" "}
        {txHash && (
          <a
            href={txUrl}
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
  );
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
