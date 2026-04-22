export function predictRugPull(
  riskScore: number,
  holderPercent: number,
  liquidityLocked: boolean,
  ownerPrivileges: boolean,
  honeypotSignals: boolean
) {
  let rugProbability = 10;

  /**
   * Holder concentration
   */
  if (holderPercent > 30) {
    rugProbability += 20;
  }

  /**
   * Liquidity unlocked
   */
  if (!liquidityLocked) {
    rugProbability += 25;
  }

  /**
   * Owner privileges
   */
  if (ownerPrivileges) {
    rugProbability += 15;
  }

  /**
   * Honeypot logic
   */
  if (honeypotSignals) {
    rugProbability += 20;
  }

  /**
   * Existing system score influence
   */
  rugProbability += riskScore * 2;

  rugProbability = Math.min(rugProbability, 100);

  let label = "Low";

  if (rugProbability >= 70) {
    label = "Critical";
  } else if (rugProbability >= 50) {
    label = "High";
  } else if (rugProbability >= 30) {
    label = "Medium";
  }

  return {
    rugProbability,
    label,
  };
}