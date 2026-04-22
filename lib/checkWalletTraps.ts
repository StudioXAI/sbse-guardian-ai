import axios from "axios";

export async function checkWalletTraps(
  contractAddress: string
) {
  try {
    console.log(
      "Checking wallet trap risks for:",
      contractAddress
    );

    /**
     * Phase 1:
     * Holder concentration intelligence
     * (Later we upgrade to full wallet graph analysis)
     */

    const apiKey = process.env.ETHERSCAN_API_KEY;

    const url = `https://api.etherscan.io/api?module=token&action=tokenholderlist&contractaddress=${contractAddress}&page=1&offset=10&apikey=${apiKey}`;

    const response = await axios.get(url);

    const holders =
      response.data?.result || [];

    let findings: string[] = [];
    let risky = false;

    if (!holders.length) {
      findings.push(
        "Unable to fetch holder wallet intelligence"
      );

      return {
        risky: true,
        findings,
      };
    }

    const topHolder =
      parseFloat(holders[0]?.TokenHolderQuantity || "0");

    if (topHolder > 20) {
      findings.push(
        "Top wallet concentration risk detected"
      );
      risky = true;
    } else {
      findings.push(
        "Healthy wallet distribution detected"
      );
    }

    findings.push(
      `Top wallet concentration: ${topHolder}%`
    );

    return {
      risky,
      findings,
    };
  } catch (error) {
    console.error(
      "Wallet trap detection failed:",
      error
    );

    return {
      risky: true,
      findings: [
        "Wallet trap analysis unavailable",
      ],
    };
  }
}