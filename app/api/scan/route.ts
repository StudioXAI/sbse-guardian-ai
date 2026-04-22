import { fetchInfiProjects } from "@/lib/fetchInfiProjects";
import { checkDexPair } from "@/lib/checkDexPair";
import { checkHolderRisk } from "@/lib/checkHolderRisk";
import { fetchTokenIdentity } from "@/lib/fetchTokenIdentity";
import { checkLiquidityLock } from "@/lib/checkLiquidityLock";
import { checkWalletTraps } from "@/lib/checkWalletTraps";
import { detectChain } from "@/lib/detectChain";
import { NextResponse } from "next/server";
import axios from "axios";

import { honeypotCheck } from "@/lib/analyzers/honeypotCheck";
import { ownerCheck } from "@/lib/analyzers/ownerCheck";
import { liquidityCheck } from "@/lib/analyzers/liquidityCheck";
import { calculateRiskScore } from "@/lib/analyzers/riskScore";
import { buildSecurityReport } from "@/lib/analyzers/reportBuilder";
import { predictRugPull } from "@/lib/predictRugPull";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { contractAddress } = body;

    if (!contractAddress) {
      return NextResponse.json({
        success: false,
        message: "No contract address provided",
      });
    }

    /**
     * STEP 0
     * UNIVERSAL CHAIN DETECTION ENGINE
     */

    const detectedChain = await detectChain(contractAddress);

    if (!detectedChain.found) {
      return NextResponse.json({
        success: false,
        message: "Contract not found on supported chains",
      });
    }

    console.log("Detected chain:", detectedChain.chainName);

    /**
     * STEP 1
     * Smart Identity Engine FIRST
     */

    const identity = await fetchTokenIdentity(contractAddress);
    const tokenSymbol = identity.symbol || "";

    /**
     * STEP 2
     * Dynamic INFI Shield Verification
     */

    const infiProjects = await fetchInfiProjects();

    const matchedProject = infiProjects.find((project) => {
      const contractMatch =
        project.contract &&
        project.contract.toLowerCase() ===
          contractAddress.toLowerCase();

      const projectNameMatch =
        tokenSymbol &&
        project.name &&
        project.name
          .toLowerCase()
          .includes(tokenSymbol.toLowerCase());

      return contractMatch || projectNameMatch;
    });

    /**
     * VERIFIED PROJECT
     */

    if (matchedProject) {
      return NextResponse.json({
        success: true,
        isSbSeVerified: true,
        project: matchedProject.name,
        contractAddress,

        chain: detectedChain.chainName,
        chainId: detectedChain.chainId,
        nativeToken: detectedChain.symbol,

        verified: true,
        tokenType: "Protected Launchpad Project",
        riskScore: 1,
        sbseScore: "10+",

        professionalScore: 0,
        professionalLabel: "Institutional Grade",

        rugPullProbability: 0,
        rugPullRisk: "Very Safe",

        findings: [
          "🟢 SbSe Shield Active",
          `Listed on INFI MultiChain CDEX (${matchedProject.status})`,
          "Verified launchpad project",
          "Enhanced investor protection enabled",
          "Protected by SbSe Protocol",
          "AI Rug Pull Prediction: 0% (Very Safe)",
        ],

        beginnerExplanation:
          "This project is verified through the INFI MultiChain CDEX ecosystem and protected by the SbSe Shield system.",
      });
    }

    /**
     * STEP 3
     * Continue deep analysis
     */

    const dexInfo = await checkDexPair(contractAddress);
    const holderRisk = await checkHolderRisk(contractAddress);
    const liquidityLock = await checkLiquidityLock(contractAddress);
    const walletTrap = await checkWalletTraps(contractAddress);

    /**
     * Dynamic explorer API
     */

    const apiKey = process.env.ETHERSCAN_API_KEY;

    const url = `${detectedChain.explorerApi}?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${apiKey}`;

    const response = await axios.get(url);
    const data = response.data?.result?.[0];

    if (!data) {
      return NextResponse.json({
        success: false,
        message: "Contract not found",
      });
    }

    const sourceCode = (data.SourceCode || "").toLowerCase();
    const compilerVersion = data.CompilerVersion || "Unknown";
    const verified = !!data.SourceCode;

    let tokenType = "Unknown";

    if (sourceCode.includes("erc20")) tokenType = "ERC20";
    if (sourceCode.includes("erc721")) tokenType = "ERC721";

    const findings = [];
    let riskScore = 2;

    /**
     * Identity Layer
     */

    findings.push(`Detected Chain: ${detectedChain.chainName}`);
    findings.push(`Native Token: ${detectedChain.symbol}`);
    findings.push(`Token Symbol: ${identity.symbol}`);
    findings.push(`DEX Source: ${identity.dex}`);
    findings.push(`Market Cap: ${identity.marketCap}`);

    if (identity.website) {
      findings.push("Website Found");
    } else {
      findings.push("No Website Detected");
      riskScore += 1;
    }

    /**
     * DEX Layer
     */

    if (dexInfo.found) {
      findings.push(`DEX Pair Found: ${dexInfo.dex}`);
      findings.push(`Liquidity Present: ${dexInfo.liquidity}`);
      findings.push(`24H Volume: ${dexInfo.volume24h}`);
    } else {
      findings.push("No Active DEX Pair Found");
      findings.push("High Rug Pull Probability");
      riskScore += 3;
    }

    /**
     * Holder Layer
     */

    findings.push(
      `Top Holder Controls ${holderRisk.topHolderPercent}%`
    );

    if (holderRisk.risky) {
      findings.push("High Holder Concentration Risk");
      riskScore += 3;
    } else {
      findings.push("Healthy Holder Distribution");
    }

    /**
     * Liquidity Lock Layer
     */

    findings.push(...liquidityLock.findings);

    if (liquidityLock.risky) {
      riskScore += 3;
    }

    /**
     * Wallet Trap Detection
     */

    findings.push(...walletTrap.findings);

    if (walletTrap.risky) {
      findings.push("Suspicious wallet trap behavior detected");
      riskScore += 2;
    }

    /**
     * Manual Smart Contract Checks
     */

    if (sourceCode.includes("mint")) {
      findings.push("Mint function detected");
      riskScore += 2;
    }

    if (sourceCode.includes("blacklist")) {
      findings.push("Blacklist function detected");
      riskScore += 2;
    }

    if (sourceCode.includes("owner")) {
      findings.push("Owner privileges detected");
      riskScore += 1;
    }

    if (
      sourceCode.includes("renounceownership") ||
      sourceCode.includes("ownershiprenounced")
    ) {
      findings.push("Ownership renounce function exists");
    } else {
      findings.push("Ownership renounce not detected");
      riskScore += 2;
    }

    const hasSellRestriction =
      sourceCode.includes("maxwallet") ||
      sourceCode.includes("maxtx") ||
      sourceCode.includes("tradingenabled") ||
      sourceCode.includes("setfee") ||
      sourceCode.includes("selltax") ||
      sourceCode.includes("buytax");

    if (hasSellRestriction) {
      findings.push(
        "Potential honeypot / sell restriction logic detected"
      );
      riskScore += 2;
    }

    if (
      sourceCode.includes("delegatecall") ||
      sourceCode.includes("implementation") ||
      sourceCode.includes("upgrade")
    ) {
      findings.push(
        "Upgradeable proxy / backdoor risk detected"
      );
      riskScore += 2;
    }

    /**
     * Professional Analyzer Engine
     * FIXED FOR VERCEL
     */

    const rpcUrl =
      detectedChain.rpc ||
      process.env.NEXT_PUBLIC_ETH_RPC_URL ||
      "https://eth.llamarpc.com";

    const honeypotResult = await honeypotCheck(
      contractAddress,
      rpcUrl
    );

    const ownerResult = await ownerCheck(
      contractAddress,
      rpcUrl
    );

    const liquidityResult = await liquidityCheck(
      contractAddress,
      rpcUrl
    );

    const professionalScore = calculateRiskScore([
      honeypotResult,
      ownerResult,
      liquidityResult,
    ]);

    const professionalReport =
      buildSecurityReport(professionalScore);

    /**
     * AI Rug Pull Prediction
     */

    const rugPrediction = predictRugPull(
      Math.min(riskScore, 10),
      holderRisk.topHolderPercent,
      liquidityLock.locked,
      sourceCode.includes("owner"),
      hasSellRestriction
    );

    findings.push(
      `Professional Scan Score: ${professionalScore.score}/10`
    );

    findings.push(
      `AI Rug Pull Prediction: ${rugPrediction.rugProbability}% (${rugPrediction.label})`
    );

    /**
     * FINAL RESPONSE
     */

    return NextResponse.json({
      success: true,
      isSbSeVerified: false,

      project: identity.projectName,
      contractAddress,

      chain: detectedChain.chainName,
      chainId: detectedChain.chainId,
      nativeToken: detectedChain.symbol,

      compilerVersion,
      verified,
      tokenType,

      riskScore: Math.min(riskScore, 10),

      professionalScore: professionalScore.score,
      professionalLabel: professionalScore.label,
      professionalReport,

      rugPullProbability: rugPrediction.rugProbability,
      rugPullRisk: rugPrediction.label,

      sbseScore: 10,
      findings,
      website: identity.website,

      beginnerExplanation:
        "This report includes universal multichain detection, SbSe Shield verification, smart token identity detection, DEX verification, holder concentration analysis, liquidity intelligence, liquidity lock verification, wallet trap detection, proxy detection, AI rug pull prediction, and full professional contract analyzer scoring.",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json({
      success: false,
      message: "Intelligence scan failed",
    });
  }
}