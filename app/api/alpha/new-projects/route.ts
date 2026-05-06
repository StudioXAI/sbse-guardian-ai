/* ─────────────────────────────────────────────────────────────
   GET /api/alpha/new-projects

   Aggregates:
   - The new project scanner buffer (newly-deployed ERC-20s)
   - Socials enrichment from CoinGecko + DEX Screener
   - INFI verified-launch flags

   Returns a unified payload for the New Projects tab UI.
   ───────────────────────────────────────────────────────────── */

import { NextResponse } from "next/server";
import {
  scanNewProjects,
  type NewProject,
} from "@/lib/alpha/newProjectScanner";
import {
  getEnabledChains,
  getBlockNumber,
  type SupportedChain,
} from "@/lib/alpha/quicknodeClient";
import { enrichBatch } from "@/lib/alpha/socialsEnrichment";
import { isInfiVerified } from "@/lib/alpha/infiVerifiedLaunches";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface NewProjectsPayload {
  projects: NewProject[];
  chainsScanned: string[];
  unconfigured: boolean;
  scanStats: {
    totalCreations: number;
    totalTokens: number;
    perChain: Array<{
      chain: string;
      creations: number;
      tokens: number;
      blocksScanned: number;
    }>;
  };
  generatedAt: number;
}

export async function GET() {
  const chains = getEnabledChains();
  if (chains.length === 0) {
    const payload: NewProjectsPayload = {
      projects: [],
      chainsScanned: [],
      unconfigured: true,
      scanStats: {
        totalCreations: 0,
        totalTokens: 0,
        perChain: [],
      },
      generatedAt: Date.now(),
    };
    return NextResponse.json(payload);
  }

  /* Tip-block lookup — same pattern as threatTracker. */
  const tipBlocks = new Map<SupportedChain, number>();
  await Promise.all(
    chains.map(async (chain) => {
      const block = await getBlockNumber(chain);
      if (block !== null) tipBlocks.set(chain, block);
    }),
  );

  /* Run the scanner — returns the rolling buffer (not just this
     scan's findings) so the feed stays populated across refreshes. */
  const result = await scanNewProjects({ chains, tipBlocks });

  /* Enrich socials for projects that don't have them yet. The
     scanner doesn't enrich inline (would slow it down); we do it
     here as a separate step so the projects payload is built once
     and decorated. */
  const needsEnrichment = result.projects
    .filter((p) => !p.socials)
    .map((p) => ({ chainId: p.chainId, address: p.contractAddress }));
  const socialsMap = await enrichBatch(needsEnrichment);

  /* Mutate the projects in place — add socials and INFI verified flag. */
  const decorated = result.projects.map((p) => {
    const enriched = socialsMap.get(p.contractAddress.toLowerCase());
    const verified = isInfiVerified(p.chainId, p.contractAddress);
    return {
      ...p,
      socials: p.socials ?? enriched,
      infiVerified: verified,
    };
  });

  /* Sort: INFI-verified projects first, then by discovery time
     descending. Verified projects always lead the feed because
     they're the trust anchor and the conversion path. */
  decorated.sort((a, b) => {
    if (a.infiVerified !== b.infiVerified) {
      return a.infiVerified ? -1 : 1;
    }
    return b.discoveredAt - a.discoveredAt;
  });

  const payload: NewProjectsPayload = {
    projects: decorated,
    chainsScanned: chains,
    unconfigured: false,
    scanStats: {
      totalCreations: result.totalCreations,
      totalTokens: result.totalTokens,
      perChain: result.perChain,
    },
    generatedAt: Date.now(),
  };

  return NextResponse.json(payload);
}
