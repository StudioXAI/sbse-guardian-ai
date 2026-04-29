/* ─────────────────────────────────────────────────────────────
   Wallet Label Database
   Maps known addresses → human-readable labels and a category.
   Used by the token whale tracker for buy/sell classification
   and UI display.

   Categories:
   - "cex"   = centralized exchange hot/cold wallet
   - "dex"   = DEX router (Uniswap V2/V3, PancakeSwap, etc.)
   - "whale" = known individual or institutional whale
   - "team"  = project treasury / multisig / team wallet
   ───────────────────────────────────────────────────────────── */

export type WalletCategory = "cex" | "dex" | "whale" | "team";

export interface WalletLabel {
  label: string;
  category: WalletCategory;
}

/* Lookup keys are LOWERCASE addresses with `chainId:` prefix so we can
   reuse the same router address across chains with different intents.
   Example key: "1:0x7a250d5630b4cf539739df2c5dacb4c659f2488d" (Uniswap V2 on Ethereum) */

const LABELS: Record<string, WalletLabel> = {};

function add(chainId: number, addr: string, label: string, category: WalletCategory) {
  LABELS[`${chainId}:${addr.toLowerCase()}`] = { label, category };
}

/* ═══ CEX hot wallets ═══ */
/* Ethereum */
add(1, "0x28C6c06298d514Db089934071355E5743bf21d60", "Binance hot", "cex");
add(1, "0x21a31Ee1afC51d94C2eFcCAa2092aD1028285549", "Binance cold", "cex");
add(1, "0xDFd5293D8e347dFe59E90eFd55b2956a1343963d", "Binance 16", "cex");
add(1, "0x56Eddb7aa87536c09CCc2793473599fD21A8b17F", "Binance 17", "cex");
add(1, "0x9696f59E4d72E237BE84fFD425DCaD154Bf96976", "Binance 18", "cex");
add(1, "0x4976A4A02f38326660D17bf34b431dC6e2eb2327", "Binance 19", "cex");
add(1, "0x71660c4005ba85c37ccec55d0c4493e66fe775d3", "Coinbase 1", "cex");
add(1, "0xA9D1e08C7793af67e9d92fe308d5697FB81d3E43", "Coinbase 10", "cex");
add(1, "0x503828976D22510aad0201ac7EC88293211D23Da", "Coinbase 2", "cex");
add(1, "0xddfAbCdc4D8FfC6d5beaf154f18B778f892A0740", "Coinbase 3", "cex");
add(1, "0x3cD751E6b0078Be393132286c442345e5DC49699", "Coinbase 4", "cex");
add(1, "0x2910543af39aba0cd09dbb2d50200b3e800a63d2", "Kraken 1", "cex");
add(1, "0x0A869d79a7052C7f1b55a8EbAbbEa3420F0D1E13", "Kraken 2", "cex");
add(1, "0xE853c56864A2ebe4576a807D26Fdc4A0adA51919", "Kraken 3", "cex");
add(1, "0x77696bb39917C91A0c3908D577d5e322095425cA", "Bitfinex", "cex");
add(1, "0x6262998Ced04146fA42253a5C0AF90CA02dfd2A3", "Crypto.com", "cex");
add(1, "0xF89d7b9c864f589bbF53a82105107622B35EaA40", "Bybit", "cex");
add(1, "0x5041ed759Dd4aFc3a72b8192C143F72f4724081A", "OKX", "cex");
add(1, "0x32Be343B94f860124dC4fEe278FDCBD38C102D88", "Poloniex", "cex");
add(1, "0x6cC5F688a315f3dC28A7781717a9A798a59fDA7b", "OKEx", "cex");
add(1, "0xa910f92AcdAf488fa6eF02174fb86208Ad7722ba", "OKEx 2", "cex");
add(1, "0x267be1C1D684F78cb4F6a176C4911b741E4Ffdc0", "Kraken 4", "cex");

/* BSC */
add(56, "0x8894E0a0c962CB723c1976a4421c95949bE2D4E3", "Binance BSC 6", "cex");
add(56, "0xF977814e90dA44bFA03b6295A0616a897441aceC", "Binance BSC 8", "cex");
add(56, "0x3C783c21a0383057D128bae431894a5C19F9Cf06", "Binance BSC 7", "cex");
add(56, "0xe2fc31F816A9b94326492132018C3aEcC4a93aE1", "Binance BSC 9", "cex");
add(56, "0xeB2D2F1b8c558a40207669291Fda468E50c8A0bB", "Binance BSC 13", "cex");
add(56, "0xbd612a3f30dca67bf60a39fd0d35e39b7ab80774", "OKX BSC", "cex");

/* Polygon */
add(137, "0x290275e3db66394C52272398959845170E4DCb88", "Binance Polygon", "cex");
add(137, "0xe7804c37c13166fF0b37F5aE0BB07A3aEbb6e245", "Binance Polygon 2", "cex");

/* Arbitrum */
add(42161, "0xB38e8c17e38363aF6EbdCb3dAE12e0243582891D", "Binance Arb", "cex");
add(42161, "0xCC73e16efb9f455B98EBE7A88B2A427811BfB4a8", "Binance Arb 2", "cex");

/* Optimism */
add(10, "0xacD03D601e5bB1B275Bb94076fF46ED9D753435A", "Binance OP", "cex");

/* Base */
add(8453, "0x3304E22DDaa22bCdC5fCa2269b418046aE7b566A", "Binance Base", "cex");

/* ═══ DEX routers ═══ */
/* Ethereum */
add(1, "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", "Uniswap V2", "dex");
add(1, "0xE592427A0AEce92De3Edee1F18E0157C05861564", "Uniswap V3", "dex");
add(1, "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45", "Uniswap V3 Router 2", "dex");
add(1, "0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD", "Uniswap Universal", "dex");
add(1, "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F", "SushiSwap", "dex");
add(1, "0x1111111254EEB25477B68fb85Ed929f73A960582", "1inch V5", "dex");
add(1, "0xDef1C0ded9bec7F1a1670819833240f027b25EfF", "0x Protocol", "dex");

/* BSC */
add(56, "0x10ED43C718714eb63d5aA57B78B54704E256024E", "PancakeSwap V2", "dex");
add(56, "0x13f4EA83D0bd40E75C8222255bc855a974568Dd4", "PancakeSwap V3", "dex");
add(56, "0x1b81D678ffb9C0263b24A97847620C99d213eB14", "PancakeSwap Smart", "dex");

/* Polygon */
add(137, "0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff", "QuickSwap", "dex");
add(137, "0xE592427A0AEce92De3Edee1F18E0157C05861564", "Uniswap V3 Polygon", "dex");

/* Arbitrum */
add(42161, "0xE592427A0AEce92De3Edee1F18E0157C05861564", "Uniswap V3 Arb", "dex");
add(42161, "0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506", "SushiSwap Arb", "dex");

/* Optimism */
add(10, "0xE592427A0AEce92De3Edee1F18E0157C05861564", "Uniswap V3 OP", "dex");

/* Base */
add(8453, "0x2626664c2603336E57B271c5C0b26F421741e481", "Uniswap V3 Base", "dex");
add(8453, "0xfDe4C96c8593536E31F229EA8f37b2ADa2699bb2", "Aerodrome", "dex");

/* ═══ Known whales ═══ */
add(1, "0xab5801a7d398351b8be11c439e05c5b3259aec9b", "Vitalik 1", "whale");
add(1, "0x220866b1a2219f40e72f5c628b65d54268ca3a9d", "Vitalik 2", "whale");
add(1, "0x4d9C61F4F5b3aDcC36CC9e6e89B43d83336F7Df8", "Vitalik 3", "whale");
add(1, "0x267be1C1D684F78cb4F6a176C4911b741E4Ffdc0", "CZ wallet", "whale");
add(1, "0x49628591A0e3398a30Ba37FA0d7CDC04eFa1C4C3", "justin.eth", "whale");
add(1, "0x6E6e3F46f6FF5cb2a82B82BFf80F1f0c69103E7E", "Whale 0x6E6E", "whale");
add(1, "0x73AF3bcf944a6559933396c1577B257e2054D935", "Genesis Trading", "team");
add(1, "0x176F3DAb24a159341c0509bB36B833E7fdd0a132", "USDT Treasury", "team");
add(1, "0x47ac0Fb4F2D84898e4D9E7b4DaB3C24507a6D503", "Cumberland", "team");
add(1, "0x3DdfA8eC3052539b6C9549F12cEA2C295cfF5296", "Justin Sun 2", "whale");
add(1, "0xD4a605F1A4e5141df3DDD2f5da9F9b2a9E1B2a8b", "Andre Cronje", "whale");
add(1, "0xFE9e8709d3215310075d67E3ed32A380CCf451C8", "Beeple", "whale");
add(1, "0x983110309620D911731Ac0932219af06091b6744", "Brantly Millegan", "whale");
add(1, "0x35d8949372D46B7a3D5A56006AE77B215fc69bC0", "0x Maximus", "whale");
add(1, "0xab2A01BC351770D09611Ac80f1DE076D56E0487d", "Punk6529", "whale");
add(1, "0x8587d9f794F06d976C2eC1cFD523983B856F5ca9", "Cobie", "whale");
add(1, "0x9c34dF8Bf45e8a8E63c5f5e0Ad27d635A1d10Bb1", "Pranksy", "whale");

/* USDT/USDC issuers and well-known team wallets */
add(1, "0x55FE002aefF02F77364de339a1292923A15844B8", "Circle Treasury", "team");
add(1, "0x5754284f345afc66a98fbB0a0Afe71e0F007B949", "Tether Treasury", "team");

/* ═══ Lookup function ═══ */

export function getWalletLabel(
  chainId: number,
  address: string,
): WalletLabel | null {
  if (!address) return null;
  return LABELS[`${chainId}:${address.toLowerCase()}`] ?? null;
}

/** Quick category check used by the buy/sell classifier. */
export function getWalletCategory(
  chainId: number,
  address: string,
): WalletCategory | null {
  return getWalletLabel(chainId, address)?.category ?? null;
}
