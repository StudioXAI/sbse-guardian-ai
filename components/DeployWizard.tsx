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

   v29 NOTE: testnet only. No fees collected. v29.5 adds mainnet
   path with native-token fee collection.

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
          Deploy Wizard · Testnet (v29 preview)
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
          automated pre-deployment security scan. Currently testnet only —
          mainnet deployment with $5 native-token fee coming in v29.5.
        </p>
      </div>

      {/* Mainnet preview banner */}
      <div
        className="card p-3 text-[11px]"
        style={{
          color: "var(--fg-dim)",
          borderLeft: "2px solid var(--accent-soft)",
        }}
      >
        <span
          className="font-mono uppercase tracking-[0.1em]"
          style={{ color: "var(--accent-soft)" }}
        >
          Preview ·{" "}
        </span>
        Testnet deploys are free except for your own gas. You'll need test
        ETH/BNB/POL — links to faucets are shown when you select a chain.
      </div>

      {/* Step indicator */}
      <StepIndicator step={step} />

      {/* Active step body */}
      {step === "chain" && (
        <ChainStep
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
            const result = runSecurityScan({ template, parameters });
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
      {step === "success" && deployResult && chain && (
        <SuccessStep result={deployResult} chain={chain} onReset={reset} />
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

function ChainStep({ onSelect }: { onSelect: (id: DeployerChainId) => void }) {
  const chains = listDeployerChains();
  return (
    <div className="space-y-3">
      <SectionHeader>Choose a testnet</SectionHeader>
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
                {c.testnetName}
              </span>
            </div>
            <div
              className="text-[11px]"
              style={{ color: "var(--fg-muted)" }}
            >
              Native: {c.nativeSymbol} · ChainID {c.testnetChainId}
            </div>
          </button>
        ))}
      </div>
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
  template,
  parameters,
  intentData,
  onSuccess,
  onBack,
}: {
  chain: (typeof DEPLOYER_CHAINS)[DeployerChainId];
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

  /* Testnet balance state — populated by polling once the user
     is connected and on the right chain. The "ready" flag latches
     true once a non-zero balance is seen and stays true even if
     balance later decreases (e.g. user paid gas), so the green
     "ready to deploy" indicator doesn't flicker. */
  const [balance, setBalance] = useState<bigint | null>(null);
  const [balanceLoaded, setBalanceLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [copyToast, setCopyToast] = useState<string>("");

  const onCorrectChain =
    isConnected && network.chainId === chain.testnetChainId;

  /* Poll testnet balance every 15s while connected on right chain.
     Stops once we see a non-zero balance — no point continuing to
     spend RPC calls if the user already has funds. */
  useEffect(() => {
    if (!isConnected || !address || !onCorrectChain || ready) return;

    let cancelled = false;
    async function pollBalance() {
      const bal = await fetchTestnetBalance(chain, address!);
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
  }, [isConnected, address, onCorrectChain, ready, chain]);

  /* Auto-dismiss the copy toast after 2.5 seconds. */
  useEffect(() => {
    if (!copyToast) return;
    const timer = setTimeout(() => setCopyToast(""), 2500);
    return () => clearTimeout(timer);
  }, [copyToast]);

  async function handleGetTestTokens() {
    if (!address) return;
    /* Order matters: copy address first so the await resolves
       within the user-initiated event handler (clipboard APIs
       require this on most browsers). Then open faucet in a new
       tab. */
    const copied = await copyToClipboard(address);
    setCopyToast(
      copied
        ? `Address copied — paste it in the faucet`
        : `Couldn't auto-copy — your address: ${address.slice(0, 10)}…${address.slice(-4)}`,
    );
    /* Open in a new tab. Some popup blockers may prevent this
       if the click handler became "non-trusted" after the await,
       but in practice modern browsers allow it because clipboard
       writes don't break the trust chain. */
    window.open(chain.testnetFaucetUrl, "_blank", "noopener,noreferrer");
  }

  async function handleDeploy() {
    setError("");
    setDeploying(true);
    try {
      /* Deploy logic lives in a separate helper for testability.
         The actual viem deploy call is wired there. */
      const { executeDeploy } = await import("@/lib/deployer/executeDeploy");
      const result = await executeDeploy({
        chain,
        template,
        parameters,
        deployerAddress: address!,
      });

      /* Fire-and-forget: tell the New Projects feed about this
         deployment so it shows up instantly with the verified badge.
         Failure here doesn't fail the deploy — the contract is live
         on chain regardless. The endpoint verifies the contract
         exists on-chain before accepting (no shared secret needed). */
      try {
        await fetch("/api/alpha/register-deployment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contractAddress: result.contractAddress,
            chain: chain.id,
            blockNumber: result.blockNumber,
            txHash: result.txHash,
            deployer: address,
            symbol: parameters.symbol,
            name: parameters.name,
            decimals: parameters.decimals,
            isTestnet: true,
            socials: {
              website: intentData.website || undefined,
              twitter: intentData.twitter || undefined,
              telegram: intentData.telegram || undefined,
            },
          }),
        });
      } catch {
        /* Non-fatal */
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
        chainId: chain.testnetChainId,
        testnetExplorer: chain.testnetExplorer,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader>Deploy {String(parameters.symbol)}</SectionHeader>

      {/* Summary */}
      <div className="card p-4 space-y-2">
        <div className="flex justify-between text-[12px]">
          <span style={{ color: "var(--fg-dim)" }}>Chain</span>
          <span style={{ color: "var(--fg)" }}>
            {chain.name} ({chain.testnetName})
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
                {chain.testnetName}
              </strong>{" "}
              (chainId {chain.testnetChainId}) to deploy.
            </p>
          </div>
          <button
            type="button"
            onClick={() => network.switchNetwork({ id: chain.testnetChainId } as never)}
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
            disabled={deploying}
            className="w-full font-mono text-[11px] py-3 rounded transition-colors"
            style={{
              background: deploying
                ? "var(--bg-subtle)"
                : "linear-gradient(135deg, var(--accent), var(--accent-soft))",
              color: deploying ? "var(--fg-dim)" : "#fff",
              border: "none",
              cursor: deploying ? "wait" : "pointer",
              letterSpacing: "0.05em",
            }}
          >
            {deploying
              ? "DEPLOYING — DO NOT CLOSE THIS TAB…"
              : `DEPLOY TO ${chain.testnetName.toUpperCase()}`}
          </button>

          {/* Testnet tokens panel — shows current balance and a
              one-click button to claim test tokens from the faucet
              with the user's address pre-copied to clipboard. */}
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
                  {ready ? "✓ Ready to deploy" : "Testnet balance"}
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
              {!ready && (
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
            {!ready && (
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
          </div>

          {/* Copy toast — shows briefly when address is copied */}
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
   ───────────────────────────────────────────────────────────── */

function SuccessStep({
  result,
  chain,
  onReset,
}: {
  result: DeploymentResult;
  chain: (typeof DEPLOYER_CHAINS)[DeployerChainId];
  onReset: () => void;
}) {
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
          Your contract is live on {chain.testnetName} and has been
          listed on the SbSe Guardian New Projects feed with the INFI
          verified badge.
        </p>
      </div>

      <div className="card p-4 space-y-3 text-[12px]">
        <div className="flex justify-between gap-2">
          <span style={{ color: "var(--fg-dim)" }}>Contract</span>
          <a
            href={`${chain.testnetExplorer}/address/${result.contractAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:underline truncate"
            style={{ color: "var(--info)" }}
          >
            {result.contractAddress}
          </a>
        </div>
        <div className="flex justify-between gap-2">
          <span style={{ color: "var(--fg-dim)" }}>Tx</span>
          <a
            href={`${chain.testnetExplorer}/tx/${result.txHash}`}
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
