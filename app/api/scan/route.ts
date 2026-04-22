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
    const contractName = data.ContractName || "Unknown Project";

    const findings = [];
    let riskScore = 2;

    // Mint Risk
    if (sourceCode.includes("mint")) {
      findings.push("Mint function detected");
      riskScore += 2;
    }

    // Blacklist Risk
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

    // Honeypot / Sell Trap Detection
    if (
      sourceCode.includes("maxwallet") ||
      sourceCode.includes("maxtx") ||
      sourceCode.includes("tradingenabled") ||
      sourceCode.includes("setfee") ||
      sourceCode.includes("selltax") ||
      sourceCode.includes("buytax") ||
      sourceCode.includes("pause") ||
      sourceCode.includes("transferlimit")
    ) {
      findings.push("Potential honeypot / sell restriction logic detected");
      riskScore += 2;
    }

    // LP / Liquidity Detection
    if (
      sourceCode.includes("liquidity") ||
      sourceCode.includes("addliquidity") ||
      sourceCode.includes("removeliquidity") ||
      sourceCode.includes("uniswapv2pair") ||
      sourceCode.includes("router")
    ) {
      findings.push("Liquidity management logic detected");
    } else {
      findings.push("Liquidity lock verification not detected");
      riskScore += 2;
    }

    return NextResponse.json({
      success: true,
      project: contractName,
      contractAddress,
      riskScore: Math.min(riskScore, 10),
      sbseScore: 10,
      findings,
      beginnerExplanation:
        "This audit checks ownership safety, honeypot risks, and liquidity protection. If liquidity is not locked or removable, rug pull risk becomes significantly higher.",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json({
      success: false,
      message: "Liquidity scan failed",
    });
  }
}