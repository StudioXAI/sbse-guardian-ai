/* ─────────────────────────────────────────────────────────────
   Deployment Templates Registry

   Defines the smart contract templates available in the deploy
   wizard. Each template has:
   - A unique id used by the wizard UI
   - A display name and description
   - A list of constructor parameters
   - Reference to the compiled bytecode (in a sibling file)

   The bytecode itself is intentionally kept in a separate file
   that gets populated via a Hardhat compile step. This module
   declares the interface; bytecode lives in the .bytecode.ts
   files alongside the Solidity source for reviewability.

   PRODUCTION DEPLOY CHECKLIST (do once before testnet/mainnet):

     1. cd into the hardhat-templates directory
     2. npm install
     3. npx hardhat compile
     4. Copy the bytecode from artifacts/contracts/StandardERC20.sol/StandardERC20.json
        into lib/deployer/templates/erc20-ozv5.bytecode.ts
     5. Verify the bytecode matches by running:
          npx hardhat run scripts/print-bytecode.ts
     6. Commit the bytecode file with the compile artifacts as
        proof the bytecode came from the source

   Until step 4 is done, the wizard will show a clear error
   instead of attempting a deploy with placeholder bytecode.
   ───────────────────────────────────────────────────────────── */

import {
  ERC20_OZv5_BYTECODE,
  ERC20_OZv5_SOURCE_HASH,
} from "./templates/erc20-ozv5.bytecode";
import {
  ERC20_OZv5_META_BYTECODE,
  ERC20_OZv5_META_SOURCE_HASH,
} from "./templates/erc20-ozv5-meta.bytecode";

export type TemplateId = "erc20-ozv5" | "erc20-ozv5-meta";

export interface TemplateParameter {
  /** Internal field name (also the Solidity constructor arg name). */
  name: string;
  /** UI label shown to the user. */
  label: string;
  /** Solidity type — drives input validation and ABI encoding. */
  solidityType: "string" | "uint256" | "uint8" | "address";
  /** Help text shown under the input. */
  helpText?: string;
  /** Optional placeholder shown in the input. */
  placeholder?: string;
  /** Optional default value. */
  defaultValue?: string | number;
  /** Min/max for numeric types. */
  min?: number;
  max?: number;
  /** Max length for strings. */
  maxLength?: number;
}

export interface TokenTemplate {
  id: TemplateId;
  name: string;
  description: string;
  /** Solidity compiler version the bytecode was built with. */
  solcVersion: string;
  /** Whether the bytecode is currently populated. If false, the
      wizard shows a "compile required" error and refuses to deploy. */
  bytecodeReady: boolean;
  /** Parameters passed to the constructor, in order. */
  parameters: TemplateParameter[];
  /** Hex bytecode (0x-prefixed) — empty when bytecodeReady is false. */
  bytecode: `0x${string}`;
  /** SHA-256 of the canonical source code. Lets us prove the bytecode
      matches the source we documented. */
  sourceHash: string;
}

/* ═══════════════════════════════════════════════════════════ */
/* Template registry                                            */
/* ═══════════════════════════════════════════════════════════ */

export const TEMPLATES: Record<TemplateId, TokenTemplate> = {
  "erc20-ozv5": {
    id: "erc20-ozv5",
    name: "Standard ERC-20",
    description:
      "OpenZeppelin v5 ERC-20 with Ownable. Mint full supply to the deployer at construction. No taxes, no blacklist, no pause — clean and standard.",
    solcVersion: "0.8.20",
    bytecodeReady: ERC20_OZv5_BYTECODE.length > 4, // "0x" + something
    bytecode: ERC20_OZv5_BYTECODE,
    sourceHash: ERC20_OZv5_SOURCE_HASH,
    parameters: [
      {
        name: "name",
        label: "Token Name",
        solidityType: "string",
        helpText: "Full name of your token (e.g. \"Example Token\")",
        placeholder: "Example Token",
        maxLength: 64,
      },
      {
        name: "symbol",
        label: "Symbol",
        solidityType: "string",
        helpText: "Ticker symbol, 2–8 characters (e.g. \"EXMPL\")",
        placeholder: "EXMPL",
        maxLength: 8,
      },
      {
        name: "decimals",
        label: "Decimals",
        solidityType: "uint8",
        helpText: "Most tokens use 18. USDT/USDC use 6. Don't change unless you know why.",
        defaultValue: 18,
        min: 0,
        max: 30,
      },
      {
        name: "initialSupply",
        label: "Initial Supply",
        solidityType: "uint256",
        helpText:
          "Total tokens minted to your wallet at deployment. Decimals are applied automatically.",
        placeholder: "1000000",
        defaultValue: 1000000,
        min: 1,
      },
    ],
  },
  "erc20-ozv5-meta": {
    id: "erc20-ozv5-meta",
    name: "Standard ERC-20 + On-Chain Logo",
    description:
      "OpenZeppelin v5 ERC-20 with Ownable, plus a `logoURI` view function exposing your project logo to block explorers and aggregators (CoinGecko, DEX Screener). Logo URL is set at deploy and cannot be changed afterwards.",
    solcVersion: "0.8.20",
    bytecodeReady: ERC20_OZv5_META_BYTECODE.length > 4,
    bytecode: ERC20_OZv5_META_BYTECODE,
    sourceHash: ERC20_OZv5_META_SOURCE_HASH,
    parameters: [
      {
        name: "name",
        label: "Token Name",
        solidityType: "string",
        helpText: "Full name of your token (e.g. \"Example Token\")",
        placeholder: "Example Token",
        maxLength: 64,
      },
      {
        name: "symbol",
        label: "Symbol",
        solidityType: "string",
        helpText: "Ticker symbol, 2–8 characters (e.g. \"EXMPL\")",
        placeholder: "EXMPL",
        maxLength: 8,
      },
      {
        name: "decimals",
        label: "Decimals",
        solidityType: "uint8",
        helpText: "Most tokens use 18. USDT/USDC use 6. Don't change unless you know why.",
        defaultValue: 18,
        min: 0,
        max: 30,
      },
      {
        name: "initialSupply",
        label: "Initial Supply",
        solidityType: "uint256",
        helpText:
          "Total tokens minted to your wallet at deployment. Decimals are applied automatically.",
        placeholder: "1000000",
        defaultValue: 1000000,
        min: 1,
      },
      {
        name: "logoURI",
        label: "Logo URL",
        solidityType: "string",
        helpText:
          "HTTPS URL to your token logo (PNG/JPG/SVG). Aggregators read this from the contract automatically. Cannot be changed after deploy.",
        placeholder: "https://yourproject.com/logo.png",
        maxLength: 256,
      },
    ],
  },
};

export function getTemplate(id: TemplateId): TokenTemplate {
  return TEMPLATES[id];
}

export function listTemplates(): TokenTemplate[] {
  return Object.values(TEMPLATES);
}
