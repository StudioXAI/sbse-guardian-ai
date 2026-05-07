/* ─────────────────────────────────────────────────────────────
   verifyContract — Etherscan V2 unified source verification

   Flow:
   1. Submit source code via /v2/api?module=contract&action=verifysourcecode
      with chainid parameter for the deploy chain
   2. Etherscan returns a GUID
   3. Poll /v2/api?module=contract&action=checkverifystatus with the GUID
      every 5 seconds until verified or failed
   4. Total wait typically 30-90 seconds for Etherscan to recompile and
      compare bytecode

   API documented at https://docs.etherscan.io/v2-migration

   IMPORTANT: this module runs SERVER-SIDE only (Node runtime). The
   Etherscan API key never reaches the browser. The wizard's success
   page calls /api/alpha/verify-contract which calls this module.
   ───────────────────────────────────────────────────────────── */

import {
  buildStandardJsonInput,
  COMPILER_VERSION,
  CONTRACT_NAME,
} from "./templates/erc20-ozv5.sources";

const ETHERSCAN_V2_BASE = "https://api.etherscan.io/v2/api";

/* Polling cadence — Etherscan typically takes 20-60 seconds to
   recompile and compare bytecode. We poll every 5 seconds with a
   90-second hard timeout. */
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 90_000;

/* ═══════════════════════════════════════════════════════════ */
/* Public types                                                 */
/* ═══════════════════════════════════════════════════════════ */

export type VerificationStatus =
  | "pending"
  | "submitted"
  | "verifying"
  | "verified"
  | "failed";

export interface VerifyInput {
  /** Chain ID where the contract was deployed. */
  chainId: number;
  /** Deployed contract address. */
  contractAddress: string;
  /** ABI-encoded constructor arguments (without 0x prefix), or "" if no args. */
  constructorArguments: string;
}

export interface VerifyResult {
  status: VerificationStatus;
  /** Etherscan GUID — used to check status later. Set on submitted/verifying/verified/failed. */
  guid?: string;
  /** Human-readable message — shown in the wizard. */
  message: string;
  /** Block explorer URL for the verified contract page. Set on verified. */
  explorerUrl?: string;
}

/* ═══════════════════════════════════════════════════════════ */
/* Etherscan response shapes                                    */
/* ═══════════════════════════════════════════════════════════ */

interface EtherscanSubmitResponse {
  status: string; // "1" = success, "0" = error
  message: string;
  result: string; // GUID on success, error message on failure
}

interface EtherscanStatusResponse {
  status: string;
  message: string;
  result: string; // "Pass - Verified", "Pending in queue", "Fail - Unable to verify", etc.
}

/* ═══════════════════════════════════════════════════════════ */
/* Submit source for verification                              */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Submit the contract source to Etherscan V2 for verification.
 * Returns a GUID that can be used to check status later.
 *
 * The API key is read from process.env.ETHERSCAN_API_KEY. If unset,
 * verification is unavailable.
 */
export async function submitVerification(
  input: VerifyInput,
): Promise<VerifyResult> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    return {
      status: "failed",
      message:
        "Source verification not configured. Set ETHERSCAN_API_KEY in environment.",
    };
  }

  /* Build the JSON Standard Input that includes all source files
     and compile settings. This must exactly match what Hardhat used
     at compile time, otherwise the verifier will recompile and get
     different bytecode. */
  const standardJson = buildStandardJsonInput();

  /* Etherscan V2 verifysourcecode is a POST with form-encoded body.
     The 'codeformat' must be 'solidity-standard-json-input' for the
     JSON Standard Input flow we're using. */
  const formData = new URLSearchParams({
    chainid: String(input.chainId),
    apikey: apiKey,
    module: "contract",
    action: "verifysourcecode",
    contractaddress: input.contractAddress,
    sourceCode: standardJson,
    codeformat: "solidity-standard-json-input",
    contractname: CONTRACT_NAME,
    compilerversion: COMPILER_VERSION,
    constructorArguements: input.constructorArguments, // Etherscan typo, intentional
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);

  try {
    const res = await fetch(ETHERSCAN_V2_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        status: "failed",
        message: `Etherscan API returned HTTP ${res.status}. Try again in a moment.`,
      };
    }

    const json = (await res.json()) as EtherscanSubmitResponse;

    /* Etherscan returns status="1" on success with the GUID in result.
       Various error states return status="0" with the error in result.
       Common errors: "Already Verified", "Bytecode does not match",
       "Source code already exists in queue". */
    if (json.status === "1") {
      return {
        status: "submitted",
        guid: json.result,
        message: "Submitted to Etherscan for verification. Polling for result…",
      };
    }

    /* "Already Verified" is actually a success case — Etherscan rejects
       re-submission but the contract IS verified. Treat it as success. */
    if (json.result.toLowerCase().includes("already verified")) {
      return {
        status: "verified",
        message: "Contract is already verified on Etherscan.",
      };
    }

    return {
      status: "failed",
      message: `Etherscan rejected the submission: ${json.result}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: "failed",
      message: `Verification submit failed: ${msg}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ═══════════════════════════════════════════════════════════ */
/* Check verification status                                    */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Check the status of a previously-submitted verification.
 * Used by the polling loop and by manual retry.
 */
export async function checkVerificationStatus(
  chainId: number,
  guid: string,
): Promise<VerifyResult> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    return {
      status: "failed",
      message: "ETHERSCAN_API_KEY not configured.",
    };
  }

  const url = new URL(ETHERSCAN_V2_BASE);
  url.searchParams.set("chainid", String(chainId));
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "checkverifystatus");
  url.searchParams.set("guid", guid);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) {
      return {
        status: "verifying",
        guid,
        message: `Etherscan status check returned HTTP ${res.status}. Will retry.`,
      };
    }

    const json = (await res.json()) as EtherscanStatusResponse;
    const result = (json.result ?? "").toLowerCase();

    /* Known status strings from Etherscan:
       - "Pass - Verified" → verified
       - "Pending in queue" → still verifying
       - "Already Verified" → verified
       - "Fail - Unable to verify" → failed
       - Anything else with status 0 → failed */

    if (result.includes("pass") || result.includes("already verified")) {
      return {
        status: "verified",
        guid,
        message: "Source code verified on Etherscan.",
      };
    }

    if (result.includes("pending") || result.includes("in queue")) {
      return {
        status: "verifying",
        guid,
        message: "Etherscan is still processing. Please wait…",
      };
    }

    if (result.includes("fail") || json.status === "0") {
      return {
        status: "failed",
        guid,
        message: `Verification failed: ${json.result}`,
      };
    }

    /* Unknown response — assume still verifying. */
    return {
      status: "verifying",
      guid,
      message: `Etherscan status: ${json.result}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      status: "verifying",
      guid,
      message: `Status check failed: ${msg}. Will retry.`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/* ═══════════════════════════════════════════════════════════ */
/* Full submit + poll convenience                               */
/* ═══════════════════════════════════════════════════════════ */

/**
 * Submit then poll until verified, failed, or timeout. Used by the
 * server-side auto-verification trigger.
 *
 * NOTE: this can take up to 90 seconds. Callers should run this in
 * a background task or accept that the request will block.
 */
export async function submitAndPoll(input: VerifyInput): Promise<VerifyResult> {
  const submitResult = await submitVerification(input);
  if (submitResult.status === "verified") return submitResult;
  if (submitResult.status === "failed" || !submitResult.guid) {
    return submitResult;
  }

  const guid = submitResult.guid;
  const startedAt = Date.now();

  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    /* Wait before each poll (including the first — gives Etherscan
       time to start processing before we hit it with a status check). */
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const statusResult = await checkVerificationStatus(input.chainId, guid);
    if (statusResult.status === "verified" || statusResult.status === "failed") {
      return statusResult;
    }
    /* Still verifying — keep polling until timeout. */
  }

  /* Timed out — still pending. Caller can re-poll later. */
  return {
    status: "verifying",
    guid,
    message:
      "Verification still in progress after 90 seconds. Etherscan is sometimes slow during peak times — try the manual status check in a few minutes.",
  };
}
