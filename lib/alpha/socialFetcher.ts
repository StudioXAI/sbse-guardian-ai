/* ─────────────────────────────────────────────────────────────
   INFI MultiChain Social Fetcher
   - X (Twitter): https://x.com/INFI_MultiChain
   - LinkedIn: https://www.linkedin.com/company/infi-multichain-cdex/
   - X integration uses X API v2 if X_BEARER_TOKEN is configured
   - LinkedIn has no public API for company posts — we surface a
     direct link to the official page so users can follow it
   - 10-minute cache: social posts don't refresh that fast
   ───────────────────────────────────────────────────────────── */

import { TtlCache } from "./cache";
import type { SocialPost } from "./types";

const CACHE_TTL_MS = 10 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;

const cache = new TtlCache<SocialPost[]>(CACHE_TTL_MS);

const INFI_HANDLE = "INFI_MultiChain";
const INFI_X_URL = "https://x.com/INFI_MultiChain";
const INFI_LINKEDIN_URL =
  "https://www.linkedin.com/company/infi-multichain-cdex/";

interface XUser {
  id?: string;
  username?: string;
  name?: string;
}
interface XTweet {
  id?: string;
  text?: string;
  created_at?: string;
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
  };
}
interface XUserResp {
  data?: XUser;
}
interface XTweetsResp {
  data?: XTweet[];
}

function formatEngagement(t: XTweet): string {
  const m = t.public_metrics;
  if (!m) return "—";
  const parts: string[] = [];
  if (typeof m.like_count === "number") parts.push(`${m.like_count.toLocaleString()} likes`);
  if (typeof m.retweet_count === "number") parts.push(`${m.retweet_count.toLocaleString()} RT`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

async function fetchInfiTweets(): Promise<SocialPost[]> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    /* Step 1: resolve username -> user_id. */
    const userRes = await fetch(
      `https://api.twitter.com/2/users/by/username/${INFI_HANDLE}`,
      {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!userRes.ok) return [];
    const userJson = (await userRes.json()) as XUserResp;
    const userId = userJson.data?.id;
    const userName = userJson.data?.name ?? "INFI MultiChain";
    if (!userId) return [];

    /* Step 2: fetch latest tweets. */
    const tweetsRes = await fetch(
      `https://api.twitter.com/2/users/${userId}/tweets` +
        `?max_results=10&tweet.fields=created_at,public_metrics`,
      {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!tweetsRes.ok) return [];
    const tweetsJson = (await tweetsRes.json()) as XTweetsResp;
    const tweets = tweetsJson.data ?? [];

    return tweets.slice(0, 5).map((t, i) => ({
      id: t.id ?? `x-${i}`,
      platform: "x" as const,
      author: userName,
      authorHandle: `@${INFI_HANDLE}`,
      text: t.text ?? "",
      timestamp: t.created_at ? new Date(t.created_at).getTime() : Date.now(),
      engagement: formatEngagement(t),
      aiNote: "Live feed from @INFI_MultiChain — official ecosystem voice.",
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Fallback X card when no API token is configured — links to the real account. */
function xFallbackCard(): SocialPost[] {
  return [
    {
      id: "x-link",
      platform: "x",
      author: "INFI MultiChain",
      authorHandle: `@${INFI_HANDLE}`,
      text:
        "Live feed unavailable in this deployment. Tap to follow @INFI_MultiChain " +
        "directly for ecosystem announcements, InvertX countdown, and Launchpad alerts.",
      timestamp: Date.now(),
      aiNote: `Source: ${INFI_X_URL}`,
      sourceUrl: INFI_X_URL,
    },
  ];
}

/** LinkedIn has no public API for company posts. We surface a link card. */
function linkedinCard(): SocialPost[] {
  return [
    {
      id: "li-link",
      platform: "linkedin",
      author: "INFI MultiChain CDEX",
      authorRole: "Decentralized Liquidity Ecosystem",
      text:
        "LinkedIn does not expose a public posts API for company pages. " +
        "Tap to open the official INFI MultiChain LinkedIn page for institutional " +
        "updates, partnership announcements, and posts from CEO Laszlo Kellner.",
      timestamp: Date.now(),
      aiNote: `Source: ${INFI_LINKEDIN_URL}`,
      sourceUrl: INFI_LINKEDIN_URL,
    },
  ];
}

export async function fetchInfiSocial(): Promise<SocialPost[]> {
  const cached = cache.get("all");
  if (cached) return cached;

  const xPosts = await fetchInfiTweets();
  const all: SocialPost[] = [
    ...(xPosts.length > 0 ? xPosts : xFallbackCard()),
    ...linkedinCard(),
  ];

  cache.set("all", all);
  return all;
}

export const INFI_SOCIAL_URLS = {
  x: INFI_X_URL,
  linkedin: INFI_LINKEDIN_URL,
};
