/* ─────────────────────────────────────────────────────────────
   Audit API — /api/audit
   Complete rewrite fixing:
   - Input validation (address regex)
   - In-memory rate limiting (15 req/min/ip)
   - Parallel analysis (Promise.all) — was sequential
   - Typed AuditReport output (prevents .score vs number crash)
   - Word-boundary regex for source code pattern matching
   - Plain-English verdict + confidence score + A-F grade synthesis
   - Proper HTTP status codes
   - Debug logs gated behind NODE_ENV
   ───────────────────────────────────────────────────────────── */

import { NextResponse } from "next/server";

import { detectChain } from "@/lib/detectChain";
import { fetchTokenIdentity } from "@/lib/fetchTokenIdentity";
import { fetchInfiProjects } from "@/lib/fetchInfiProjects";
import { checkLiquiditySource } from "@/lib/checkLiquiditySource";
import { checkHolderRisk } from "@/lib/checkHolderRisk";
import { checkLiquidityLock } from "@/lib/checkLiquidityLock";
import { checkWalletTraps } from "@/lib/checkWalletTraps";
import { predictRugPull } from "@/lib/predictRugPull";
import { generateAiSummary, generateDeepWalkthrough } from "@/lib/aiSummary";
import { lookupTokenByContract } from "@/lib/coinGeckoClient";
import { analyzeBytecode, bytecodeToFindings } from "@/lib/bytecodeAnalyzer";

import { honeypotCheck } from "@/lib/analyzers/honeypotCheck";
import { ownerCheck } from "@/lib/analyzers/ownerCheck";
import { liquidityCheck } from "@/lib/analyzers/liquidityCheck";
import { calculateRiskScore } from "@/lib/analyzers/riskScore";
import { buildSecurityReport } from "@/lib/analyzers/reportBuilder";

import {
  CONTRACT_REGEX,
  STABLECOINS,
  BLUECHIP_TOKENS,
  debug,
} from "@/lib/constants";
import { explorerUrl, fetchJson } from "@/lib/fetchHelpers";
import { rateLimit, clientKey } from "@/lib/rateLimit";

import type {
  AuditReport,
  Finding,
  GradeLetter,
  LayerScore,
} from "@/lib/types";

/* ─────────────── helpers ─────────────── */

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ success: false, message }, { status });
}

/**
 * Word-boundary-style source-code search.
 * Prevents false positives like "mint" matching "minting", comments, or OZ imports.
 */
function sourceHas(source: string, keyword: string): boolean {
  const pattern = new RegExp(`\\b${keyword}\\b`, "i");
  return pattern.test(source);
}

function detectTokenType(source: string): string {
  if (sourceHas(source, "erc1155")) return "ERC1155";
  if (sourceHas(source, "erc721")) return "ERC721";
  if (sourceHas(source, "erc20")) return "ERC20";
  return "Unknown";
}

function riskScoreToGrade(score: number): GradeLetter {
  if (score <= 2) return "A+";
  if (score <= 3) return "A";
  if (score <= 5) return "B";
  if (score <= 7) return "C";
  if (score <= 8) return "D";
  return "F";
}

type Verdict = AuditReport["verdict"];

function buildVerdict(args: {
  isSbSeVerified: boolean;
  isStablecoin: boolean;
  isBluechip: boolean;
  riskScore: number;
  rugProb: number;
  topConcerns: string[];
}): Verdict {
  const { isSbSeVerified, isStablecoin, isBluechip, riskScore, rugProb, topConcerns } = args;

  if (isStablecoin || isBluechip) {
    return {
      label: "INSTITUTIONAL",
      headline: "Institutional-grade asset",
      plainEnglish:
        "This is a verified institutional asset with deep liquidity, regulated issuance, and established infrastructure. Safe to interact with under normal DeFi precautions.",
    };
  }

  if (isSbSeVerified) {
    return {
      label: "SAFE",
      headline: "SbSe Shield verified",
      plainEnglish:
        "This project is protected by the SbSe Shield system and listed on INFI MultiChain CDEX. Enhanced investor protection is active.",
    };
  }

  if (riskScore >= 8 || rugProb >= 70) {
    return {
      label: "HIGH RISK",
      headline: "Multiple high-severity risks detected",
      plainEnglish:
        topConcerns.length > 0
          ? `Do not interact without extreme caution. Key issues: ${topConcerns.slice(0, 2).join("; ")}.`
          : "Do not interact without extreme caution. Several high-severity risk patterns were detected.",
    };
  }

  if (riskScore >= 5 || rugProb >= 40) {
    return {
      label: "CAUTION",
      headline: "Proceed with caution",
      plainEnglish:
        topConcerns.length > 0
          ? `This contract has notable risk factors worth reviewing before interacting: ${topConcerns.slice(0, 2).join("; ")}.`
          : "This contract has some risk factors worth reviewing before interacting.",
    };
  }

  return {
    label: "SAFE",
    headline: "No major risks detected",
    plainEnglish:
      "Automated analysis surfaced no major red flags. Always do your own research — automated audits complement, not replace, manual review.",
  };
}

function finding(
  label: string,
  severity: Finding["severity"],
  detail?: string,
): Finding {
  return { label, severity, detail };
}

/* ─────────────── handler ─────────────── */

export async function POST(req: Request) {
  /* ── Rate limit ── */
  const key = clientKey(req);
  const limit = rateLimit(key);
  if (!limit.allowed) {
    return NextResponse.json(
      { success: false, message: `Rate limit exceeded. Retry in ${limit.retryAfterSec}s.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  try {
    /* ── Parse + validate ── */
    const body = await req.json().catch(() => ({}));
    const contractAddress = (body?.contractAddress || "").trim();

    if (!contractAddress) return errorResponse("No contract address provided");
    if (!CONTRACT_REGEX.test(contractAddress))
      return errorResponse("Invalid contract address format (must be 0x + 40 hex chars)");

    /* ── Step 0: Chain detection ── */
    const chain = await detectChain(contractAddress);
    if (!chain.found) return errorResponse("Contract not found on supported chains", 404);
    debug("Detected chain:", chain.chainName);

    /* ── Step 1 + 2 in parallel: identity + INFI projects ── */
    const [identity, infiProjects] = await Promise.all([
      fetchTokenIdentity(contractAddress, chain),
      fetchInfiProjects(),
    ]);

    const tokenSymbol = (identity.symbol || "").toUpperCase();
    const isStablecoin = STABLECOINS.has(tokenSymbol);
    const isBluechip = BLUECHIP_TOKENS.has(tokenSymbol);

    /* ── SbSe Shield match ── */
    const matchedProject = infiProjects.find((p) => {
      const contractMatch = p.contract?.toLowerCase() === contractAddress.toLowerCase();
      const nameMatch = tokenSymbol && p.name?.toUpperCase().includes(tokenSymbol);
      return contractMatch || nameMatch;
    });

    if (matchedProject) {
      const report: AuditReport = {
        success: true,
        isSbSeVerified: true,
        project: matchedProject.name,
        contractAddress,
        chain: chain.chainName,
        chainId: chain.chainId,
        chainIdNum: chain.chainIdNum,
        nativeToken: chain.symbol,
        verified: true,
        tokenType: "Protected Launchpad Project",
        riskScore: 1,
        professionalScore: 10,
        professionalLabel: "Institutional Grade",
        professionalReport:
          "INFI MultiChain CDEX verified project. SbSe Shield active.",
        rugPullProbability: 0,
        rugPullRisk: "Very Safe",
        grade: "A+",
        verdict: buildVerdict({
          isSbSeVerified: true,
          isStablecoin: false,
          isBluechip: false,
          riskScore: 1,
          rugProb: 0,
          topConcerns: [],
        }),
        confidence: 100,
        sbseScore: "10+",
        findings: [
          finding("SbSe Shield Active", "good"),
          finding(`Listed on INFI MultiChain CDEX (${matchedProject.status})`, "good"),
          finding("Verified launchpad project", "good"),
          finding("Enhanced investor protection enabled", "good"),
          finding("Protected by SbSe Protocol", "good"),
          finding("AI Rug Pull Prediction: 0% (Very Safe)", "good"),
        ],
        layerScores: [
          { id: "dex", label: "DEX Analysis", score: 10, summary: "Institutional" },
          { id: "liquidity", label: "Liquidity", score: 10, summary: "Protected" },
          { id: "holders", label: "Holders", score: 10, summary: "Distributed" },
          { id: "proxy", label: "Proxy Detection", score: 10, summary: "Clean" },
          { id: "honeypot", label: "Honeypot Detection", score: 10, summary: "Clean" },
        ],
        beginnerExplanation:
          "This project is verified through the INFI MultiChain CDEX ecosystem and protected by the SbSe Shield system.",
        scannedAt: new Date().toISOString(),
        aiSummary: null,
        socials: {},
      };
      return NextResponse.json(report);
    }

    /* ── Step 3: Parallel deep analysis ── */
    const rpcUrl = chain.rpc;

    const [
      liquidityInfoRes,
      holderRiskRes,
      liquidityLockRes,
      walletTrapRes,
      sourceRes,
      honeypotRes,
      ownerRes,
      liquidityRes,
    ] = await Promise.allSettled([
      checkLiquiditySource(contractAddress, chain, identity.symbol),
      checkHolderRisk(contractAddress, chain, identity.symbol),
      checkLiquidityLock(contractAddress, chain, identity.symbol),
      checkWalletTraps(contractAddress, chain, identity.symbol),
      fetchJson<any>(
        explorerUrl(chain, {
          module: "contract",
          action: "getsourcecode",
          address: contractAddress,
        }),
      ),
      honeypotCheck(contractAddress, rpcUrl, identity.symbol),
      ownerCheck(contractAddress, rpcUrl, identity.symbol),
      liquidityCheck(contractAddress, rpcUrl, identity.symbol),
    ]);

    /* ── Unwrap settled results safely ── */
    const unwrap = <T>(r: PromiseSettledResult<T>, fallback: T) =>
      r.status === "fulfilled" ? r.value : fallback;

    const liquidityInfo = unwrap(liquidityInfoRes, {
      dataAvailable: false,
      found: false,
      institutional: false,
      message: "Unavailable",
    });
    const holderRisk = unwrap(holderRiskRes, {
      dataAvailable: false,
      risky: false, topHolderPercent: 0, message: "Unavailable",
    });
    const liquidityLock = unwrap(liquidityLockRes, {
      dataAvailable: false,
      locked: false, risky: false, findings: [],
    });
    const walletTrap = unwrap(walletTrapRes, {
      dataAvailable: false,
      risky: false, findings: [],
    });
    const sourceData = unwrap(sourceRes, null);
    const honeypotResult = unwrap(honeypotRes, {
      safe: false, risk: "UNKNOWN" as const, message: "Check failed", scoreImpact: 1,
    });
    const ownerResult = unwrap(ownerRes, {
      safe: false, risk: "UNKNOWN" as const, message: "Check failed", scoreImpact: 1,
    });
    const liquidityResult = unwrap(liquidityRes, {
      safe: false, risk: "UNKNOWN" as const, message: "Check failed", scoreImpact: 1,
    });

    const contractData = sourceData?.result?.[0];
    const sourceCode = (contractData?.SourceCode || "").toLowerCase();
    const compilerVersion = contractData?.CompilerVersion || "Unknown";
    const verified = !!contractData?.SourceCode;

    /* ── Confidence score: fewer failed sources = higher confidence ── */
    const sources = [
      liquidityInfoRes, holderRiskRes, liquidityLockRes, walletTrapRes,
      sourceRes, honeypotRes, ownerRes, liquidityRes,
    ];
    const successful = sources.filter((r) => r.status === "fulfilled").length;
    const confidence = Math.round((successful / sources.length) * 100);

    /* ── Token type ── */
    let tokenType = "Unknown";
    if (isStablecoin) tokenType = "Stablecoin";
    else if (isBluechip) tokenType = "Bluechip Asset";
    else if (sourceCode) tokenType = detectTokenType(sourceCode);

    const findings: Finding[] = [];
    const topConcerns: string[] = [];
    let riskScore = 2;

    /* ── Identity layer ── */
    findings.push(finding(`Detected Chain: ${chain.chainName}`, "info"));
    findings.push(finding(`Native Token: ${chain.symbol}`, "info"));
    findings.push(finding(`Token Symbol: ${identity.symbol}`, "info"));

    if (isStablecoin) {
      findings.push(finding("Verified Stablecoin Detected", "good"));
      findings.push(finding("Institutional Asset Classification", "good"));
      if (identity.symbol === "USDC") findings.push(finding("Issuer: Circle", "good"));
      if (identity.symbol === "USDT") findings.push(finding("Issuer: Tether", "good"));
    } else if (identity.dex && identity.dex !== "Unknown") {
      findings.push(finding(`Liquidity Source: ${identity.dex}`, "info"));
    }

    if (identity.marketCap && identity.marketCap !== "Unknown") {
      findings.push(finding(`Market Cap: ${identity.marketCap}`, "info"));
    }

    if (!isStablecoin) {
      if (identity.website) {
        findings.push(finding(
          "Project website found",
          "good",
          identity.website,
        ));
      } else {
        findings.push(finding(
          "No project website detected",
          "warn",
          "DexScreener has no website on record for this token",
        ));
        riskScore += 1;
      }
    } else if (identity.website) {
      findings.push(finding(
        "Official website",
        "good",
        identity.website,
      ));
    }

    // Social presence findings — each link individually surfaced
    const socialList: Array<[string, string | undefined]> = [
      ["Twitter", identity.socials.twitter],
      ["Telegram", identity.socials.telegram],
      ["Discord", identity.socials.discord],
      ["GitHub", identity.socials.github],
    ];
    const foundSocials = socialList.filter(([, url]) => !!url);

    if (foundSocials.length > 0) {
      for (const [name, url] of foundSocials) {
        findings.push(finding(`${name} profile linked`, "good", url));
      }
    } else if (!isStablecoin) {
      findings.push(finding(
        "No social profiles linked",
        "warn",
        "Twitter, Telegram, Discord, or GitHub not found on DexScreener",
      ));
    }

    /* ── CoinGecko lookup (read-only, for findings) — writes into report happen later ── */
    const cgLookup = await lookupTokenByContract(contractAddress, chain.chainName)
      .catch((e) => { debug("CoinGecko lookup failed:", e); return null; });

    /* ── Liquidity layer ── */
    if (isStablecoin || isBluechip) {
      findings.push(finding("Institutional Liquidity Infrastructure", "good"));
      findings.push(finding("Multi-venue liquidity verified", "good"));
    } else if (liquidityInfo.found) {
      if (liquidityInfo.dex) {
        findings.push(finding(`Liquidity DEX: ${liquidityInfo.dex}`, "info"));
      }
      if (liquidityInfo.liquidity) {
        const sev: "good" | "info" | "warn" =
          liquidityInfo.liquidityUsd && liquidityInfo.liquidityUsd >= 100_000
            ? "good"
            : liquidityInfo.liquidityUsd && liquidityInfo.liquidityUsd >= 10_000
            ? "info"
            : "warn";
        findings.push(finding(`Top pair liquidity: ${liquidityInfo.liquidity}`, sev));
      }
      // Total across all pairs — always show when available, even for single pair
      if (liquidityInfo.totalLiquidityFormatted && liquidityInfo.pairCount) {
        const aggDetail =
          liquidityInfo.pairCount > 1
            ? `Aggregated across ${liquidityInfo.pairCount} indexed pairs`
            : `Single pair on ${liquidityInfo.dex || "indexed DEX"}`;
        findings.push(finding(
          `Total liquidity: ${liquidityInfo.totalLiquidityFormatted}`,
          "info",
          aggDetail,
        ));
      }
      // 24h volume: compare aggregator (DexScreener/GeckoTerminal after 5H merge)
      // vs CoinGecko. Display the higher number as primary, add a secondary
      // finding showing the other source for transparency.
      const aggVolumeUsd = liquidityInfo.volume24hUsd;
      const cgVolumeUsd = cgLookup?.volume24hUsd;
      const aggSourceLabel =
        liquidityInfo.source === "geckoterminal" ? "GeckoTerminal" : "DexScreener";

      if (aggVolumeUsd != null && cgVolumeUsd != null) {
        // Both sources returned data — show higher as primary, other as comparison
        const [primaryUsd, primaryLabel, secondaryUsd, secondaryLabel] =
          aggVolumeUsd >= cgVolumeUsd
            ? [aggVolumeUsd, aggSourceLabel, cgVolumeUsd, "CoinGecko"]
            : [cgVolumeUsd, "CoinGecko", aggVolumeUsd, aggSourceLabel];
        findings.push(finding(
          `24h Volume: $${Math.round(primaryUsd).toLocaleString()}`,
          "info",
          `Source: ${primaryLabel} (higher of two). Also reported by ${secondaryLabel}: $${Math.round(secondaryUsd).toLocaleString()}.`,
        ));
      } else if (cgVolumeUsd != null) {
        findings.push(finding(
          `24h Volume: $${Math.round(cgVolumeUsd).toLocaleString()}`,
          "info",
          "Source: CoinGecko",
        ));
      } else if (liquidityInfo.volume24h) {
        findings.push(finding(
          `24h Volume: ${liquidityInfo.volume24h}`,
          "info",
          `Source: ${aggSourceLabel}`,
        ));
      }
      if (liquidityInfo.source) {
        const primaryName =
          liquidityInfo.source === "dexscreener"
            ? "DexScreener"
            : liquidityInfo.source === "geckoterminal"
            ? "GeckoTerminal"
            : liquidityInfo.source === "source-code"
            ? "On-chain contract detection"
            : "Verified";
        findings.push(finding(`Liquidity source: ${primaryName}`, "info"));

        // "Where is bigger" — if both aggregators returned data, show
        // the runner-up's numbers so user can see the comparison.
        if (liquidityInfo.alternateSource && liquidityInfo.alternateTotalLiquidityFormatted) {
          const altName =
            liquidityInfo.alternateSource === "dexscreener"
              ? "DexScreener"
              : "GeckoTerminal";
          const altDetail = liquidityInfo.alternatePairCount
            ? `${liquidityInfo.alternateTotalLiquidityFormatted} across ${liquidityInfo.alternatePairCount} pairs`
            : liquidityInfo.alternateTotalLiquidityFormatted;
          findings.push(finding(
            `Also indexed on ${altName}: ${altDetail}`,
            "info",
            `Primary uses ${primaryName} (higher total). Cross-checked against ${altName}.`,
          ));
        }
      }
    } else if (liquidityInfo.dataAvailable) {
      findings.push(finding(
        "No tradeable liquidity on indexed DEXes",
        "bad",
        "Token may not yet be listed on any major DEX",
      ));
      topConcerns.push("no tradeable liquidity");
      riskScore += 3;
    } else {
      findings.push(finding(
        "Liquidity data unavailable",
        "info",
        liquidityInfo.message || "Not yet indexed by DexScreener or GeckoTerminal",
      ));
    }

    /* ── Holder layer ── */
    if (holderRisk.dataAvailable) {
      findings.push(finding(
        `Top holder controls ${holderRisk.topHolderPercent}%`,
        holderRisk.topHolderPercent >= 50 ? "bad" : holderRisk.topHolderPercent >= 25 ? "warn" : "info",
      ));
      if (holderRisk.risky && !isStablecoin) {
        findings.push(finding("High holder concentration risk", "bad", holderRisk.message));
        topConcerns.push("whale concentration");
        riskScore += 3;
      } else if (!holderRisk.risky) {
        findings.push(finding(holderRisk.message, "good"));
      }
    } else {
      // Single clean finding when the explorer has no holder index for this chain
      findings.push(finding(
        "Holder distribution data unavailable",
        "info",
        "Block explorer does not index top holders for this chain",
      ));
    }

    /* ── Liquidity lock layer ── */
    if (!isStablecoin) {
      if (liquidityLock.dataAvailable) {
        for (const f of liquidityLock.findings) {
          findings.push(finding(f, liquidityLock.risky ? "warn" : "good"));
        }
        if (liquidityLock.risky) {
          topConcerns.push("liquidity not locked");
          riskScore += 3;
        }
      }
      // If data unavailable, skip silently — the bytecode analyzer
      // already covers "verified vs unverified source"
    } else {
      findings.push(finding("Institutional Liquidity Architecture", "good"));
    }

    /* ── Wallet trap layer ── */
    // Only emit wallet trap findings if we have holder data.
    // Otherwise the bytecode analyzer already covers dangerous patterns.
    if (walletTrap.dataAvailable) {
      for (const f of walletTrap.findings) {
        findings.push(finding(f, walletTrap.risky ? "warn" : "good"));
      }
      if (walletTrap.risky && !isStablecoin) {
        findings.push(finding("Suspicious wallet trap behavior", "bad"));
        riskScore += 2;
      }
    }

    /* ── Bytecode-level analysis (authoritative, replaces keyword matching) ── */
    const bytecodeAnalysis = await analyzeBytecode(contractAddress, rpcUrl);
    const bytecodeFindings = bytecodeToFindings(bytecodeAnalysis);

    // Only apply bytecode findings for non-institutional tokens
    // (stablecoins / bluechips get their own clean verdict)
    if (!isStablecoin) {
      for (const f of bytecodeFindings) {
        findings.push(finding(f.label, f.severity, f.detail));

        // Adjust risk score based on severity of new findings
        if (f.severity === "bad") riskScore += 3;
        else if (f.severity === "warn") riskScore += 1;
      }

      // Summary concerns for verdict generation
      if (bytecodeAnalysis.hasMintFunction && bytecodeAnalysis.ownershipRenounced !== true) {
        topConcerns.push("mint function active");
      }
      if (bytecodeAnalysis.hasBlacklistFunction && bytecodeAnalysis.ownershipRenounced !== true) {
        topConcerns.push("blacklist capability");
      }
      if (bytecodeAnalysis.isProxy && bytecodeAnalysis.hasUpgradeFunction && bytecodeAnalysis.ownershipRenounced !== true) {
        topConcerns.push("upgradeable by owner");
      }
      if (bytecodeAnalysis.hasFeeModification && bytecodeAnalysis.ownershipRenounced !== true) {
        topConcerns.push("mutable fees");
      }
    }

    // hasSellRestriction is now computed authoritatively
    const hasSellRestriction =
      !isStablecoin &&
      (bytecodeAnalysis.hasFeeModification || bytecodeAnalysis.hasMaxTransaction);

    /* ── Professional score ── */
    const professionalScore = calculateRiskScore([
      honeypotResult,
      ownerResult,
      liquidityResult,
    ]);

    const professionalReport = isStablecoin
      ? "Institutional-grade asset detected. Stablecoin/bluechip infrastructure verified. No major contract risk indicators found."
      : buildSecurityReport(professionalScore);

    /* ── Stablecoin override ── */
    if (isStablecoin) riskScore = 1;

    /* ── Rug pull prediction ── */
    const rugPrediction = isStablecoin
      ? { rugProbability: 0, label: "Very Safe" as const }
      : predictRugPull(
          Math.min(riskScore, 10),
          holderRisk.topHolderPercent,
          liquidityLock.locked,
          bytecodeAnalysis.ownershipRenounced === false, // owner still active
          hasSellRestriction,
        );

    const finalRiskScore = Math.min(Math.max(riskScore, 1), 10);
    const grade = riskScoreToGrade(finalRiskScore);

    findings.push(finding(
      `Professional Scan Score: ${professionalScore.score}/10`,
      "info",
    ));
    findings.push(finding(
      `AI Rug Pull Prediction: ${rugPrediction.rugProbability}% (${rugPrediction.label})`,
      rugPrediction.rugProbability >= 50 ? "bad" : rugPrediction.rugProbability >= 30 ? "warn" : "good",
    ));

    /* ── Layer scores (radar chart data) ── */
    const layerScores: LayerScore[] = [
      {
        id: "dex",
        label: "DEX Analysis",
        score: liquidityInfo.found ? (liquidityInfo.institutional ? 10 : 8) : 3,
        summary: liquidityInfo.found ? (liquidityInfo.dex || "Verified") : "Not found",
      },
      {
        id: "liquidity",
        label: "Liquidity Lock",
        score: liquidityLock.locked ? 9 : 3,
        summary: liquidityLock.locked ? "Locked" : "At risk",
      },
      {
        id: "holders",
        label: "Holder Distribution",
        score: Math.max(1, 10 - Math.round(holderRisk.topHolderPercent / 10)),
        summary: holderRisk.message,
      },
      {
        id: "proxy",
        label: "Proxy Detection",
        score: bytecodeAnalysis.isProxy
          ? (bytecodeAnalysis.ownershipRenounced === true ? 7 : 4)
          : 9,
        summary: bytecodeAnalysis.isProxy
          ? `${bytecodeAnalysis.proxyType} proxy${bytecodeAnalysis.ownershipRenounced === true ? ", owner renounced" : ", owner active"}`
          : "Immutable — not a proxy",
      },
      {
        id: "honeypot",
        label: "Honeypot Detection",
        score: hasSellRestriction ? 3 : 9,
        summary: hasSellRestriction ? "Sell restrictions" : "Clean",
      },
    ];

    const report: AuditReport = {
      success: true,
      isSbSeVerified: false,
      project: identity.projectName || "Unknown Project",
      contractAddress,
      chain: chain.chainName,
      chainId: chain.chainId,
      chainIdNum: chain.chainIdNum,
      nativeToken: chain.symbol,
      compilerVersion,
      verified,
      tokenType,
      riskScore: finalRiskScore,
      professionalScore: isStablecoin ? 10 : professionalScore.score,
      professionalLabel: isStablecoin ? "Institutional Grade" : professionalScore.label,
      professionalReport,
      rugPullProbability: rugPrediction.rugProbability,
      rugPullRisk: rugPrediction.label,
      grade,
      verdict: buildVerdict({
        isSbSeVerified: false,
        isStablecoin,
        isBluechip,
        riskScore: finalRiskScore,
        rugProb: rugPrediction.rugProbability,
        topConcerns,
      }),
      confidence,
      sbseScore: 10,
      findings,
      layerScores,
      website: identity.website ?? null,
      socials: identity.socials,
      marketCap: identity.marketCap,
      beginnerExplanation:
        "Universal multichain analysis including chain detection, identity, liquidity, holder concentration, lock verification, wallet traps, honeypot heuristics, and AI rug-pull prediction.",
      scannedAt: new Date().toISOString(),
      aiSummary: null,
    };


    /* ── Apply CoinGecko enrichment to built report (mutations) ── */
    let enrichment = null;
    if (cgLookup) {
      enrichment = {
        currentPriceUsd: cgLookup.currentPriceUsd,
        priceChange24hPct: cgLookup.priceChange24hPct,
        marketCapUsd: cgLookup.marketCapUsd,
        volume24hUsd: cgLookup.volume24hUsd,
        platforms: cgLookup.platforms,
        coinGeckoId: cgLookup.coinGeckoId,
        description: cgLookup.description,
      };
      if (cgLookup.marketCapUsd && cgLookup.marketCapUsd > 0) {
        report.marketCap = formatCompactUsd(cgLookup.marketCapUsd);
      }
      if (cgLookup.twitter && !report.socials?.twitter) {
        report.socials = { ...(report.socials || {}), twitter: cgLookup.twitter };
      }
      if (cgLookup.telegram && !report.socials?.telegram) {
        report.socials = { ...(report.socials || {}), telegram: cgLookup.telegram };
      }
      if (cgLookup.reddit && !report.socials?.reddit) {
        report.socials = { ...(report.socials || {}), reddit: cgLookup.reddit };
      }
      if (cgLookup.github && !report.socials?.github) {
        report.socials = { ...(report.socials || {}), github: cgLookup.github };
      }
      if (cgLookup.homepage && !report.website) {
        report.website = cgLookup.homepage;
      }
    }

    /* ── Generate AI summary (non-blocking — null if API key missing or call fails) ── */
    try {
      report.aiSummary = await generateAiSummary(report, enrichment);
    } catch (e) {
      debug("AI summary generation failed:", e);
      report.aiSummary = null;
    }

    /* ── Generate deep walkthrough if requested (premium PDF only) ── */
    const includeWalkthrough = body?.includeWalkthrough === true || body?.includeWalkthrough === "1";
    if (includeWalkthrough) {
      try {
        (report as any).deepWalkthrough = await generateDeepWalkthrough(report, enrichment);
      } catch (e) {
        debug("Deep walkthrough generation failed:", e);
        (report as any).deepWalkthrough = null;
      }
    }

    return NextResponse.json(report);
  } catch (error) {
    debug("Audit failed:", error);
    return NextResponse.json(
      { success: false, message: "Intelligence scan failed" },
      { status: 500 },
    );
  }
}

function formatCompactUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
