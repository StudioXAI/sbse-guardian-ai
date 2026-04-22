import { fetchInfiProjects } from "@/lib/fetchInfiProjects";
import { checkDexPair } from "@/lib/checkDexPair";
import { checkHolderRisk } from "@/lib/checkHolderRisk";
import { fetchTokenIdentity } from "@/lib/fetchTokenIdentity";
import { NextResponse } from "next/server";
import axios from "axios";

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

    // Dynamic INFI Shield Verification
    const infiProjects = await fetchInfiProjects();

    const matchedProject = infiProjects.find(
      (project) =>
        project.contract.toLowerCase() === contractAddress.toLowerCase()
    );

    if (matchedProject) {
      return NextResponse.json({
        success: true,
        project: matchedProject.name,
        contractAddress,
        verified: true,
        tokenType: "Protected Launchpad Project",
        riskScore: 1,
        sbseScore: "10+",
        findings: [
          "🟢 SbSe Shield Active",
          `Listed on INFI MultiChain CDEX (${matchedProject.status})`,
          "Verified launchpad project",
          "Enhanced investor protection enabled",
          "Protected by SbSe Protocol",
        ],
        beginnerExplanation:
          "This project is verified through the INFI MultiChain CDEX ecosystem and protected by the SbSe Shield system.",
      });
    }

    // Smart Identity Engine
    const identity = await fetchTokenIdentity(contractAddress);

    // DEX Detection
    const dexInfo = await checkDexPair(contractAddress);

    // Holder Risk
    const holderRisk = await checkHolderRisk(contractAddress);

    const apiKey = process.env.ETHERSCAN_API_KEY;

    const url = `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${apiKey}`;

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

    // Identity Layer
    findings.push(`Token Symbol: ${identity.symbol}`);
    findings.push(`DEX Source: ${identity.dex}`);
    findings.push(`Market Cap: ${identity.marketCap}`);

    if (identity.website) {
      findings.push(`Website Found`);
    } else {
      findings.push("No Website Detected");
      riskScore += 1;
    }

    // DEX Layer
    if (dexInfo.found) {
      findings.push(`DEX Pair Found: ${dexInfo.dex}`);
      findings.push(`Liquidity Present: ${dexInfo.liquidity}`);
      findings.push(`24H Volume: ${dexInfo.volume24h}`);
    } else {
      findings.push("No Active DEX Pair Found");
      findings.push("High Rug Pull Probability");
      riskScore += 3;
    }

    // Holder Layer
    findings.push(
      `Top Holder Controls ${holderRisk.topHolderPercent}%`
    );

    if (holderRisk.risky) {
      findings.push("High Holder Concentration Risk");
      riskScore += 3;
    } else {
      findings.push("Healthy Holder Distribution");
    }

    // Mint Detection
    if (sourceCode.includes("mint")) {
      findings.push("Mint function detected");
      riskScore += 2;
    }

    // Blacklist Detection
    if (sourceCode.includes("blacklist")) {
      findings.push("Blacklist function detected");
      riskScore += 2;
    }

    // Owner Privileges
    if (sourceCode.includes("owner")) {
      findings.push("Owner privileges detected");
      riskScore += 1;
    }

    // Ownership Renounce
    if (
      sourceCode.includes("renounceownership") ||
      sourceCode.includes("ownershiprenounced")
    ) {
      findings.push("Ownership renounce function exists");
    } else {
      findings.push("Ownership renounce not detected");
      riskScore += 2;
    }

    // Honeypot Detection
    if (
      sourceCode.includes("maxwallet") ||
      sourceCode.includes("maxtx") ||
      sourceCode.includes("tradingenabled") ||
      sourceCode.includes("setfee") ||
      sourceCode.includes("selltax") ||
      sourceCode.includes("buytax")
    ) {
      findings.push("Potential honeypot / sell restriction logic detected");
      riskScore += 2;
    }

    // LP Detection
    if (
      sourceCode.includes("liquidity") ||
      sourceCode.includes("router") ||
      sourceCode.includes("uniswapv2pair") ||
      sourceCode.includes("addliquidity") ||
      sourceCode.includes("removeliquidity") ||
      sourceCode.includes("pair")
    ) {
      findings.push("Liquidity pool interaction detected");

      if (
        sourceCode.includes("removeliquidity") ||
        sourceCode.includes("withdrawliquidity")
      ) {
        findings.push("Liquidity removable by owner — Rug risk increased");
        riskScore += 3;
      } else {
        findings.push("Basic liquidity presence detected");
      }
    } else {
      findings.push("Liquidity lock verification not detected");
      riskScore += 2;
    }

    // Proxy Detection
    if (
      sourceCode.includes("delegatecall") ||
      sourceCode.includes("implementation") ||
      sourceCode.includes("upgrade")
    ) {
      findings.push("Upgradeable proxy / backdoor risk detected");
      riskScore += 2;
    }

    return NextResponse.json({
      success: true,
      project: identity.projectName,
      contractAddress,
      compilerVersion,
      verified,
      tokenType,
      riskScore: Math.min(riskScore, 10),
      sbseScore: 10,
      findings,
      website: identity.website,
      beginnerExplanation:
        "This report now includes smart token identity detection, DEX verification, holder concentration analysis, liquidity intelligence, proxy detection, and dynamic SbSe Shield verification.",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json({
      success: false,
      message: "Intelligence scan failed",
    });
  }
}