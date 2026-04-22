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

    if (findings.length === 0) {
      findings.push("No major basic red flags detected");
    }

    return NextResponse.json({
      success: true,
      project: contractName,
      contractAddress,
      riskScore: Math.min(riskScore, 10),
      sbseScore: 10,
      findings,
      beginnerExplanation:
        "This audit checks for mint access, blacklist risks, owner privileges, and whether ownership can be renounced — one of the strongest investor safety indicators.",
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json({
      success: false,
      message: "Advanced scan failed",
    });
  }
}