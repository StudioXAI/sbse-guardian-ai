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

    const sourceCode = data.SourceCode || "";
    const contractName = data.ContractName || "Unknown Project";

    const findings = [];

    if (sourceCode.includes("mint")) {
      findings.push("Mint function detected");
    }

    if (sourceCode.includes("owner")) {
      findings.push("Owner privileges detected");
    }

    if (sourceCode.includes("blacklist")) {
      findings.push("Blacklist function detected");
    }

    if (findings.length === 0) {
      findings.push("No major basic red flags detected");
    }

    return NextResponse.json({
      success: true,
      project: contractName,
      contractAddress,
      riskScore: findings.length + 2,
      sbseScore: 10,
      findings,
      beginnerExplanation:
        "This analysis checks for common rug-pull patterns like mint access, owner privileges, and blacklist functions.",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json({
      success: false,
      message: "Real scan failed",
    });
  }
}