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
    const compilerVersion = data.CompilerVersion || "Unknown";
    const verified = data.SourceCode ? true : false;

    let tokenType = "Unknown";

    if (sourceCode.includes("erc20")) {
      tokenType = "ERC20";
    }

    if (sourceCode.includes("erc721")) {
      tokenType = "ERC721";
    }

    const findings = [];
    let riskScore = 2;

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

    if (
      sourceCode.includes("liquidity") ||
      sourceCode.includes("router") ||
      sourceCode.includes("uniswapv2pair")
    ) {
      findings.push("Liquidity management logic detected");
    } else {
      findings.push("Liquidity lock verification not detected");
      riskScore += 2;
    }

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
      project: contractName,
      contractAddress,
      compilerVersion,
      verified,
      tokenType,
      riskScore: Math.min(riskScore, 10),
      sbseScore: 10,
      findings,
      beginnerExplanation:
        "This report now includes identity detection, verification status, token type, and major rug-pull patterns including proxy risks and liquidity safety.",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json({
      success: false,
      message: "Intelligence scan failed",
    });
  }
}