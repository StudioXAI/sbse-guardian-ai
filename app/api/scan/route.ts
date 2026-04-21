import { NextResponse } from "next/server";

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

    // Temporary demo response (real scanner comes next)
    return NextResponse.json({
      success: true,
      project: "Sample Token",
      contractAddress,
      riskScore: 4,
      sbseScore: 10,
      findings: [
        "Ownership is not renounced",
        "Liquidity lock not detected",
        "Mint function found",
        "No blacklist function detected",
      ],
      beginnerExplanation:
        "This contract shows moderate risk. Owner privileges still exist and liquidity is not clearly locked.",
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      message: "Scan failed",
    });
  }
}