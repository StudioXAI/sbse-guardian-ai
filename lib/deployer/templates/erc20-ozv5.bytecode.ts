/* ─────────────────────────────────────────────────────────────
   ERC-20 Standard Template — OpenZeppelin v5 base + Ownable

   ╔══════════════════════════════════════════════════════════╗
   ║  CANONICAL SOLIDITY SOURCE — DO NOT EDIT WITHOUT          ║
   ║  RE-COMPILING AND UPDATING BYTECODE                        ║
   ╠══════════════════════════════════════════════════════════╣
   ║                                                            ║
   ║  // SPDX-License-Identifier: MIT                           ║
   ║  pragma solidity ^0.8.20;                                  ║
   ║                                                            ║
   ║  import "@openzeppelin/contracts/token/ERC20/ERC20.sol";   ║
   ║  import "@openzeppelin/contracts/access/Ownable.sol";      ║
   ║                                                            ║
   ║  contract StandardERC20 is ERC20, Ownable {                ║
   ║      constructor(                                          ║
   ║          string memory name_,                              ║
   ║          string memory symbol_,                            ║
   ║          uint8 decimals_,                                  ║
   ║          uint256 initialSupply_                            ║
   ║      ) ERC20(name_, symbol_) Ownable(msg.sender) {         ║
   ║          _decimals = decimals_;                            ║
   ║          _mint(msg.sender, initialSupply_ * 10**decimals_);║
   ║      }                                                     ║
   ║                                                            ║
   ║      uint8 private _decimals;                              ║
   ║                                                            ║
   ║      function decimals() public view virtual override      ║
   ║          returns (uint8) {                                 ║
   ║          return _decimals;                                 ║
   ║      }                                                     ║
   ║  }                                                         ║
   ║                                                            ║
   ║  Compile settings:                                         ║
   ║    solc version: 0.8.20                                    ║
   ║    optimizer: enabled, 200 runs                            ║
   ║    evmVersion: paris                                       ║
   ║    @openzeppelin/contracts: ^5.0.0                         ║
   ║                                                            ║
   ╚══════════════════════════════════════════════════════════╝

   ┌──────────────────────────────────────────────────────────┐
   │  HOW TO POPULATE THE BYTECODE                              │
   ├──────────────────────────────────────────────────────────┤
   │                                                            │
   │  1. Create a temporary Hardhat project anywhere:           │
   │       mkdir tmp-compile && cd tmp-compile                  │
   │       npm init -y                                          │
   │       npm install --save-dev hardhat                       │
   │       npx hardhat init  (pick: empty config)               │
   │       npm install @openzeppelin/contracts@5                │
   │                                                            │
   │  2. Save the Solidity source above as                      │
   │       contracts/StandardERC20.sol                          │
   │                                                            │
   │  3. Update hardhat.config.ts:                              │
   │       solidity: {                                          │
   │         version: "0.8.20",                                 │
   │         settings: {                                        │
   │           optimizer: { enabled: true, runs: 200 },         │
   │           evmVersion: "paris"                              │
   │         }                                                  │
   │       }                                                    │
   │                                                            │
   │  4. Compile:                                               │
   │       npx hardhat compile                                  │
   │                                                            │
   │  5. Open the artifact:                                     │
   │       artifacts/contracts/StandardERC20.sol/               │
   │         StandardERC20.json                                 │
   │                                                            │
   │  6. Copy the value of the "bytecode" field (long hex       │
   │     string starting with 0x) into ERC20_OZv5_BYTECODE      │
   │     below. It must be at least a few hundred bytes; the    │
   │     "0x" placeholder will not deploy.                      │
   │                                                            │
   │  7. Compute the sha256 of the canonical source above and   │
   │     paste into ERC20_OZv5_SOURCE_HASH so we can prove the  │
   │     bytecode came from this exact source.                  │
   │       echo -n "<source string>" | sha256sum                │
   │                                                            │
   │  Until populated, the wizard will refuse to deploy and     │
   │  display a clear "Template bytecode not configured" error. │
   │  This is intentional — better to fail loudly than ship a   │
   │  wizard that deploys nothing.                              │
   │                                                            │
   └──────────────────────────────────────────────────────────┘
   ───────────────────────────────────────────────────────────── */

/**
 * Compiled deployment bytecode for StandardERC20.
 *
 * EMPTY by default. Populate via the steps above before testnet
 * deploys will work. The wizard checks `bytecodeReady` at runtime
 * and refuses to deploy when this is "0x".
 */
export const ERC20_OZv5_BYTECODE: `0x${string}` = "0x";

/**
 * SHA-256 of the canonical Solidity source above. Used to verify
 * the bytecode came from the documented source. Populate after
 * compilation.
 */
export const ERC20_OZv5_SOURCE_HASH: string = "";
