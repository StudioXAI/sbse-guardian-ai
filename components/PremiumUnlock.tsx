"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
   Premium Unlock — dual-rail USDC or USDT, $2
   - Reads both USDC and USDT balances on the selected chain
   - Pays with whichever the user has more of (≥ $2)
   - Clickable chain chips trigger wallet network switch
   - Detects & warns if connected wallet equals receiver wallet
   ───────────────────────────────────────────────────────────── */

type Stablecoin = "USDC" | "USDT";

interface TokenCfg {
  symbol: Stablecoin;
  address: string;
  decimals: number;
}

interface ChainCfg {
  id: number;
  name: string;
  short: string;
  tokens: TokenCfg[];
}

/** Verified addresses — match lib/verifyPayment.ts */
const CHAINS: ChainCfg[] = [
  {
    id: 1, name: "Ethereum", short: "ETH",
    tokens: [
      { symbol: "USDC", address: "0xA0b86991c6218b36c1D19D4a2e9Eb0cE3606eB48", decimals: 6 },
      { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    ],
  },
  {
    id: 56, name: "BSC", short: "BSC",
    tokens: [
      { symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
      { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
    ],
  },
  {
    id: 137, name: "Polygon", short: "POL",
    tokens: [
      { symbol: "USDC", address: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", decimals: 6 },
      { symbol: "USDT", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 },
    ],
  },
  {
    id: 8453, name: "Base", short: "BASE",
    tokens: [
      { symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
      { symbol: "USDT", address: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", decimals: 6 },
    ],
  },
  {
    id: 42161, name: "Arbitrum", short: "ARB",
    tokens: [
      { symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
      { symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
    ],
  },
  {
    id: 10, name: "Optimism", short: "OP",
    tokens: [
      { symbol: "USDC", address: "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", decimals: 6 },
      { symbol: "USDT", address: "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", decimals: 6 },
    ],
  },
];

const RECEIVER = "0x088f13E8813913aAf20b7c680e40439fF8Df445D";
const PRICE = 2;

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
];

type Status =
  | "idle"
  | "checking_balance"
  | "sending"
  | "confirming"
  | "verifying"
  | "unlocked"
  | "error";

interface Balances {
  USDC: number;
  USDT: number;
}

export default function PremiumUnlock({ report }: { report: AuditReport }) {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { chainId, switchNetwork } = useAppKitNetwork();
  const { walletProvider } = useAppKitProvider<any>("eip155");
  const { disconnect } = useDisconnect();

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [balances, setBalances] = useState<Balances>({ USDC: 0, USDT: 0 });
  const [balanceChecked, setBalanceChecked] = useState(false);

  const currentChain = useMemo(
    () => CHAINS.find((c) => c.id === Number(chainId)),
    [chainId],
  );
  const chainSupported = !!currentChain;

  const isReceiverWallet = useMemo(
    () => address?.toLowerCase() === RECEIVER.toLowerCase(),
    [address],
  );

  /** Which stablecoin to use for payment — whichever has enough balance. Prefer USDC. */
  const paymentToken = useMemo<TokenCfg | null>(() => {
    if (!currentChain) return null;
    if (balances.USDC >= PRICE) {
      return currentChain.tokens.find((t) => t.symbol === "USDC") || null;
    }
    if (balances.USDT >= PRICE) {
      return currentChain.tokens.find((t) => t.symbol === "USDT") || null;
    }
    return null;
  }, [currentChain, balances]);

  /* ─── Balance check on chain/address change ─── */
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!isConnected || !address || !walletProvider || !currentChain) {
        setBalances({ USDC: 0, USDT: 0 });
        setBalanceChecked(false);
        return;
      }
      setStatus("checking_balance");
      setBalanceChecked(false);
      try {
        const provider = new BrowserProvider(walletProvider);
        const [usdc, usdt] = currentChain.tokens;
        const usdcContract = new Contract(usdc.address, ERC20_ABI, provider);
        const usdtContract = new Contract(usdt.address, ERC20_ABI, provider);

        const [usdcRaw, usdtRaw] = await Promise.all([
          usdcContract.balanceOf(address).catch(() => BigInt(0)),
          usdtContract.balanceOf(address).catch(() => BigInt(0)),
        ]);
        if (cancelled) return;

        setBalances({
          USDC: Number(formatUnits(usdcRaw as bigint, usdc.decimals)),
          USDT: Number(formatUnits(usdtRaw as bigint, usdt.decimals)),
        });
        setBalanceChecked(true);
        setStatus("idle");
      } catch (e) {
        if (cancelled) return;
        console.warn("Balance check failed:", e);
        setBalances({ USDC: 0, USDT: 0 });
        setBalanceChecked(true);
        setStatus("idle");
      }
    }
    void check();
    return () => { cancelled = true; };
  }, [isConnected, address, walletProvider, chainId, currentChain]);

  /* ─── Chain switching via chip click ─── */
  const handleChainClick = useCallback(async (targetId: number) => {
    if (!isConnected) {
      // Just open wallet connect first
      open();
      return;
    }
    if (Number(chainId) === targetId) return; // already on it
    try {
      setError(null);
      await switchNetwork({ id: targetId } as any);
    } catch (e) {
      console.warn("Chain switch failed:", e);
      setError("Chain switch rejected or unsupported by wallet");
    }
  }, [isConnected, chainId, switchNetwork, open]);

  /* ─── Pay action ─── */
  const pay = useCallback(async () => {
    if (!walletProvider || !address || !currentChain || !paymentToken) return;
    if (isReceiverWallet) {
      setError("This wallet is the receiver. Connect a different wallet to pay.");
      setStatus("error");
      return;
    }

    setError(null);
    setStatus("sending");

    try {
      const provider = new BrowserProvider(walletProvider);
      const signer = await provider.getSigner();
      const token = new Contract(paymentToken.address, ERC20_ABI, signer);
      const amount = parseUnits(String(PRICE), paymentToken.decimals);

      const tx = await token.transfer(RECEIVER, amount);
      setTxHash(tx.hash);
      setStatus("confirming");

      const receipt = await tx.wait(1);
      if (!receipt || receipt.status !== 1) {
        throw new Error("Transaction reverted on-chain");
      }

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
      if (!json.success) throw new Error(json.message || "Verification failed");

      setStatus("unlocked");
    } catch (e: any) {
      console.error("Payment failed:", e);
      let msg = "Payment failed";
      if (e?.code === "ACTION_REJECTED" || e?.code === 4001) {
        msg = "Transaction rejected in wallet";
      } else if (e?.message?.toLowerCase().includes("insufficient funds")) {
        msg = "Not enough native gas token to pay transaction fees";
      } else if (e?.message) {
        msg = e.message.slice(0, 200);
      }
      setError(msg);
      setStatus("error");
    }
  }, [walletProvider, address, currentChain, paymentToken, isReceiverWallet, report.contractAddress]);

  const shortAddr = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "";

  const payButtonLabel = () => {
    switch (status) {
      case "sending": return "Confirm in wallet…";
      case "confirming": return "Waiting for block…";
      case "verifying": return "Verifying on-chain…";
      default: return `Pay ${PRICE} ${paymentToken?.symbol || "USDC/USDT"}`;
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

      {/* Price + chain chips (CLICKABLE) */}
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
            ${PRICE}
          </span>
          <span
            className="font-mono text-xs"
            style={{ color: "var(--fg-muted)", letterSpacing: "0.1em" }}
          >
            USDC/USDT
          </span>
        </div>
        <span className="label-xs" style={{ color: "var(--fg-dim)" }}>
          Click a chain to switch
        </span>
        <div className="flex flex-wrap gap-1.5 ml-auto">
          {CHAINS.map((c) => {
            const active = Number(chainId) === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => handleChainClick(c.id)}
                className="font-mono text-[10px] tracking-wider uppercase px-2 py-1 rounded-md transition-all hover:brightness-125 cursor-pointer"
                style={{
                  borderWidth: 1,
                  borderStyle: "solid",
                  borderColor: active ? "var(--accent)" : "var(--border)",
                  color: active ? "var(--accent-soft)" : "var(--fg-dim)",
                  background: active ? "var(--accent-dim)" : "transparent",
                }}
                title={`Switch to ${c.name}`}
              >
                {c.short}
              </button>
            );
          })}
        </div>
      </div>

      {/* Flow states */}
      {status === "unlocked" ? (
        <UnlockedState chainId={chainId as number | undefined} txHash={txHash} />
      ) : isReceiverWallet ? (
        <SelfPayWarning onDisconnect={() => disconnect()} />
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
            unsupported chain. Click a chain chip above to switch.
          </p>
        </div>
      ) : (
        <ConnectedFlow
          shortAddr={shortAddr}
          chainName={currentChain!.name}
          balances={balances}
          balanceChecked={balanceChecked}
          paymentToken={paymentToken}
          status={status}
          onPay={pay}
          payButtonLabel={payButtonLabel()}
        />
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
        custody, no refunds. Unlock tied to wallet + scanned contract.
        WalletConnect v2 / 300+ wallets supported.
      </p>
    </section>
  );
}

/* ─── Sub-components ─── */

function ConnectedFlow({
  shortAddr,
  chainName,
  balances,
  balanceChecked,
  paymentToken,
  status,
  onPay,
  payButtonLabel,
}: {
  shortAddr: string;
  chainName: string;
  balances: Balances;
  balanceChecked: boolean;
  paymentToken: TokenCfg | null;
  status: Status;
  onPay: () => void;
  payButtonLabel: string;
}) {
  const hasEnough = !!paymentToken;
  const busy = ["sending", "confirming", "verifying", "checking_balance"].includes(status);

  return (
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
          {shortAddr} · {chainName}
        </span>
        {balanceChecked && (
          <div className="flex gap-2 items-center text-xs font-mono">
            <BalancePill symbol="USDC" amount={balances.USDC} threshold={PRICE} />
            <BalancePill symbol="USDT" amount={balances.USDT} threshold={PRICE} />
          </div>
        )}
      </div>

      {!balanceChecked ? (
        <div className="text-xs" style={{ color: "var(--fg-dim)" }}>
          Reading balances…
        </div>
      ) : !hasEnough ? (
        <div
          className="p-4 rounded-lg"
          style={{
            background: "var(--warning-dim)",
            border: "1px solid rgba(250,204,21,0.25)",
            color: "var(--warning)",
          }}
        >
          <p className="text-sm mb-2 font-medium">
            Insufficient balance on {chainName}
          </p>
          <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
            You have {balances.USDC.toFixed(2)} USDC and {balances.USDT.toFixed(2)} USDT.
            Need {PRICE} of either. Switch chains above or bridge funds.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={onPay}
          disabled={busy}
          className="px-6 py-3 rounded-lg font-medium text-sm transition-all hover:brightness-110 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: "var(--accent)",
            color: "#fff",
            boxShadow: "0 0 20px rgba(108,99,255,0.35)",
          }}
        >
          {busy && (
            <span
              className="inline-block h-3 w-3 rounded-full mr-2 align-middle"
              style={{
                background: "#fff",
                animation: "pulse 1s ease-in-out infinite",
              }}
            />
          )}
          {payButtonLabel} →
        </button>
      )}
    </div>
  );
}

function BalancePill({
  symbol,
  amount,
  threshold,
}: {
  symbol: string;
  amount: number;
  threshold: number;
}) {
  const enough = amount >= threshold;
  return (
    <span
      className="px-2 py-1 rounded-md"
      style={{
        background: enough ? "var(--success-dim)" : "var(--bg-elevated)",
        border: `1px solid ${enough ? "rgba(74,222,128,0.3)" : "var(--border)"}`,
        color: enough ? "var(--success)" : "var(--fg-muted)",
      }}
    >
      {amount.toFixed(2)} {symbol}
    </span>
  );
}

function SelfPayWarning({ onDisconnect }: { onDisconnect: () => void }) {
  return (
    <div
      className="p-5 rounded-lg"
      style={{
        background: "var(--warning-dim)",
        border: "1px solid rgba(250,204,21,0.3)",
      }}
    >
      <div className="flex items-center gap-2 mb-2" style={{ color: "var(--warning)" }}>
        <span className="font-semibold text-sm">⚠ This wallet receives payments</span>
      </div>
      <p className="text-sm mb-3" style={{ color: "var(--fg-muted)" }}>
        You're connected with the SbSe Guardian receiver wallet — you can't pay yourself.
        Disconnect and reconnect with a different wallet to test the payment flow.
      </p>
      <button
        type="button"
        onClick={onDisconnect}
        className="px-4 py-2 rounded-lg text-sm font-mono hover:brightness-110 transition"
        style={{
          background: "transparent",
          color: "var(--warning)",
          border: "1px solid rgba(250,204,21,0.4)",
        }}
      >
        Disconnect →
      </button>
    </div>
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
      <div className="flex items-center gap-2 mb-2" style={{ color: "var(--success)" }}>
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
