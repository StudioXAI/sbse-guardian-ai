"use client";

/* ─────────────────────────────────────────────────────────────
   Deploy Wizard — Testnet ERC-20 Token Deployment

   Multi-step state machine:
     1. CHAIN     — pick which testnet to deploy on
     2. TEMPLATE  — pick which contract template (only ERC-20 in v29)
     3. PARAMS    — fill template parameters (name, symbol, supply, decimals)
     4. SCAN      — review automated security scan results
     5. INTENT    — capture listing intent + team contact
     6. DEPLOY    — connect wallet, sign tx, watch for confirmation
     7. SUCCESS   — show deployed contract details + next steps

   v29.0  — testnet only, no fees
   v29.5  — mainnet unlocked, free for everyone (no INFI fee charged).
            Future versions may gate mainnet by INVERTX holdings via
            lib/deployer/invertxGate.ts.

   This file is the wizard shell + state machine. Each step's UI
   lives in a sub-component below for readability.
   ───────────────────────────────────────────────────────────── */

import { useState, useEffect } from "react";
import {
  useAppKit,
  useAppKitAccount,
  useAppKitNetwork,
} from "@reown/appkit/react";
import {
  type DeployerChainId,
  DEPLOYER_CHAINS,
  listDeployerChains,
} from "@/lib/deployer/chains";
import {
  type TemplateId,
  type TokenTemplate,
  listTemplates,
  getTemplate,
} from "@/lib/deployer/templates";
import { runSecurityScan, type ScanResult } from "@/lib/deployer/securityScan";
import {
  fetchTestnetBalance,
  formatBalance,
  copyToClipboard,
} from "@/lib/deployer/testnetTokens";
import { encodeConstructorArgs } from "@/lib/deployer/encodeConstructorArgs";

type WizardStep =
  | "chain"
  | "template"
  | "params"
  | "scan"
  | "intent"
  | "deploy"
  | "success";

interface DeploymentResult {
  contractAddress: string;
  txHash: string;
  blockNumber: number;
  chainId: number;
  testnetExplorer: string;
}

export default function DeployWizard() {
  /* Wizard state */
  const [step, setStep] = useState<WizardStep>("chain");
  /* Mode: testnet (free, default) vs mainnet (free, real chain).
     Toggle available on the chain step. The mode is locked once
     the user picks a chain so they can't accidentally switch
     contexts mid-wizard.

     v29.5: Mainnet is unlocked but free for everyone. A future
     version may gate mainnet by INVERTX holdings (see
     lib/deployer/invertxGate.ts) — currently every wallet can
     deploy on mainnet. */
  const [deployMode, setDeployMode] = useState<"testnet" | "mainnet">("testnet");
  const [chainId, setChainId] = useState<DeployerChainId | null>(null);
  const [templateId, setTemplateId] = useState<TemplateId | null>(null);
  const [parameters, setParameters] = useState<Record<string, string | number>>({});
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [intentData, setIntentData] = useState<{
    intent: string;
    email: string;
    twitter: string;
    telegram: string;
    website: string;
    description: string;
  }>({
    intent: "undecided",
    email: "",
    twitter: "",
    telegram: "",
    website: "",
    description: "",
  });
  const [deployResult, setDeployResult] = useState<DeploymentResult | null>(null);

  function reset() {
    setStep("chain");
    setDeployMode("testnet");
    setChainId(null);
    setTemplateId(null);
    setParameters({});
    setScanResult(null);
    setDeployResult(null);
  }

  /* Derived */
  const chain = chainId ? DEPLOYER_CHAINS[chainId] : null;
  const template = templateId ? getTemplate(templateId) : null;

  return (
    <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div
          className="font-mono text-[10px] tracking-[0.2em] uppercase"
          style={{ color: "var(--accent-soft)" }}
        >
          Deploy Wizard · {deployMode === "mainnet" ? "Mainnet (real money)" : "Testnet (free)"}
        </div>
        <h1
          className="text-2xl md:text-3xl font-medium tracking-tight"
          style={{ color: "var(--fg)" }}
        >
          Deploy a smart contract
        </h1>
        <p
          className="text-[13px] max-w-2xl leading-relaxed"
          style={{ color: "var(--fg-muted)" }}
        >
          No-code ERC-20 deployment using OpenZeppelin templates with an
          automated pre-deployment security scan. Both testnet and mainnet
          are supported — mainnet is currently free for all users (you only
          pay your own network gas).
        </p>
      </div>

      {/* Mode banner */}
      <div
        className="card p-3 text-[11px]"
        style={{
          color: "var(--fg-dim)",
          borderLeft: deployMode === "mainnet"
            ? "2px solid var(--warning, #f59e0b)"
            : "2px solid var(--accent-soft)",
        }}
      >
        <span
          className="font-mono uppercase tracking-[0.1em]"
          style={{
            color: deployMode === "mainnet"
              ? "var(--warning, #f59e0b)"
              : "var(--accent-soft)",
          }}
        >
          {deployMode === "mainnet" ? "Live mainnet · " : "Testnet preview · "}
        </span>
        {deployMode === "mainnet"
          ? "Free to deploy on live mainnets — INFI does not charge a fee in this version. You only pay your own gas. Contracts are immutable and immediately public."
          : "Testnet deploys are free except for your own gas. You'll need test ETH/BNB/POL — links to faucets are shown when you select a chain."}
      </div>

      {/* Step indicator */}
      <StepIndicator step={step} />

      {/* Active step body */}
      {step === "chain" && (
        <ChainStep
          mode={deployMode}
          onModeChange={setDeployMode}
          onSelect={(id) => {
            setChainId(id);
            setStep("template");
          }}
        />
      )}
      {step === "template" && chain && (
        <TemplateStep
          chain={chain}
          onSelect={(id) => {
            setTemplateId(id);
            const t = getTemplate(id);
            const initialParams: Record<string, string | number> = {};
            for (const p of t.parameters) {
              if (p.defaultValue !== undefined) initialParams[p.name] = p.defaultValue;
            }
            setParameters(initialParams);
            setStep("params");
          }}
          onBack={() => setStep("chain")}
        />
      )}
      {step === "params" && chain && template && (
        <ParamsStep
          template={template}
          chain={chain}
          parameters={parameters}
          onChange={setParameters}
          onContinue={() => {
            const result = runSecurityScan({
              template,
              parameters,
              mode: deployMode,
            });
            setScanResult(result);
            setStep("scan");
          }}
          onBack={() => setStep("template")}
        />
      )}
      {step === "scan" && scanResult && (
        <ScanStep
          result={scanResult}
          onContinue={() => setStep("intent")}
          onBack={() => setStep("params")}
        />
      )}
      {step === "intent" && (
        <IntentStep
          data={intentData}
          onChange={setIntentData}
          onContinue={() => setStep("deploy")}
          onBack={() => setStep("scan")}
        />
      )}
      {step === "deploy" && chain && template && (
        <DeployStep
          chain={chain}
          mode={deployMode}
          template={template}
          parameters={parameters}
          intentData={intentData}
          onSuccess={(result) => {
            setDeployResult(result);
            setStep("success");
          }}
          onBack={() => setStep("intent")}
        />
      )}
      {step === "success" && deployResult && chain && template && (
        <SuccessStep
          result={deployResult}
          chain={chain}
          mode={deployMode}
          template={template}
          parameters={parameters}
          onReset={reset}
        />
      )}
    </main>
  );
}

/* ─────────────────────────────────────────────────────────────
   Step indicator
   ───────────────────────────────────────────────────────────── */

function StepIndicator({ step }: { step: WizardStep }) {
  const steps: Array<{ id: WizardStep; label: string }> = [
    { id: "chain", label: "Chain" },
    { id: "template", label: "Template" },
    { id: "params", label: "Details" },
    { id: "scan", label: "Scan" },
    { id: "intent", label: "Listing" },
    { id: "deploy", label: "Deploy" },
    { id: "success", label: "Done" },
  ];
  const currentIdx = steps.findIndex((s) => s.id === step);

  return (
    <div className="card p-3 flex items-center gap-2 flex-wrap">
      {steps.map((s, i) => {
        const isActive = i === currentIdx;
        const isComplete = i < currentIdx;
        return (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className="font-mono text-[10px] tracking-[0.05em]"
              style={{
                color: isActive
                  ? "var(--fg)"
                  : isComplete
                  ? "var(--success, #10b981)"
                  : "var(--fg-dim)",
              }}
            >
              {isComplete ? "✓" : i + 1}. {s.label.toUpperCase()}
            </div>
            {i < steps.length - 1 && (
              <div
                style={{
                  width: "16px",
                  height: "1px",
                  background: "var(--border)",
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Step 1 — Chain selection
   ───────────────────────────────────────────────────────────── */

function ChainStep({
  mode,
  onModeChange,
  onSelect,
}: {
  mode: "testnet" | "mainnet";
  onModeChange: (m: "testnet" | "mainnet") => void;
  onSelect: (id: DeployerChainId) => void;
}) {
  const chains = listDeployerChains();
  /* Track whether user has confirmed they understand mainnet
     consequences. Until they do, the cards are gated. Resets
     when mode flips back to testnet. */
  const [mainnetAcknowledged, setMainnetAcknowledged] = useState(false);

  /* Switching to testnet should clear acknowledgment. Switching
     to mainnet requires explicit acknowledgment before cards are
     selectable. */
  function handleModeChange(next: "testnet" | "mainnet") {
    if (next === "testnet") setMainnetAcknowledged(false);
    onModeChange(next);
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div
        className="card p-3 flex items-center justify-between gap-3 flex-wrap"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
        }}
      >
        <div>
          <div
            className="font-mono text-[10px] tracking-[0.1em] uppercase"
            style={{ color: "var(--fg-dim)" }}
          >
            Deployment mode
          </div>
          <div
            className="text-[12px] mt-0.5"
            style={{ color: "var(--fg-muted)" }}
          >
            {mode === "testnet"
              ? "Free testnet deploys for testing"
              : "Free mainnet deploys — only your gas"}
          </div>
        </div>
        <div
          className="flex items-center rounded-md overflow-hidden"
          style={{
            background: "var(--bg-subtle)",
            border: "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            onClick={() => handleModeChange("testnet")}
            className="font-mono text-[10px] px-3 py-2 transition-colors"
            style={{
              background:
                mode === "testnet"
                  ? "linear-gradient(135deg, var(--accent), var(--accent-soft))"
                  : "transparent",
              color: mode === "testnet" ? "#fff" : "var(--fg-muted)",
              border: "none",
              cursor: "pointer",
              letterSpacing: "0.05em",
            }}
          >
            TESTNET
          </button>
          <button
            type="button"
            onClick={() => handleModeChange("mainnet")}
            className="font-mono text-[10px] px-3 py-2 transition-colors"
            style={{
              background:
                mode === "mainnet"
                  ? "linear-gradient(135deg, var(--danger), #f59e0b)"
                  : "transparent",
              color: mode === "mainnet" ? "#fff" : "var(--fg-muted)",
              border: "none",
              cursor: "pointer",
              letterSpacing: "0.05em",
            }}
          >
            MAINNET
          </button>
        </div>
      </div>

      {/* Mainnet acknowledgment gate */}
      {mode === "mainnet" && !mainnetAcknowledged && (
        <div
          className="card p-4 space-y-3"
          style={{
            background: "rgba(239,68,68,0.05)",
            borderLeft: "3px solid var(--danger)",
          }}
        >
          <div
            className="font-mono text-[11px] tracking-[0.1em] uppercase"
            style={{ color: "var(--warning, #f59e0b)" }}
          >
            ⚠ Mainnet mode
          </div>
          <div
            className="text-[12px] leading-relaxed space-y-2"
            style={{ color: "var(--fg-muted)" }}
          >
            <p>
              You're switching to <strong style={{ color: "var(--fg)" }}>live mainnet mode</strong>.
              Every deploy on this mode:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                Is <strong style={{ color: "var(--success, #10b981)" }}>free during this version</strong> —
                INFI does not charge a deployment fee
              </li>
              <li>Charges your wallet's gas for the deploy transaction (paid to network validators, not INFI)</li>
              <li>Deploys an immutable contract to the live blockchain — it cannot be undone</li>
              <li>Makes the contract publicly visible on block explorers and aggregators</li>
            </ul>
            <p
              className="text-[11px]"
              style={{ color: "var(--fg-dim)" }}
            >
              Future versions may gate mainnet access by INVERTX token holdings.
              No fees are charged in this version.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMainnetAcknowledged(true)}
            className="font-mono text-[11px] px-4 py-2 rounded transition-colors"
            style={{
              background: "var(--accent-soft)",
              color: "#fff",
              border: "none",
              cursor: "pointer",
              letterSpacing: "0.05em",
            }}
          >
            I UNDERSTAND — CONTINUE TO CHAIN SELECTION
          </button>
        </div>
      )}

      {/* Chain cards — only visible after acknowledgment when in mainnet mode */}
      {(mode === "testnet" || mainnetAcknowledged) && (
        <>
          <SectionHeader>
            {mode === "mainnet" ? "Choose a mainnet" : "Choose a testnet"}
          </SectionHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {chains.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c.id)}
                className="card p-4 text-left hover:border-[var(--accent-soft)] transition-colors"
                style={{
                  cursor: "pointer",
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className="font-medium"
                    style={{ color: "var(--fg)" }}
                  >
                    {c.name}
                  </span>
                  <span
                    className="font-mono text-[9px] uppercase tracking-[0.05em]"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    {mode === "mainnet" ? "Mainnet" : c.testnetName}
                  </span>
                </div>
                <div
                  className="text-[11px]"
                  style={{ color: "var(--fg-muted)" }}
                >
                  Native: {c.nativeSymbol} · ChainID{" "}
                  {mode === "mainnet" ? c.mainnetChainId : c.testnetChainId}
                </div>
                {mode === "mainnet" && (
                  <div
                    className="text-[10px] mt-1 font-mono"
                    style={{ color: "var(--success, #10b981)" }}
                  >
                    Free deploy — you only pay your own gas
                  </div>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Step 2 — Template picker
   ───────────────────────────────────────────────────────────── */

function TemplateStep({
  chain,
  onSelect,
  onBack,
}: {
  chain: ReturnType<typeof DEPLOYER_CHAINS["ethereum"] extends infer T ? () => T : never> extends () => infer R
    ? R
    : (typeof DEPLOYER_CHAINS)[DeployerChainId];
  onSelect: (id: TemplateId) => void;
  onBack: () => void;
}) {
  const templates = listTemplates();
  return (
    <div className="space-y-3">
      <SectionHeader>
        Choose a template — deploying on {chain.testnetName}
      </SectionHeader>
      <div className="space-y-2">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            disabled={!t.bytecodeReady}
            className="card p-4 text-left transition-colors w-full"
            style={{
              cursor: t.bytecodeReady ? "pointer" : "not-allowed",
              opacity: t.bytecodeReady ? 1 : 0.5,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
              <span
                className="font-medium"
                style={{ color: "var(--fg)" }}
              >
                {t.name}
              </span>
              <div className="flex items-center gap-2">
                <span
                  className="font-mono text-[9px] uppercase tracking-[0.05em]"
                  style={{ color: "var(--fg-dim)" }}
                >
                  solc {t.solcVersion}
                </span>
                {!t.bytecodeReady && (
                  <span
                    className="font-mono text-[9px] uppercase tracking-[0.05em] px-1.5 py-0.5 rounded"
                    style={{
                      color: "var(--warning, #f59e0b)",
                      background: "rgba(245,158,11,0.1)",
                    }}
                  >
                    Compile required
                  </span>
                )}
              </div>
            </div>
            <p
              className="text-[12px] leading-relaxed"
              style={{ color: "var(--fg-muted)" }}
            >
              {t.description}
            </p>
            {!t.bytecodeReady && (
              <p
                className="text-[11px] mt-2"
                style={{ color: "var(--warning, #f59e0b)" }}
              >
                Bytecode not populated. See{" "}
                <code style={{ fontSize: "10px" }}>
                  lib/deployer/templates/erc20-ozv5.bytecode.ts
                </code>{" "}
                for compile instructions.
              </p>
            )}
          </button>
        ))}
      </div>
      <div className="flex justify-start">
        <BackButton onClick={onBack} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Step 3 — Parameter form
   ───────────────────────────────────────────────────────────── */

function ParamsStep({
  template,
  chain,
  parameters,
  onChange,
  onContinue,
  onBack,
}: {
  template: TokenTemplate;
  chain: (typeof DEPLOYER_CHAINS)[DeployerChainId];
  parameters: Record<string, string | number>;
  onChange: (p: Record<string, string | number>) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  function update(name: string, value: string | number) {
    onChange({ ...parameters, [name]: value });
  }

  /* Basic validity check before allowing continue */
  const allFilled = template.parameters.every((p) => {
    const v = parameters[p.name];
    if (v === undefined || v === null || v === "") return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <SectionHeader>
        {template.name} · {chain.testnetName}
      </SectionHeader>
      <div className="space-y-3">
        {template.parameters.map((p) => (
          <div key={p.name}>
            <label
              className="font-mono text-[10px] tracking-[0.1em] uppercase mb-1 block"
              style={{ color: "var(--fg-dim)" }}
            >
              {p.label}
            </label>
            <input
              type={p.solidityType === "string" ? "text" : "number"}
              value={parameters[p.name] ?? ""}
              onChange={(e) => {
                const v =
                  p.solidityType === "string"
                    ? e.target.value
                    : e.target.valueAsNumber;
                update(p.name, v);
              }}
              placeholder={p.placeholder}
              maxLength={p.maxLength}
              min={p.min}
              max={p.max}
              style={{
                width: "100%",
                padding: "8px 10px",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                color: "var(--fg)",
                fontSize: "13px",
                fontFamily: "inherit",
                outline: "none",
              }}
            />
            {p.helpText && (
              <p
                className="text-[10px] mt-1"
                style={{ color: "var(--fg-dim)" }}
              >
                {p.helpText}
              </p>
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-between">
        <BackButton onClick={onBack} />
        <ContinueButton disabled={!allFilled} onClick={onContinue}>
          Run security scan →
        </ContinueButton>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Step 4 — Security scan results
   ───────────────────────────────────────────────────────────── */

function ScanStep({
  result,
  onContinue,
  onBack,
}: {
  result: ScanResult;
  onContinue: () => void;
  onBack: () => void;
}) {
  const passes = result.checks.filter((c) => c.severity === "pass").length;
  const warns = result.checks.filter((c) => c.severity === "warn").length;
  const fails = result.checks.filter((c) => c.severity === "fail").length;

  return (
    <div className="space-y-4">
      <SectionHeader>Automated Security Scan</SectionHeader>
      <p
        className="text-[12px] leading-relaxed"
        style={{ color: "var(--fg-muted)" }}
      >
        Pre-deployment pattern checks on your parameters. This is an
        automated scan — it catches common issues but does not replace
        a human security audit. For projects with significant value at
        stake, consider a professional audit before mainnet.
      </p>

      {/* Summary */}
      <div className="card p-3 flex items-center gap-3 flex-wrap">
        <span className="font-mono text-[10px]" style={{ color: "var(--success, #10b981)" }}>
          ✓ {passes} pass
        </span>
        {warns > 0 && (
          <span className="font-mono text-[10px]" style={{ color: "var(--warning, #f59e0b)" }}>
            ⚠ {warns} warn
          </span>
        )}
        {fails > 0 && (
          <span className="font-mono text-[10px]" style={{ color: "var(--danger)" }}>
            ✗ {fails} fail
          </span>
        )}
      </div>

      {/* Checks list */}
      <div className="space-y-2">
        {result.checks.map((c) => (
          <div
            key={c.id}
            className="card p-3"
            style={{
              borderLeft: `2px solid ${
                c.severity === "pass"
                  ? "var(--success, #10b981)"
                  : c.severity === "warn"
                  ? "var(--warning, #f59e0b)"
                  : "var(--danger)"
              }`,
            }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                style={{
                  color:
                    c.severity === "pass"
                      ? "var(--success, #10b981)"
                      : c.severity === "warn"
                      ? "var(--warning, #f59e0b)"
                      : "var(--danger)",
                  fontSize: "11px",
                }}
              >
                {c.severity === "pass" ? "✓" : c.severity === "warn" ? "⚠" : "✗"}
              </span>
              <span
                className="text-[12px] font-medium"
                style={{ color: "var(--fg)" }}
              >
                {c.label}
              </span>
            </div>
            <p
              className="text-[11px] leading-relaxed pl-5"
              style={{ color: "var(--fg-muted)" }}
            >
              {c.detail}
            </p>
          </div>
        ))}
      </div>

      {!result.canDeploy && (
        <div
          className="card p-3"
          style={{
            background: "rgba(239,68,68,0.05)",
            borderLeft: "2px solid var(--danger)",
          }}
        >
          <p className="text-[12px]" style={{ color: "var(--danger)" }}>
            One or more critical checks failed. Fix the parameters or
            the missing template bytecode before deploying.
          </p>
        </div>
      )}

      <div className="flex justify-between">
        <BackButton onClick={onBack} />
        <ContinueButton
          disabled={!result.canDeploy}
          onClick={onContinue}
        >
          Continue to listing intent →
        </ContinueButton>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Step 5 — Listing intent capture
   ───────────────────────────────────────────────────────────── */

const INTENT_OPTIONS = [
  {
    value: "usdt-presale",
    label: "USDT Presale on INFI Launchpad",
    detail: "Available now",
  },
  {
    value: "usdt-direct",
    label: "USDT Direct Listing on INFI Launchpad",
    detail: "Available now",
  },
  {
    value: "invertx-direct",
    label: "InvertX Direct Launch",
    detail: "Planned Q2-Q3 2026",
  },
  {
    value: "invertx-borrowing",
    label: "InvertX Liquidity Borrowing",
    detail: "Planned Q2-Q3 2026",
  },
  {
    value: "undecided",
    label: "Undecided / Want to discuss",
    detail: "Talk to BD team",
  },
];

function IntentStep({
  data,
  onChange,
  onContinue,
  onBack,
}: {
  data: {
    intent: string;
    email: string;
    twitter: string;
    telegram: string;
    website: string;
    description: string;
  };
  onChange: (
    d: {
      intent: string;
      email: string;
      twitter: string;
      telegram: string;
      website: string;
      description: string;
    },
  ) => void;
  onContinue: () => void;
  onBack: () => void;
}) {
  function update<K extends keyof typeof data>(key: K, value: typeof data[K]) {
    onChange({ ...data, [key]: value });
  }

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email);

  return (
    <div className="space-y-4">
      <SectionHeader>Listing intent + team contact</SectionHeader>
      <p
        className="text-[12px] leading-relaxed"
        style={{ color: "var(--fg-muted)" }}
      >
        Optional but encouraged. After your contract deploys, the INFI
        BD team can reach out to discuss your preferred listing path.
      </p>

      {/* Intent selector */}
      <div className="space-y-2">
        <label
          className="font-mono text-[10px] tracking-[0.1em] uppercase block"
          style={{ color: "var(--fg-dim)" }}
        >
          Preferred listing path
        </label>
        <div className="space-y-1">
          {INTENT_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className="card p-3 flex items-center gap-3 cursor-pointer"
              style={{
                background:
                  data.intent === opt.value
                    ? "rgba(108,99,255,0.05)"
                    : "var(--bg-elevated)",
                borderColor:
                  data.intent === opt.value
                    ? "var(--accent-soft)"
                    : "var(--border)",
              }}
            >
              <input
                type="radio"
                name="intent"
                value={opt.value}
                checked={data.intent === opt.value}
                onChange={() => update("intent", opt.value)}
                style={{ accentColor: "var(--accent-soft)" }}
              />
              <div className="flex-1">
                <div
                  className="text-[12px] font-medium"
                  style={{ color: "var(--fg)" }}
                >
                  {opt.label}
                </div>
                <div
                  className="text-[10px]"
                  style={{ color: "var(--fg-dim)" }}
                >
                  {opt.detail}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Contact fields */}
      <div className="space-y-3">
        <Field label="Team email *">
          <input
            type="email"
            value={data.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="team@yourproject.com"
            style={inputStyle}
          />
        </Field>
        <Field label="Twitter / X">
          <input
            type="text"
            value={data.twitter}
            onChange={(e) => update("twitter", e.target.value)}
            placeholder="https://twitter.com/yourproject"
            style={inputStyle}
          />
        </Field>
        <Field label="Telegram">
          <input
            type="text"
            value={data.telegram}
            onChange={(e) => update("telegram", e.target.value)}
            placeholder="https://t.me/yourproject"
            style={inputStyle}
          />
        </Field>
        <Field label="Website">
          <input
            type="text"
            value={data.website}
            onChange={(e) => update("website", e.target.value)}
            placeholder="https://yourproject.com"
            style={inputStyle}
          />
          <p
            className="text-[10px] mt-1"
            style={{ color: "var(--fg-dim)" }}
          >
            No website yet? Our partner StudioX builds Web3 sites —{" "}
            <a
              href="https://studiox.build/"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent-soft)" }}
            >
              studiox.build
            </a>
          </p>
        </Field>
        <Field label="Description">
          <textarea
            value={data.description}
            onChange={(e) => update("description", e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Brief description of your project."
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </Field>
      </div>

      <div className="flex justify-between">
        <BackButton onClick={onBack} />
        <ContinueButton disabled={!emailValid} onClick={onContinue}>
          Continue to deploy →
        </ContinueButton>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Step 6 — Deploy execution
   ───────────────────────────────────────────────────────────── */

function DeployStep({
  chain,
  mode,
  template,
  parameters,
  intentData,
  onSuccess,
  onBack,
}: {
  chain: (typeof DEPLOYER_CHAINS)[DeployerChainId];
  mode: "testnet" | "mainnet";
  template: TokenTemplate;
  parameters: Record<string, string | number>;
  intentData: {
    intent: string;
    email: string;
    twitter: string;
    telegram: string;
    website: string;
    description: string;
  };
  onSuccess: (r: DeploymentResult) => void;
  onBack: () => void;
}) {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const network = useAppKitNetwork();
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string>("");
  const isMainnet = mode === "mainnet";

  /* Mode-resolved chain context. */
  const targetChainId =
    isMainnet ? chain.mainnetChainId : chain.testnetChainId;
  const targetChainName =
    isMainnet ? chain.name : chain.testnetName;
  const targetExplorer =
    isMainnet ? chain.mainnetExplorer : chain.testnetExplorer;
  const targetRpcUrl =
    isMainnet ? chain.mainnetRpcUrl : chain.testnetRpcUrl;

  /* Balance polling state — used in both modes. On mainnet we
     don't show the GET TOKENS button (no faucets), but we still
     want users to see their balance so they know they have gas. */
  const [balance, setBalance] = useState<bigint | null>(null);
  const [balanceLoaded, setBalanceLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [copyToast, setCopyToast] = useState<string>("");

  const onCorrectChain =
    isConnected && network.chainId === targetChainId;

  /* Poll balance while connected on the right chain. Stops once
     non-zero balance seen (no point spending RPC calls when funded). */
  useEffect(() => {
    if (!isConnected || !address || !onCorrectChain || ready) return;

    let cancelled = false;
    async function pollBalance() {
      /* Use a custom adapter that respects the mode's RPC URL. */
      const chainForBalance = mode === "mainnet"
        ? { ...chain, testnetRpcUrl: targetRpcUrl }
        : chain;
      const bal = await fetchTestnetBalance(chainForBalance, address!);
      if (cancelled) return;
      setBalanceLoaded(true);
      if (bal !== null) {
        setBalance(bal);
        if (bal > BigInt(0)) setReady(true);
      }
    }

    pollBalance();
    const interval = setInterval(pollBalance, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isConnected, address, onCorrectChain, ready, chain, mode, targetRpcUrl]);

  useEffect(() => {
    if (!copyToast) return;
    const timer = setTimeout(() => setCopyToast(""), 2500);
    return () => clearTimeout(timer);
  }, [copyToast]);

  async function handleGetTestTokens() {
    if (!address || mode === "mainnet") return;
    const copied = await copyToClipboard(address);
    setCopyToast(
      copied
        ? `Address copied — paste it in the faucet`
        : `Couldn't auto-copy — your address: ${address.slice(0, 10)}…${address.slice(-4)}`,
    );
    window.open(chain.testnetFaucetUrl, "_blank", "noopener,noreferrer");
  }

  async function handleDeploy() {
    setError("");
    setDeploying(true);
    try {
      const { executeDeploy } = await import(
        "@/lib/deployer/executeDeploy"
      );
      const result = await executeDeploy({
        chain,
        isMainnet,
        template,
        parameters,
        deployerAddress: address!,
      });

      /* Register the deployment with the New Projects feed. */
      try {
        await fetch("/api/alpha/internal-deployment-public", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-deploy-context": isMainnet ? "mainnet" : "testnet",
          },
          body: JSON.stringify({
            contractAddress: result.contractAddress,
            chain: chain.id,
            blockNumber: result.blockNumber,
            txHash: result.txHash,
            deployer: address,
            symbol: parameters.symbol,
            name: parameters.name,
            decimals: parameters.decimals,
            socials: {
              website: intentData.website || undefined,
              twitter: intentData.twitter || undefined,
              telegram: intentData.telegram || undefined,
            },
          }),
        });
      } catch {
        /* Non-fatal — contract is on-chain regardless. */
      }

      /* Send listing intent if email was provided */
      if (intentData.email) {
        try {
          await fetch("/api/alpha/listing-intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contractAddress: result.contractAddress,
              chain: chain.name,
              symbol: parameters.symbol,
              intent: intentData.intent,
              teamEmail: intentData.email,
              twitter: intentData.twitter || undefined,
              telegram: intentData.telegram || undefined,
              website: intentData.website || undefined,
              description: intentData.description || undefined,
            }),
          });
        } catch {
          /* Non-fatal */
        }
      }

      onSuccess({
        contractAddress: result.contractAddress,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        chainId: targetChainId,
        testnetExplorer: targetExplorer,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setDeploying(false);
    }
  }

  const deployButtonEnabled = !deploying;

  return (
    <div className="space-y-4">
      <SectionHeader>Deploy {String(parameters.symbol)}</SectionHeader>

      {/* Summary */}
      <div className="card p-4 space-y-2">
        <div className="flex justify-between text-[12px]">
          <span style={{ color: "var(--fg-dim)" }}>Chain</span>
          <span style={{ color: "var(--fg)" }}>
            {chain.name}
            {isMainnet ? " (mainnet)" : ` (${chain.testnetName})`}
          </span>
        </div>
        <div className="flex justify-between text-[12px]">
          <span style={{ color: "var(--fg-dim)" }}>Template</span>
          <span style={{ color: "var(--fg)" }}>{template.name}</span>
        </div>
        <div className="flex justify-between text-[12px]">
          <span style={{ color: "var(--fg-dim)" }}>Token</span>
          <span style={{ color: "var(--fg)" }}>
            {String(parameters.name)} ({String(parameters.symbol)})
          </span>
        </div>
        <div className="flex justify-between text-[12px]">
          <span style={{ color: "var(--fg-dim)" }}>Supply</span>
          <span style={{ color: "var(--fg)" }}>
            {Number(parameters.initialSupply).toLocaleString()} ×{" "}
            10^{String(parameters.decimals)}
          </span>
        </div>
        {isMainnet && (
          <div
            className="flex justify-between text-[12px] pt-2"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <span style={{ color: "var(--success, #10b981)" }}>Deployment fee</span>
            <span
              className="font-mono"
              style={{ color: "var(--success, #10b981)" }}
            >
              FREE — only your gas
            </span>
          </div>
        )}
      </div>

      {/* Wallet status */}
      {!isConnected ? (
        <button
          type="button"
          onClick={() => open()}
          className="w-full font-mono text-[11px] py-3 rounded transition-colors"
          style={{
            background:
              "linear-gradient(135deg, var(--accent), var(--accent-soft))",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            letterSpacing: "0.05em",
          }}
        >
          CONNECT WALLET
        </button>
      ) : !onCorrectChain ? (
        <div className="space-y-2">
          <div
            className="card p-3"
            style={{
              borderLeft: "2px solid var(--warning, #f59e0b)",
            }}
          >
            <p className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
              Wallet connected but on the wrong chain. Switch to{" "}
              <strong style={{ color: "var(--fg)" }}>
                {targetChainName}
              </strong>{" "}
              (chainId {targetChainId}) to deploy.
            </p>
          </div>
          <button
            type="button"
            onClick={() => network.switchNetwork({ id: targetChainId } as never)}
            className="w-full font-mono text-[11px] py-2 rounded"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--fg)",
              border: "1px solid var(--border)",
              cursor: "pointer",
            }}
          >
            SWITCH NETWORK
          </button>
        </div>
      ) : (
        <>
          <div
            className="card p-3 text-[11px]"
            style={{ color: "var(--fg-muted)" }}
          >
            <div className="font-mono text-[10px] mb-1" style={{ color: "var(--fg-dim)" }}>
              Connected as
            </div>
            <div className="font-mono" style={{ color: "var(--fg)" }}>
              {address}
            </div>
          </div>

          <button
            type="button"
            onClick={handleDeploy}
            disabled={!deployButtonEnabled}
            className="w-full font-mono text-[11px] py-3 rounded transition-colors"
            style={{
              background: !deployButtonEnabled
                ? "var(--bg-subtle)"
                : isMainnet
                ? "linear-gradient(135deg, var(--danger), #f59e0b)"
                : "linear-gradient(135deg, var(--accent), var(--accent-soft))",
              color: !deployButtonEnabled ? "var(--fg-dim)" : "#fff",
              border: "none",
              cursor: !deployButtonEnabled ? "not-allowed" : "pointer",
              letterSpacing: "0.05em",
            }}
          >
            {deploying
              ? "DEPLOYING — DO NOT CLOSE THIS TAB…"
              : isMainnet
              ? `DEPLOY TO ${chain.name.toUpperCase()} MAINNET`
              : `DEPLOY TO ${chain.testnetName.toUpperCase()}`}
          </button>

          {/* Balance / faucet panel */}
          <div
            className="card p-3"
            style={{
              background: ready
                ? "rgba(34,209,96,0.06)"
                : "var(--bg-elevated)",
              border: ready
                ? "1px solid rgba(34,209,96,0.4)"
                : "1px solid var(--border)",
              transition: "background 200ms, border 200ms",
            }}
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div
                  className="font-mono text-[10px] tracking-[0.1em] uppercase"
                  style={{
                    color: ready
                      ? "var(--success, #10b981)"
                      : "var(--fg-dim)",
                  }}
                >
                  {ready
                    ? "✓ Ready to deploy"
                    : isMainnet
                    ? `${chain.nativeSymbol} balance`
                    : "Testnet balance"}
                </div>
                <div
                  className="text-[14px] font-medium mt-0.5"
                  style={{
                    color: ready ? "var(--fg)" : "var(--fg-muted)",
                    fontFamily: "monospace",
                  }}
                >
                  {!balanceLoaded
                    ? "Checking…"
                    : balance === null
                    ? "Unable to read balance"
                    : `${formatBalance(balance)} ${chain.nativeSymbol}`}
                </div>
              </div>
              {!ready && !isMainnet && (
                <button
                  type="button"
                  onClick={handleGetTestTokens}
                  className="font-mono text-[10px] px-3 py-2 rounded"
                  style={{
                    background: "var(--bg-subtle)",
                    color: "var(--accent-soft)",
                    border: "1px solid var(--accent-soft)",
                    cursor: "pointer",
                    letterSpacing: "0.05em",
                    whiteSpace: "nowrap",
                  }}
                >
                  GET TEST {chain.nativeSymbol} →
                </button>
              )}
            </div>
            {!ready && !isMainnet && (
              <p
                className="text-[10px] mt-2"
                style={{ color: "var(--fg-dim)" }}
              >
                Click the button to copy your wallet address and
                open the {chain.testnetName} faucet. Paste your
                address in the faucet, claim tokens, then come
                back here — your balance refreshes automatically
                every 15 seconds.
              </p>
            )}
            {!ready && isMainnet && (
              <p
                className="text-[10px] mt-2"
                style={{ color: "var(--fg-dim)" }}
              >
                You'll need {chain.nativeSymbol} in your wallet for the
                deploy transaction's gas fee (paid to network validators —
                INFI does not charge a deployment fee). Buy{" "}
                {chain.nativeSymbol} on any major exchange and transfer to
                your wallet before deploying.
              </p>
            )}
          </div>

          {copyToast && (
            <div
              className="card p-2 text-[11px] text-center"
              style={{
                background: "rgba(108,99,255,0.08)",
                borderLeft: "2px solid var(--accent-soft)",
                color: "var(--fg)",
              }}
            >
              {copyToast}
            </div>
          )}
        </>
      )}

      {error && (
        <div
          className="card p-3 text-[11px]"
          style={{
            background: "rgba(239,68,68,0.08)",
            borderLeft: "2px solid var(--danger)",
            color: "var(--danger)",
          }}
        >
          {error}
        </div>
      )}

      <div className="flex justify-start">
        <BackButton onClick={onBack} disabled={deploying} />
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Step 7 — Success

   On mount, kicks off Etherscan source verification automatically.
   Status flows: pending → submitted → verifying → verified | failed
   Failed state shows a retry button that re-runs the submit.
   ───────────────────────────────────────────────────────────── */

type VerificationUiStatus =
  | "idle"
  | "pending"
  | "submitted"
  | "verifying"
  | "verified"
  | "failed"
  | "skipped";

interface VerifyApiResponse {
  ok: boolean;
  status?: VerificationUiStatus;
  guid?: string;
  message?: string;
  error?: string;
}

function SuccessStep({
  result,
  chain,
  mode,
  template,
  parameters,
  onReset,
}: {
  result: DeploymentResult;
  chain: (typeof DEPLOYER_CHAINS)[DeployerChainId];
  mode: "testnet" | "mainnet";
  template: TokenTemplate;
  parameters: Record<string, string | number>;
  onReset: () => void;
}) {
  const explorerBase =
    mode === "mainnet" ? chain.mainnetExplorer : chain.testnetExplorer;
  const chainLabel =
    mode === "mainnet" ? chain.name : chain.testnetName;
  const verifyChainId =
    mode === "mainnet" ? chain.mainnetChainId : chain.testnetChainId;

  /* Verification state machine */
  const [verifyStatus, setVerifyStatus] = useState<VerificationUiStatus>("idle");
  const [verifyMessage, setVerifyMessage] = useState<string>("");
  const [verifyGuid, setVerifyGuid] = useState<string>("");

  /* Build the manual-verify URL on the explorer's UI as a fallback
     when API verification fails completely. */
  const manualVerifyUrl = `${explorerBase}/verifyContract?a=${result.contractAddress}`;

  /* Auto-attempt verification on mount. Runs once. The user can
     manually retry via the button below. */
  useEffect(() => {
    let cancelled = false;
    async function autoVerify() {
      setVerifyStatus("pending");
      setVerifyMessage("Encoding constructor arguments…");

      let constructorArgs: string;
      try {
        constructorArgs = encodeConstructorArgs(template, parameters);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setVerifyStatus("failed");
        setVerifyMessage(`Could not encode constructor arguments: ${msg}`);
        return;
      }

      if (cancelled) return;
      setVerifyMessage("Submitting source to Etherscan…");

      let res: Response;
      try {
        res = await fetch("/api/alpha/verify-contract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "submit",
            chainId: verifyChainId,
            contractAddress: result.contractAddress,
            constructorArguments: constructorArgs,
            templateId: template.id,
          }),
        });
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        setVerifyStatus("failed");
        setVerifyMessage(`Verification request failed: ${msg}`);
        return;
      }

      const json: VerifyApiResponse = await res.json();
      if (cancelled) return;

      if (!json.ok) {
        setVerifyStatus("failed");
        setVerifyMessage(json.error ?? "Submit failed");
        return;
      }

      const status = json.status ?? "failed";
      setVerifyStatus(status);
      setVerifyMessage(json.message ?? "");
      if (json.guid) setVerifyGuid(json.guid);

      /* If submit returned anything not terminal, start polling. */
      if (status === "submitted" || status === "verifying") {
        if (json.guid) pollUntilDone(json.guid);
      }
    }

    async function pollUntilDone(guid: string) {
      const POLL_EVERY_MS = 5_000;
      const MAX_POLLS = 18; // 90 seconds total
      for (let i = 0; i < MAX_POLLS; i++) {
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, POLL_EVERY_MS));
        if (cancelled) return;

        try {
          const res = await fetch("/api/alpha/verify-contract", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "status",
              chainId: verifyChainId,
              guid,
            }),
          });
          const json: VerifyApiResponse = await res.json();
          if (cancelled) return;

          const status = json.status ?? "verifying";
          setVerifyStatus(status);
          setVerifyMessage(json.message ?? "");

          if (status === "verified" || status === "failed") return;
        } catch {
          /* Transient error — keep polling. */
        }
      }

      /* Timeout — leave status as-is and let user click retry. */
      if (!cancelled) {
        setVerifyMessage(
          "Etherscan is still processing. You can try the retry button in a few minutes.",
        );
      }
    }

    autoVerify();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRetry() {
    setVerifyStatus("pending");
    setVerifyMessage("Re-submitting to Etherscan…");
    setVerifyGuid("");

    let constructorArgs: string;
    try {
      constructorArgs = encodeConstructorArgs(template, parameters);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setVerifyStatus("failed");
      setVerifyMessage(`Could not encode constructor arguments: ${msg}`);
      return;
    }

    try {
      const res = await fetch("/api/alpha/verify-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          chainId: verifyChainId,
          contractAddress: result.contractAddress,
          constructorArguments: constructorArgs,
          templateId: template.id,
        }),
      });
      const json: VerifyApiResponse = await res.json();
      const status = json.ok ? json.status ?? "failed" : "failed";
      setVerifyStatus(status);
      setVerifyMessage(json.message ?? json.error ?? "");
      if (json.guid) setVerifyGuid(json.guid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setVerifyStatus("failed");
      setVerifyMessage(`Retry failed: ${msg}`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-5 text-center">
        <div
          className="text-3xl mb-2"
          style={{ color: "var(--success, #10b981)" }}
        >
          ✓
        </div>
        <h2
          className="text-lg font-medium mb-2"
          style={{ color: "var(--fg)" }}
        >
          Deployed successfully
        </h2>
        <p
          className="text-[12px] max-w-md mx-auto leading-relaxed"
          style={{ color: "var(--fg-muted)" }}
        >
          Your contract is live on {chainLabel} and has been
          listed on the SbSe Guardian New Projects feed with the INFI
          verified badge.
        </p>
      </div>

      {/* Verification status panel */}
      <VerificationPanel
        status={verifyStatus}
        message={verifyMessage}
        explorerUrl={`${explorerBase}/address/${result.contractAddress}#code`}
        manualVerifyUrl={manualVerifyUrl}
        onRetry={handleRetry}
      />

      {/* Prominent copyable contract address card */}
      <ContractAddressCard
        address={result.contractAddress}
        explorerUrl={`${explorerBase}/address/${result.contractAddress}`}
      />

      <div className="card p-4 space-y-3 text-[12px]">
        <div className="flex justify-between gap-2">
          <span style={{ color: "var(--fg-dim)" }}>Tx</span>
          <a
            href={`${explorerBase}/tx/${result.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:underline truncate"
            style={{ color: "var(--info)" }}
          >
            {result.txHash.slice(0, 10)}…
          </a>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "var(--fg-dim)" }}>Block</span>
          <span style={{ color: "var(--fg)" }}>
            {result.blockNumber.toLocaleString()}
          </span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "var(--fg-dim)" }}>Mode</span>
          <span style={{ color: "var(--fg)" }}>
            {mode === "mainnet" ? "Mainnet (live)" : "Testnet"}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onReset}
        className="w-full font-mono text-[11px] py-2 rounded"
        style={{
          background: "var(--bg-elevated)",
          color: "var(--fg)",
          border: "1px solid var(--border)",
          cursor: "pointer",
          letterSpacing: "0.05em",
        }}
      >
        DEPLOY ANOTHER
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Shared UI helpers
   ───────────────────────────────────────────────────────────── */

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="font-mono text-[11px] tracking-[0.15em] uppercase"
      style={{ color: "var(--accent-soft)" }}
    >
      {children}
    </h2>
  );
}

function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="font-mono text-[11px] px-4 py-2 rounded"
      style={{
        background: "transparent",
        color: "var(--fg-muted)",
        border: "1px solid var(--border)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      ← Back
    </button>
  );
}

function ContinueButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="font-mono text-[11px] px-4 py-2 rounded transition-colors"
      style={{
        background: disabled
          ? "var(--bg-subtle)"
          : "linear-gradient(135deg, var(--accent), var(--accent-soft))",
        color: disabled ? "var(--fg-dim)" : "#fff",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        letterSpacing: "0.05em",
      }}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="font-mono text-[10px] tracking-[0.1em] uppercase mb-1 block"
        style={{ color: "var(--fg-dim)" }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  color: "var(--fg)",
  fontSize: "13px",
  fontFamily: "inherit",
  outline: "none",
};

/* ─────────────────────────────────────────────────────────────
   VerificationPanel — used by SuccessStep to surface Etherscan
   source verification status with appropriate visual treatment
   per state.
   ───────────────────────────────────────────────────────────── */

function ContractAddressCard({
  address,
  explorerUrl,
}: {
  address: string;
  explorerUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  /* Auto-clear the "copied" state after 2 seconds. */
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    const ok = await copyToClipboard(address);
    if (ok) setCopied(true);
  }

  return (
    <div
      className="card p-4"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        className="font-mono text-[10px] tracking-[0.1em] uppercase mb-2"
        style={{ color: "var(--fg-dim)" }}
      >
        Contract address
      </div>
      <div className="flex items-center gap-2 mb-3">
        <code
          className="text-[12px] flex-1 break-all leading-relaxed"
          style={{
            color: "var(--fg)",
            fontFamily: "monospace",
          }}
        >
          {address}
        </code>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={handleCopy}
          className="font-mono text-[10px] px-3 py-2 rounded transition-colors"
          style={{
            background: copied ? "rgba(34,209,96,0.12)" : "var(--bg-subtle)",
            color: copied ? "var(--success, #10b981)" : "var(--accent-soft)",
            border: copied
              ? "1px solid rgba(34,209,96,0.4)"
              : "1px solid var(--accent-soft)",
            cursor: "pointer",
            letterSpacing: "0.05em",
          }}
        >
          {copied ? "✓ COPIED" : "COPY ADDRESS"}
        </button>
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[10px] px-3 py-2 rounded hover:underline"
          style={{
            color: "var(--fg-dim)",
            letterSpacing: "0.05em",
          }}
        >
          VIEW ON EXPLORER →
        </a>
      </div>
    </div>
  );
}

function VerificationPanel({
  status,
  message,
  explorerUrl,
  manualVerifyUrl,
  onRetry,
}: {
  status: VerificationUiStatus;
  message: string;
  explorerUrl: string;
  manualVerifyUrl: string;
  onRetry: () => void;
}) {
  const isWorking =
    status === "idle" || status === "pending" ||
    status === "submitted" || status === "verifying";
  const isVerified = status === "verified";
  const isFailed = status === "failed";

  /* Color theme per state */
  const accentColor = isVerified
    ? "var(--success, #10b981)"
    : isFailed
    ? "var(--danger)"
    : isWorking
    ? "var(--accent-soft)"
    : "var(--fg-dim)";

  const bgColor = isVerified
    ? "rgba(34,209,96,0.06)"
    : isFailed
    ? "rgba(239,68,68,0.06)"
    : isWorking
    ? "rgba(108,99,255,0.04)"
    : "var(--bg-elevated)";

  const icon = isVerified ? "✓" : isFailed ? "✗" : "⏳";

  const headline = isVerified
    ? "Source code verified on Etherscan"
    : isFailed
    ? "Auto-verification failed"
    : isWorking
    ? "Verifying source on Etherscan…"
    : "Source verification";

  return (
    <div
      className="card p-4"
      style={{
        background: bgColor,
        borderLeft: `2px solid ${accentColor}`,
        transition: "background 200ms, border 200ms",
      }}
    >
      <div className="flex items-start gap-3">
        <span style={{ color: accentColor, fontSize: "18px", lineHeight: "1" }}>
          {icon}
        </span>
        <div className="flex-1 min-w-0">
          <div
            className="font-mono text-[10px] tracking-[0.1em] uppercase mb-1"
            style={{ color: accentColor }}
          >
            Etherscan source verification
          </div>
          <div
            className="text-[13px] font-medium mb-1"
            style={{ color: "var(--fg)" }}
          >
            {headline}
          </div>
          {message && (
            <div
              className="text-[11px] leading-relaxed"
              style={{ color: "var(--fg-muted)" }}
            >
              {message}
            </div>
          )}

          {/* Action row varies by state */}
          {isVerified && (
            <div className="mt-3">
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] hover:underline"
                style={{ color: "var(--success, #10b981)" }}
              >
                view verified source on Etherscan →
              </a>
            </div>
          )}

          {isFailed && (
            <>
              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={onRetry}
                  className="font-mono text-[10px] px-2 py-1 rounded"
                  style={{
                    background: "var(--bg-subtle)",
                    color: "var(--accent-soft)",
                    border: "1px solid var(--accent-soft)",
                    cursor: "pointer",
                    letterSpacing: "0.05em",
                  }}
                >
                  RETRY VERIFICATION
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await copyToClipboard(message);
                  }}
                  className="font-mono text-[10px] px-2 py-1 rounded"
                  style={{
                    background: "var(--bg-subtle)",
                    color: "var(--fg-dim)",
                    border: "1px solid var(--border)",
                    cursor: "pointer",
                    letterSpacing: "0.05em",
                  }}
                  title="Copy error message"
                >
                  COPY ERROR
                </button>
                <a
                  href={manualVerifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[10px] hover:underline"
                  style={{ color: "var(--fg-dim)" }}
                >
                  or verify manually on Etherscan →
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}