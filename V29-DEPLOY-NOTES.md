# SbSe Guardian — v29 Deploy Wizard (Testnet Preview)

This patch adds the no-code deploy wizard at `/deploy`. v29 is **testnet only** by design — mainnet path with $5 native fee collection ships in v29.5.

## Required npm packages

The wizard introduces three new runtime dependencies. Install them in the repo root before deploying:

```bash
npm install @wagmi/core @wagmi/connectors viem
```

Notes on what each does:

- `@wagmi/core` — provides `deployContract`, `waitForTransactionReceipt`, `getWalletClient`. The non-React companion to wagmi/react which Reown already includes.
- `@wagmi/connectors` — `injected()` and `walletConnect()` connectors used by the deployer's standalone Wagmi config.
- `viem` — the underlying Ethereum client library Wagmi is built on. Already a transitive dependency but pinning it explicitly avoids version drift.

## Required env vars

New for v29:

- `INTERNAL_DEPLOY_SECRET` — long random string (32+ chars). Generate with `openssl rand -hex 32`. Used by the public deployment proxy to authenticate calls to the protected `/api/alpha/internal-deployment` endpoint. Server-only — do NOT prefix with `NEXT_PUBLIC_`.

Already set from earlier patches but still required:

- `NEXT_PUBLIC_REOWN_PROJECT_ID` — for WalletConnect via Reown
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` — for the claim form and listing-intent endpoint
- `RESEND_API_KEY` + `WATCHLIST_FROM_EMAIL` — for sending listing-intent emails to support@infimultichain.com

## Required: compile the ERC-20 template

The wizard ships with placeholder bytecode in `lib/deployer/templates/erc20-ozv5.bytecode.ts`. **Until you populate the actual bytecode, the wizard refuses to deploy** with a clear "Template bytecode missing" error in the security scan step.

To populate:

1. Create a temporary Hardhat project anywhere outside the repo:

   ```bash
   mkdir tmp-compile && cd tmp-compile
   npm init -y
   npm install --save-dev hardhat
   npx hardhat init   # pick: empty config
   npm install @openzeppelin/contracts@5
   ```

2. Save `contracts/StandardERC20.sol`:

   ```solidity
   // SPDX-License-Identifier: MIT
   pragma solidity ^0.8.20;

   import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
   import "@openzeppelin/contracts/access/Ownable.sol";

   contract StandardERC20 is ERC20, Ownable {
       uint8 private _decimals;

       constructor(
           string memory name_,
           string memory symbol_,
           uint8 decimals_,
           uint256 initialSupply_
       ) ERC20(name_, symbol_) Ownable(msg.sender) {
           _decimals = decimals_;
           _mint(msg.sender, initialSupply_ * 10**decimals_);
       }

       function decimals() public view virtual override returns (uint8) {
           return _decimals;
       }
   }
   ```

3. Update `hardhat.config.ts`:

   ```ts
   solidity: {
     version: "0.8.20",
     settings: {
       optimizer: { enabled: true, runs: 200 },
       evmVersion: "paris"
     }
   }
   ```

4. `npx hardhat compile`

5. Copy the `bytecode` field from `artifacts/contracts/StandardERC20.sol/StandardERC20.json` into `ERC20_OZv5_BYTECODE` in `lib/deployer/templates/erc20-ozv5.bytecode.ts`. It will be a long hex string starting with `0x`.

6. Compute the SHA-256 of the canonical Solidity source (the version documented in the comment at the top of the bytecode file) and paste it into `ERC20_OZv5_SOURCE_HASH`. Anywhere SHA-256: `echo -n "<source>" | sha256sum`.

7. Commit both populated values plus the Hardhat artifact directory as proof the bytecode came from the source.

## Testing the wizard end-to-end

1. Deploy v29 to Vercel
2. Visit `/deploy`
3. Pick a chain (start with Sepolia — most reliable testnet faucet)
4. Pick the ERC-20 template (will be disabled if bytecode is not populated)
5. Fill name/symbol/decimals/supply
6. Verify security scan shows all checks passing
7. Fill listing intent (use a real email to test the email delivery)
8. Connect your wallet — make sure it's on Sepolia
9. Get test ETH from https://sepoliafaucet.com if needed
10. Deploy and confirm in your wallet
11. Verify:
    - Contract address appears in Etherscan
    - `support@infimultichain.com` receives `[INFI Listing Intent]` email
    - Contract appears in `/new-projects` feed with INFI Verified badge

## What's NOT in v29

- **Mainnet deployment.** Wizard is testnet-only by design.
- **Native-token fee collection.** Free in v29 since it's testnet preview.
- **InvertX-compatible template.** Deferred to v30 for proper SbSe Shield interface design.
- **ERC-721 / ERC-1155.** Future work.
- **Block explorer source verification.** Adds in v29.5 alongside the mainnet path.
- **On-chain logo metadata.** Captured in listing intent submission for now; on-chain reference field added in v30.

## Honest gotchas

- **Testnet faucets are unreliable.** Sepolia is the most reliable; Polygon Amoy and BSC Testnet have intermittent faucet issues. If a user can't get test tokens for one chain, they can pick a different chain.
- **WalletConnect requires the Reown project ID.** Without `NEXT_PUBLIC_REOWN_PROJECT_ID`, only injected wallets (MetaMask, Rabby, Coinbase extension) work — WalletConnect mobile flow won't be available.
- **The internal-deployment-public proxy verifies contracts exist on mainnet only.** Testnet deploys skip this check during v29. v29.5 will add testnet RPC endpoints to the verification pool.
- **Failed deploys still cost gas.** Standard Web3 UX. The wizard surfaces revert reasons from the receipt where possible.
- **The 500-entry buffer cap on New Projects feed applies to internal deployments too.** If 500+ tokens are deployed via the wizard before older buffer entries age out, oldest internal entries will get evicted. Realistically not an issue at v29 scale.
